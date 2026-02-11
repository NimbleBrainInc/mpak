import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { promises as fs } from 'fs';
import { createWriteStream } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';
import { config } from '../config.js';

export interface StorageService {
  saveBundle(scope: string, packageName: string, version: string, data: Buffer, platform?: string): Promise<{
    path: string;
    sha256: string;
    size: number;
  }>;
  saveBundleFromStream(
    scope: string,
    packageName: string,
    version: string,
    stream: Readable,
    sha256: string,
    size: number,
    platform?: string
  ): Promise<{ path: string; sha256: string; size: number }>;
  getBundle(storagePath: string): Promise<Buffer>;
  getBundleUrl(scope: string, packageName: string, version: string, platform?: string): string;
  getSignedDownloadUrl(scope: string, packageName: string, version: string, platform?: string): Promise<string>;
  getSignedDownloadUrlFromPath(storagePath: string): Promise<string>;
  deleteBundle(storagePath: string): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageService;
  }
}

class LocalStorageService implements StorageService {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async saveBundle(
    scope: string,
    packageName: string,
    version: string,
    data: Buffer,
    platform?: string
  ): Promise<{ path: string; sha256: string; size: number }> {
    const bundleDir = path.join(this.basePath, `@${scope}`, packageName, version);
    await fs.mkdir(bundleDir, { recursive: true });

    const filename = platform ? `${platform}.mcpb` : 'bundle.mcpb';
    const filePath = path.join(bundleDir, filename);
    await fs.writeFile(filePath, data);

    const sha256 = createHash('sha256').update(data).digest('hex');
    const size = data.length;
    const storagePath = path.join(`@${scope}`, packageName, version, filename);

    return { path: storagePath, sha256, size };
  }

  async getBundle(storagePath: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, storagePath);
    return await fs.readFile(fullPath);
  }

  getBundleUrl(scope: string, packageName: string, version: string, platform?: string): string {
    const base = `/app/packages/@${scope}/${packageName}/versions/${version}/download`;
    return platform ? `${base}?platform=${platform}` : base;
  }

  async getSignedDownloadUrl(scope: string, packageName: string, version: string, platform?: string): Promise<string> {
    return this.getBundleUrl(scope, packageName, version, platform);
  }

  async getSignedDownloadUrlFromPath(storagePath: string): Promise<string> {
    return `/app/storage/${storagePath}`;
  }

  async deleteBundle(storagePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, storagePath);
    await fs.unlink(fullPath);
  }

  async saveBundleFromStream(
    scope: string,
    packageName: string,
    version: string,
    stream: Readable,
    sha256: string,
    size: number,
    platform?: string
  ): Promise<{ path: string; sha256: string; size: number }> {
    const bundleDir = path.join(this.basePath, `@${scope}`, packageName, version);
    await fs.mkdir(bundleDir, { recursive: true });

    const filename = platform ? `${platform}.mcpb` : 'bundle.mcpb';
    const filePath = path.join(bundleDir, filename);

    await pipeline(stream, createWriteStream(filePath));

    const storagePath = path.join(`@${scope}`, packageName, version, filename);
    return { path: storagePath, sha256, size };
  }
}

class S3StorageService implements StorageService {
  private s3Client: S3Client;
  private bucket: string;

  constructor(bucket: string, region: string, accessKeyId: string, secretAccessKey: string) {
    this.bucket = bucket;
    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async saveBundle(
    scope: string,
    packageName: string,
    version: string,
    data: Buffer,
    platform?: string
  ): Promise<{ path: string; sha256: string; size: number }> {
    const filename = platform ? `${platform}.mcpb` : 'bundle.mcpb';
    const key = `packages/@${scope}/${packageName}/${version}/${filename}`;

    const sha256 = createHash('sha256').update(data).digest('hex');
    const size = data.length;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: 'application/octet-stream',
      Metadata: {
        sha256,
        scope,
        packageName,
        version,
        ...(platform ? { platform } : {}),
      },
    });

    await this.s3Client.send(command);

