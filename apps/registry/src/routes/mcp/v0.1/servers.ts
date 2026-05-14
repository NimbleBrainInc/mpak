/**
 * MCP Registry API routes — serves upstream `ServerDetail` shapes for
 * every package in the registry. Mounted at both `/v0.1/servers` (the
 * stable MCP Registry public API prefix) and `/v1/servers` (mpak's
 * `/v1/...` family for consumers that prefer the platform-versioned
 * URL space).
 *
 * Each `ServerDetail` is composed at request time from the bundle's
 * stored `manifest.json` (canonical authoring surface) plus mpak-side
 * registry data (downloads, provenance, certification, artifacts) by
 * `composeServerDetail`. The deprecated `PackageVersion.serverJson`
 * column is no longer read — server.json metadata is derived from the
 * manifest so bundles that drop their `server.json` file keep working.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  BundleDownloadParamsSchema,
  DownloadInfoSchema,
  resolveReverseDnsName,
  type BundleDownloadParams,
  type ServerDetail,
} from '@nimblebrain/mpak-schemas';
import { config } from '../../../config.js';
import { runInTransaction } from '../../../db/index.js';
import { NotFoundError } from '../../../errors/index.js';
import { toJsonSchema } from '../../../lib/zod-schema.js';
import type { PackageForServerLookup } from '../../../db/repositories/package.repository.js';
import { resolveArtifact } from '../../../services/artifact-resolver.js';
import { composeServerDetail } from '../../../services/server-detail-composer.js';

const REGISTRY_VERSION = 'v1.0.0';

/**
 * Project a security-scan row into the certification meta block carried
 * on `_meta["dev.mpak/registry"].certification`.
 */
function scanToCertification(
  scan: { certificationLevel: number | null; controlsPassed: number | null; controlsFailed: number | null; controlsTotal: number | null } | null,
):
  | {
      level: number;
      controlsPassed?: number | null;
      controlsFailed?: number | null;
      controlsTotal?: number | null;
    }
  | undefined {
  if (!scan || scan.certificationLevel == null) return undefined;
  return {
    level: scan.certificationLevel,
    controlsPassed: scan.controlsPassed,
    controlsFailed: scan.controlsFailed,
    controlsTotal: scan.controlsTotal,
  };
}

/**
 * Compose a `ServerDetail` from a fully-loaded package + version. The
 * latest completed scan is pre-joined into `version.securityScans` by
 * the repository methods, so this is pure CPU work — no DB round-trip.
 */
function buildServerDetail(
  pkg: PackageForServerLookup,
  version: PackageForServerLookup['versions'][number],
): ServerDetail | null {
  const scan = version.securityScans?.[0] ?? null;
  return composeServerDetail({
    pkg: {
      name: pkg.name,
      latestVersion: pkg.latestVersion,
      totalDownloads: pkg.totalDownloads,
      githubRepo: pkg.githubRepo,
    },
    version: {
      version: version.version,
      manifest: version.manifest,
      publishedAt: version.publishedAt,
      publishMethod: version.publishMethod,
      provenance: version.provenance,
      downloadCount: version.downloadCount,
    },
    artifacts: version.artifacts,
    certification: scanToCertification(scan),
  });
}

/**
 * Resolve a server `name` parameter to a Package row. The parameter
 * accepts both the npm-style scoped name (`@scope/pkg`) and the
 * reverse-DNS form (`ai.nimblebrain/echo`). Mechanical reverse-DNS
 * names map back to their npm origin via the documented rules; author
 * overrides via `manifest._meta["dev.mpak/registry"].name` resolve via
 * scan-then-match (cheap at current registry size; an indexed
 * `reverseDnsName` column would replace this when scale demands it).
 *
 * Names are lowercased before lookup — npm package names are
 * case-insensitive at the registry, and the stored `Package.name`
 * column is canonical-lowercase.
 */
async function resolveByName(
  fastify: FastifyInstance,
  rawName: string,
): Promise<PackageForServerLookup | null> {
  const { packages: packageRepo } = fastify.repositories;
  const decodedName = decodeURIComponent(rawName).toLowerCase();

  // Direct npm-style lookup — fastest path.
  const direct = await packageRepo.findPackageForServerLookup(decodedName);
  if (direct) return direct;

  // Reverse-DNS form: derive candidate npm names and try each.
  if (decodedName.includes('/') && !decodedName.startsWith('@')) {
    for (const candidate of reverseDnsToNpmCandidates(decodedName)) {
      const hit = await packageRepo.findPackageForServerLookup(candidate);
      if (hit) {
        // Confirm the package's resolved reverse-DNS name actually
        // matches the requested input — guards against same-suffix
        // collisions across orgs.
        const latest = hit.versions[0];
        if (!latest) continue;
        const manifestMeta =
          ((latest.manifest as Record<string, unknown> | null)?.['_meta'] as
            | Record<string, unknown>
            | undefined) ?? null;
        if (resolveReverseDnsName(hit.name, manifestMeta) === decodedName) {
          return hit;
        }
      }
    }
  }
  return null;
}

