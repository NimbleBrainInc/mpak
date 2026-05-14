import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { runInTransaction } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';
import { resolveArtifact } from './artifact-resolver.js';

/**
 * JSON payload returned to callers requesting `Accept: application/json`.
 * Matches the `DownloadInfoSchema` shape in `@nimblebrain/mpak-schemas`.
 */
export interface DownloadInfoPayload {
  url: string;
  bundle: {
    name: string;
    version: string;
    platform: { os: string; arch: string };
    sha256: string;
    size: number;
  };
  expires_at: string;
}

interface HandleArtifactDownloadOptions {
  fastify: FastifyInstance;
  request: FastifyRequest;
  reply: FastifyReply;
  /** Already-resolved package (lookup strategy varies per caller). */
  pkg: { id: string; name: string; latestVersion: string };
  /** Raw version path param; `"latest"` is resolved to `pkg.latestVersion`. */
  versionParam: string;
  queryOs?: string;
  queryArch?: string;
  /**
   * Used to build the `Content-Disposition` filename in the
   * local-storage stream branch (e.g. `echo` → `echo-1.0.0.mcpb`).
   */
  filenameBase: string;
  /**
   * Optional tag included on the download log entry so dashboards can
   * split traffic between the legacy `/v1/bundles` route and the new
   * `/servers/.../download` route.
   */
  logSurface?: string;
  /** Overrides the default "Version not found" 404 message. */
  versionNotFoundMessage?: string;
}

/**
 * Shared handler for the download endpoint body — resolves the
 * artifact for the requested platform, increments download counters,
 * and responds with either a JSON envelope (CLI/API) or a
 * stream/302 (browser) depending on the `Accept` header.
 *
 * The package lookup itself is caller-specific (npm-style direct
 * lookup on `/v1/bundles`, reverse-DNS-aware lookup on `/servers`),
 * so this function takes an already-resolved `pkg`.
 *
 * Returns the JSON payload for the API branch; in the browser branch
 * the response is written to `reply` and the returned `FastifyReply`
 * must be returned from the route handler so Fastify finalises it.
 */
export async function handleArtifactDownload(
  opts: HandleArtifactDownloadOptions,
): Promise<DownloadInfoPayload | FastifyReply> {
  const {
    fastify, request, reply, pkg, versionParam,
    queryOs, queryArch, filenameBase, logSurface,
    versionNotFoundMessage,
  } = opts;
  const { packages: packageRepo } = fastify.repositories;

  const version = versionParam === 'latest' ? pkg.latestVersion : versionParam;

  const packageVersion = await packageRepo.findVersionWithArtifacts(pkg.id, version);
  if (!packageVersion) {
    throw new NotFoundError(versionNotFoundMessage ?? `Version '${version}' not found`);
  }

  // resolveArtifact throws BadRequestError when only one of os/arch
  // is supplied — Fastify converts that into a 400.
  const artifact = resolveArtifact(packageVersion.artifacts, queryOs, queryArch);
  if (!artifact) {
    throw new NotFoundError('No artifact found for the requested platform');
  }

  const platform = artifact.os === 'any' ? 'universal' : `${artifact.os}-${artifact.arch}`;
  fastify.log.info({
    op: 'download',
    pkg: pkg.name,
    version,
    platform,
    ...(logSurface ? { surface: logSurface } : {}),
  }, `download${logSurface ? ` (${logSurface})` : ''}: ${pkg.name}@${version} (${platform})`);

  // Best-effort download count bumps — failures get logged but never
  // block the response.
  void runInTransaction(async (tx) => {
    await packageRepo.incrementArtifactDownloads(artifact.id, tx);
    await packageRepo.incrementVersionDownloads(pkg.id, version, tx);
    await packageRepo.incrementDownloads(pkg.id, tx);
  }).catch((err: unknown) =>
    fastify.log.error({ err }, 'Failed to update download counts'),
  );

  const downloadUrl = await fastify.storage.getSignedDownloadUrlFromPath(artifact.storagePath);

  const acceptHeader = request.headers.accept ?? '';
  const wantsJson = acceptHeader.includes('application/json');

  if (wantsJson) {
    const expiresAt = new Date();
    expiresAt.setSeconds(
      expiresAt.getSeconds() + (config.storage.cloudfront.urlExpirationSeconds || 900),
    );
    return {
      url: downloadUrl,
      bundle: {
        name: pkg.name,
        version,
        platform: { os: artifact.os, arch: artifact.arch },
        sha256: artifact.digest.replace('sha256:', ''),
        size: Number(artifact.sizeBytes),
      },
      expires_at: expiresAt.toISOString(),
    };
  }

  // Browser-style download: stream local files directly; redirect to
  // signed CDN URLs in S3/CloudFront mode.
  if (downloadUrl.startsWith('/')) {
    const fileBuffer = await fastify.storage.getBundle(artifact.storagePath);
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${filenameBase}-${version}.mcpb"`)
      .send(fileBuffer);
  }
  return reply.code(302).redirect(downloadUrl);
}