    const storagePath = path.join(`@${scope}`, packageName, version, filename);
    return { path: storagePath, sha256, size };
  }

  async getBundle(storagePath: string): Promise<Buffer> {
    const key = `packages/${storagePath}`;

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.s3Client.send(command);

    if (!response.Body) {
      throw new Error('Empty response body from S3');
    }

    const chunks: Uint8Array[] = [];
    const body = response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of body) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }

  getBundleUrl(scope: string, packageName: string, version: string, platform?: string): string {
    const filename = platform ? `${platform}.mcpb` : 'bundle.mcpb';
    const cloudfrontDomain = config.storage.cloudfront.domain;

    if (cloudfrontDomain) {
      return `https://${cloudfrontDomain}/packages/@${scope}/${packageName}/${version}/${filename}`;
    }

    const region = config.storage.s3.region;
    const bucket = this.bucket;
    return `https://${bucket}.s3.${region}.amazonaws.com/packages/@${scope}/${packageName}/${version}/${filename}`;
  }

  async getSignedDownloadUrl(scope: string, packageName: string, version: string, platform?: string): Promise<string> {
    const cloudfrontConfig = config.storage.cloudfront;

    if (!cloudfrontConfig.domain || !cloudfrontConfig.keyPairId) {
      return this.getBundleUrl(scope, packageName, version, platform);
    }

    let privateKey: string;

    if (cloudfrontConfig.privateKey) {
      privateKey = cloudfrontConfig.privateKey;
    } else if (cloudfrontConfig.privateKeyBase64) {
      privateKey = Buffer.from(cloudfrontConfig.privateKeyBase64, 'base64').toString('utf8');
    } else if (cloudfrontConfig.privateKeyPath) {
      privateKey = await fs.readFile(cloudfrontConfig.privateKeyPath, 'utf8');
    } else {
      return this.getBundleUrl(scope, packageName, version, platform);
    }

    const filename = platform ? `${platform}.mcpb` : 'bundle.mcpb';
    const url = `https://${cloudfrontConfig.domain}/packages/@${scope}/${packageName}/${version}/${filename}`;

    const expirationTime = new Date();
    expirationTime.setSeconds(expirationTime.getSeconds() + cloudfrontConfig.urlExpirationSeconds);

    const signedUrl = getSignedUrl({
      url,
      keyPairId: cloudfrontConfig.keyPairId,
      privateKey,
      dateLessThan: expirationTime.toISOString(),
    });

    return signedUrl;
  }

  async getSignedDownloadUrlFromPath(storagePath: string): Promise<string> {
    const cloudfrontConfig = config.storage.cloudfront;

    if (!cloudfrontConfig.domain || !cloudfrontConfig.keyPairId) {
      return `https://${this.bucket}.s3.${config.storage.s3.region}.amazonaws.com/packages/${storagePath}`;
    }

    let privateKey: string;

    if (cloudfrontConfig.privateKey) {
      privateKey = cloudfrontConfig.privateKey;
    } else if (cloudfrontConfig.privateKeyBase64) {
      privateKey = Buffer.from(cloudfrontConfig.privateKeyBase64, 'base64').toString('utf8');
    } else if (cloudfrontConfig.privateKeyPath) {
      privateKey = await fs.readFile(cloudfrontConfig.privateKeyPath, 'utf8');
    } else {
      return `https://${cloudfrontConfig.domain}/packages/${storagePath}`;
    }

    const url = `https://${cloudfrontConfig.domain}/packages/${storagePath}`;

    const expirationTime = new Date();
    expirationTime.setSeconds(expirationTime.getSeconds() + cloudfrontConfig.urlExpirationSeconds);

    const signedUrl = getSignedUrl({
      url,
      keyPairId: cloudfrontConfig.keyPairId,
      privateKey,
      dateLessThan: expirationTime.toISOString(),
    });

    return signedUrl;
  }

  async deleteBundle(storagePath: string): Promise<void> {
    const key = `packages/${storagePath}`;

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async saveBundleFromStream(
    scope: string,
    packageName: string,
    version: string,
    stream: Readable,
    sha256: string,
    size: number,
    platform?: string
  ): Promise<{ path: string; sha256: string; size: number }> {
    const filename = platform ? `${platform}.mcpb` : 'bundle.mcpb';
    const key = `packages/@${scope}/${packageName}/${version}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: stream,
      ContentLength: size,
      ContentType: 'application/octet-stream',
      Metadata: {
        sha256,
        scope,
        packageName,
        version,
        ...(platform ? { platform } : {}),
      },
    });

    await this.s3Client.send(command);

    const storagePath = path.join(`@${scope}`, packageName, version, filename);
    return { path: storagePath, sha256, size };
  }
}

const storagePlugin: FastifyPluginAsync = async (fastify) => {
  let storageService: StorageService;

  if (config.storage.type === 'local') {
    await fs.mkdir(config.storage.path, { recursive: true });
    storageService = new LocalStorageService(config.storage.path);
    fastify.log.info(`Using local storage at ${config.storage.path}`);
  } else {
    const { bucket, region, accessKeyId, secretAccessKey } = config.storage.s3;

    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      throw new Error('S3 storage requires bucket, region, accessKeyId, and secretAccessKey to be configured');
    }

    storageService = new S3StorageService(bucket, region, accessKeyId, secretAccessKey);
    fastify.log.info(`Using S3 storage with bucket: ${bucket} in region: ${region}`);
  }

  fastify.decorate('storage', storageService);
};

export default fp(storagePlugin);
export { storagePlugin };