/**
 * Heuristic inverse of the mechanical reverse-DNS rule:
 *   `dev.mpak.<scope>/<name>` → `@<scope>/<name>`
 *   `ai.nimblebrain/<name>`   → `@nimblebraininc/<name>` (curated org map)
 *   `<other>/<name>`          → `@<other>/<name>` (best-effort fallback)
 */
function reverseDnsToNpmCandidates(reverseDns: string): string[] {
  const m = /^([a-zA-Z0-9.-]+)\/([a-zA-Z0-9._-]+)$/.exec(reverseDns);
  if (!m) return [];
  const namespace = (m[1] ?? '').toLowerCase();
  const name = (m[2] ?? '').toLowerCase();
  const out: string[] = [];
  // Mechanical default: dev.mpak.<scope>/<name>
  if (namespace.startsWith('dev.mpak.')) {
    out.push(`@${namespace.slice('dev.mpak.'.length)}/${name}`);
  } else if (namespace === 'dev.mpak') {
    out.push(name);
  }
  // Curated org overrides — keep aligned with ORG_REVERSE_DNS_MAP in schemas.
  if (namespace === 'ai.nimblebrain') {
    out.push(`@nimblebraininc/${name}`);
  }
  // Best-effort fallback: try the namespace's last segment as the npm scope.
  const lastSegment = namespace.split('.').pop();
  if (lastSegment && lastSegment !== namespace) {
    out.push(`@${lastSegment}/${name}`);
  }
  return out;
}

/**
 * Parse an integer query param, defaulting and clamping. NaN inputs
 * (garbage cursors / limits from a malformed query string) coerce to
 * the default rather than reaching Prisma where they'd error out.
 */
function parseIntParam(raw: string | undefined, defaultValue: number): number {
  if (raw === undefined) return defaultValue;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : defaultValue;
}

