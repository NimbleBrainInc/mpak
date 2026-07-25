/**
 * Storage plugin credential and boot contract.
 *
 * S3 credentials are resolved by the AWS SDK's default provider chain, not by
 * configuration this app reads. These assertions pin that boundary from both
 * sides: the client carries no credentials option, which is what keeps the
 * chain reachable, and a missing credential does not block boot, since a pod
 * authenticating by container or instance role has none to present.
 */

import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

const { s3ClientOptions } = vi.hoisted(() => ({
  s3ClientOptions: [] as Array<Record<string, unknown>>,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor(options: Record<string, unknown>) {
      s3ClientOptions.push(options);
    }
    send() {
      return Promise.resolve({});
    }
  },
  GetObjectCommand: class {},
  PutObjectCommand: class {},
  DeleteObjectCommand: class {},
}));

const s3Config = { bucket: '', region: '' };

vi.mock('../src/config.js', () => ({
  config: {
    storage: {
      get type() {
        return 's3';
      },
      path: './packages',
      get s3() {
        return s3Config;
      },
      cloudfront: { domain: '', keyPairId: '', privateKey: '', urlExpirationSeconds: 900 },
    },
  },
}));

const { storagePlugin } = await import('../src/plugins/storage.js');

async function register() {
  const app = Fastify();
  await app.register(storagePlugin);
  return app;
}

describe('storage plugin credential contract', () => {
  it('constructs the S3 client with no credentials option, leaving the SDK chain intact', async () => {
    s3ClientOptions.length = 0;
    s3Config.bucket = 'mpak-cdn';
    s3Config.region = 'us-east-1';

    const app = await register();

    expect(s3ClientOptions).toHaveLength(1);
    // Not `toHaveProperty`: an explicit `credentials: undefined` would still
    // pass that, and it is equally fatal to the chain.
    expect(Object.keys(s3ClientOptions[0])).not.toContain('credentials');
    expect(s3ClientOptions[0]).toMatchObject({ region: 'us-east-1' });

    await app.close();
  });
});

describe('storage plugin boot contract', () => {
  it('registers S3 storage without any credential configured', async () => {
    s3Config.bucket = 'mpak-cdn';
    s3Config.region = 'us-east-1';

    const app = await register();

    expect(app.storage).toBeDefined();
    await app.close();
  });

  it('rejects S3 storage with no bucket', async () => {
    s3Config.bucket = '';
    s3Config.region = 'us-east-1';

    await expect(register()).rejects.toThrow(/bucket/);
  });
});