/** Parse `updated_since` query string to a Date, or null when absent / invalid. */
function parseUpdatedSince(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Build the route handlers shared between `/v0.1/servers` (MCP
 * Registry public API prefix) and `/v1/servers` (mpak `/v1/...`
 * family). Wrapped in a plugin so consumers can `fastify.register()`
 * each prefix independently.
 */
export const mcpRegistryRoutes: FastifyPluginAsync = async (fastify) => {
  const { packages: packageRepo } = fastify.repositories;

  // GET / - API info endpoint
  fastify.get('/', async () => {
    return {
      name: 'mpak MCP Registry API',
      version: REGISTRY_VERSION,
      endpoints: {
        listServers: '/servers',
        searchServers: '/servers/search',
        getServer: '/servers/{name}',
        getServerVersion: '/servers/{name}/versions/{version}',
        listServerVersions: '/servers/{name}/versions',
        health: '/health',
      },
      documentation: '/docs',
    };
  });

  // GET /servers - List servers (paginated)
  fastify.get<{
    Querystring: {
      cursor?: string;
      limit?: string;
      search?: string;
      updated_since?: string;
    };
  }>('/servers', {
    schema: {
      tags: ['mcp-registry'],
      description:
        'List MCP servers (each entry is a ServerDetail per the upstream MCP registry spec). Each item is the latest published version of a server; per-version listings live under /servers/{name}/versions.',
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string', description: 'Pagination cursor (offset as string)' },
          limit: { type: 'string', description: 'Maximum results (default 100, max 500)' },
          search: {
            type: 'string',
            description: 'Case-insensitive substring search on name/displayName/description',
          },
          updated_since: {
            type: 'string',
            description:
              'RFC 3339 timestamp. Returns servers with at least one version published since the given time. Filtered at the database; pagination math reflects the filter.',
          },
        },
      },
    },
  }, async (request) => {
    const limit = Math.min(parseIntParam(request.query.limit, 100), 500);
    const skip = parseIntParam(request.query.cursor, 0);
    const updatedSince = parseUpdatedSince(request.query.updated_since);

    const { packages, total } = await packageRepo.findPackagesForServerListing(
      {
        ...(request.query.search ? { search: request.query.search } : {}),
        ...(updatedSince ? { updatedSince } : {}),
      },
      { skip, take: limit },
    );

    const servers: ServerDetail[] = [];
    for (const pkg of packages) {
      const latest = pkg.versions[0];
      if (!latest) continue;
      const detail = buildServerDetail(pkg, latest);
      if (detail) servers.push(detail);
    }

    const response: { servers: ServerDetail[]; metadata: { count: number; next_cursor?: string } } =
      {
        servers,
        metadata: { count: servers.length },
      };
    const nextIdx = skip + limit;
    if (nextIdx < total) {
      response.metadata.next_cursor = String(nextIdx);
    }
    return response;
  });

  // GET /servers/search - alias for /servers, exposed under the conventional name
  fastify.get<{
    Querystring: { q?: string; limit?: string; cursor?: string };
  }>('/servers/search', {
    schema: {
      tags: ['mcp-registry'],
      description: 'Search MCP servers by substring on name, displayName, or description',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          limit: { type: 'string', description: 'Maximum results (default 100, max 500)' },
          cursor: { type: 'string', description: 'Pagination cursor (offset as string)' },
        },
      },
    },
  }, async (request) => {
    const limit = Math.min(parseIntParam(request.query.limit, 100), 500);
    const skip = parseIntParam(request.query.cursor, 0);
    const { packages, total } = await packageRepo.findPackagesForServerListing(
      request.query.q ? { search: request.query.q } : {},
      { skip, take: limit },
    );
    const servers: ServerDetail[] = [];
    for (const pkg of packages) {
      const latest = pkg.versions[0];
      if (!latest) continue;
      const detail = buildServerDetail(pkg, latest);
      if (detail) servers.push(detail);
    }
    const response: { servers: ServerDetail[]; metadata: { count: number; next_cursor?: string } } =
      {
        servers,
        metadata: { count: servers.length },
      };
    const nextIdx = skip + limit;
    if (nextIdx < total) {
      response.metadata.next_cursor = String(nextIdx);
    }
    return response;
  });

  // GET /servers/{name} - Latest ServerDetail for a server
  fastify.get<{
    Params: { name: string };
  }>('/servers/:name', {
    schema: {
      tags: ['mcp-registry'],
      description:
        'Get the latest ServerDetail for a server. Accepts both npm-style (@scope/name) and reverse-DNS forms.',
      params: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', description: 'URL-encoded server name' } },
      },
    },
  }, async (request, reply) => {
    const pkg = await resolveByName(fastify, request.params.name);
    if (!pkg) {
      reply.code(404);
      return { error: `Server '${decodeURIComponent(request.params.name)}' not found` };
    }
    const latest = pkg.versions[0];
    if (!latest) {
      reply.code(404);
      return { error: `Server '${pkg.name}' has no versions` };
    }
    const detail = buildServerDetail(pkg, latest);
    if (!detail) {
      reply.code(500);
      return { error: `Server '${pkg.name}' manifest could not be projected` };
    }
    return detail;
  });

  // GET /servers/{name}/versions/{version} - Version-specific ServerDetail
  fastify.get<{
    Params: { name: string; version: string };
  }>('/servers/:name/versions/:version', {
    schema: {
      tags: ['mcp-registry'],
      description: 'Get a version-specific ServerDetail. Use "latest" for the most recent version.',
      params: {
        type: 'object',
        required: ['name', 'version'],
        properties: {
          name: { type: 'string', description: 'URL-encoded server name' },
          version: { type: 'string', description: 'Server version, or "latest"' },
        },
      },
    },
  }, async (request, reply) => {
    const pkg = await resolveByName(fastify, request.params.name);
    if (!pkg) {
      reply.code(404);
      return { error: `Server '${decodeURIComponent(request.params.name)}' not found` };
    }
    const requestedVersion = request.params.version;
    const matchedVersion =
      requestedVersion === 'latest'
        ? pkg.versions[0]
        : pkg.versions.find((v) => v.version === requestedVersion);
    if (!matchedVersion) {
      reply.code(404);
      return { error: `Version '${requestedVersion}' not found for server '${pkg.name}'` };
    }
    const detail = buildServerDetail(pkg, matchedVersion);
    if (!detail) {
      reply.code(500);
      return {
        error: `Server '${pkg.name}' version '${matchedVersion.version}' manifest could not be projected`,
      };
    }
    return detail;
  });

  // GET /servers/{name}/versions - List all versions for a server
  fastify.get<{
    Params: { name: string };
  }>('/servers/:name/versions', {
    schema: {
      tags: ['mcp-registry'],
      description: 'List every version of a server (newest first).',
      params: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string', description: 'URL-encoded server name' } },
      },
    },
  }, async (request, reply) => {
    const pkg = await resolveByName(fastify, request.params.name);
    if (!pkg || pkg.versions.length === 0) {
      reply.code(404);
      return {
        error: `Server '${decodeURIComponent(request.params.name)}' not found`,
      };
    }
    return {
      name: pkg.name,
      versions: pkg.versions.map((v) => ({
        version: v.version,
        published_at: v.publishedAt,
        is_latest: v.version === pkg.latestVersion,
      })),
    };
  });

  // GET /servers/{name}/versions/{version}/download - Signed download
  // URL + bundle metadata. Mirrors the legacy
  // `/v1/bundles/.../download` shape so SDK consumers can swap base
  // paths without changing the response handling. The `Accept` header
  // selects JSON (CLI/API) vs an HTTP redirect (browser).
  fastify.get<{
    Params: { name: string; version: string };
    Querystring: BundleDownloadParams;
  }>('/servers/:name/versions/:version/download', {
    schema: {
      tags: ['mcp-registry'],
      description:
        'Resolve a server version to a signed CDN download URL plus the bundle\'s sha256+size. `os`+`arch` query params select per-platform artifacts; both required when either is set. Without them, returns the universal (any/any) artifact if one exists. Use "latest" as the version to alias the most recent published version.',
      params: {
        type: 'object',
        required: ['name', 'version'],
        properties: {
          name: { type: 'string', description: 'URL-encoded server name' },
          version: { type: 'string', description: 'Server version, or "latest"' },
        },
      },
      querystring: toJsonSchema(BundleDownloadParamsSchema),
      response: {
        200: toJsonSchema(DownloadInfoSchema),
        302: { type: 'null', description: 'Redirect to download URL' },
      },
    },
  }, async (request, reply) => {
    const { name: rawName, version: versionParam } = request.params;
    const { os: queryOs, arch: queryArch } = request.query;

    const pkg = await resolveByName(fastify, rawName);
    if (!pkg) {
      throw new NotFoundError(`Server '${decodeURIComponent(rawName)}' not found`);
    }

    // Resolve "latest" to the actual version (pkg.latestVersion).
    const resolvedVersion = versionParam === 'latest' ? pkg.latestVersion : versionParam;

    const { packages: packageRepo } = fastify.repositories;
    const packageVersion = await packageRepo.findVersionWithArtifacts(pkg.id, resolvedVersion);
    if (!packageVersion) {
      throw new NotFoundError(`Version '${resolvedVersion}' not found for server '${pkg.name}'`);
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
      version: resolvedVersion,
      platform,
      surface: 'servers',
    }, `download (servers): ${pkg.name}@${resolvedVersion} (${platform})`);

    // Best-effort download count bumps — failures get logged but never
    // block the response (mirrors the legacy /v1/bundles handler).
    void runInTransaction(async (tx) => {
      await packageRepo.incrementArtifactDownloads(artifact.id, tx);
      await packageRepo.incrementVersionDownloads(pkg.id, resolvedVersion, tx);
      await packageRepo.incrementDownloads(pkg.id, tx);
    }).catch((err: unknown) =>
      fastify.log.error({ err }, 'Failed to update download counts'),
    );

    const acceptHeader = request.headers.accept ?? '';
    const wantsJson = acceptHeader.includes('application/json');

    const downloadUrl = await fastify.storage.getSignedDownloadUrlFromPath(artifact.storagePath);

    if (wantsJson) {
      const expiresAt = new Date();
      expiresAt.setSeconds(
        expiresAt.getSeconds() + (config.storage.cloudfront.urlExpirationSeconds || 900),
      );
      return {
        url: downloadUrl,
        bundle: {
          name: pkg.name,
          version: resolvedVersion,
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
      const npmPart = pkg.name.startsWith('@') ? pkg.name.split('/')[1] ?? pkg.name : pkg.name;
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${npmPart}-${resolvedVersion}.mcpb"`)
        .send(fileBuffer);
    }
    return reply.code(302).redirect(downloadUrl);
  });

  // GET /health - Registry-specific health probe (counts servers).
  // The top-level /health route is the LB liveness probe with a
  // simpler `{ status: "ok" }` shape — kept distinct on purpose.
  fastify.get('/health', async () => {
    const { total } = await packageRepo.findPackagesForServerListing({}, { take: 0 });
    return {
      status: total > 0 ? 'healthy' : 'degraded',
      servers_count: total,
    };
  });
};
