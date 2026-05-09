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
import type { Artifact, Package, PackageVersion, SecurityScan } from '@prisma/client';
import { composeServerDetail } from '../../../services/server-detail-composer.js';
import { resolveReverseDnsName } from '@nimblebrain/mpak-schemas';
import type { ServerDetail } from '@nimblebrain/mpak-schemas';

const REGISTRY_VERSION = 'v1.0.0';

type PackageWithVersions = Package & {
  versions: (PackageVersion & { artifacts: Artifact[] })[];
};

/**
 * Project a security-scan row into the certification meta block carried
 * on `_meta["dev.mpak/registry"].certification`.
 */
function scanToCertification(scan: SecurityScan | null): {
  level: number;
  levelName?: string | null;
  controlsPassed?: number | null;
  controlsFailed?: number | null;
  controlsTotal?: number | null;
} | undefined {
  if (!scan || scan.certificationLevel == null) return undefined;
  return {
    level: scan.certificationLevel,
    controlsPassed: scan.controlsPassed,
    controlsFailed: scan.controlsFailed,
    controlsTotal: scan.controlsTotal,
  };
}

async function buildServerDetailWithScan(
  fastify: FastifyInstance,
  pkg: PackageWithVersions,
  version: PackageVersion & { artifacts: Artifact[] },
): Promise<ServerDetail | null> {
  const { packages: packageRepo } = fastify.repositories;
  const scan = await packageRepo.findLatestCompletedScan(version.id);
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
 */
async function resolveByName(
  fastify: FastifyInstance,
  rawName: string,
): Promise<PackageWithVersions | null> {
  const { packages: packageRepo } = fastify.repositories;
  const decodedName = decodeURIComponent(rawName);

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
      version?: string;
      updated_since?: string;
    };
  }>('/servers', {
    schema: {
      tags: ['mcp-registry'],
      description: 'List MCP servers (each entry is a ServerDetail per the upstream MCP registry spec)',
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string', description: 'Pagination cursor (offset as string)' },
          limit: { type: 'string', description: 'Maximum results (default 100, max 500)' },
          search: { type: 'string', description: 'Case-insensitive substring search on name/displayName/description' },
          version: { type: 'string', enum: ['latest'], description: 'Filter to latest versions only' },
          updated_since: { type: 'string', description: 'RFC 3339 timestamp filter for recently updated servers' },
        },
      },
    },
  }, async (request) => {
    const limit = Math.min(parseInt(request.query.limit ?? '100', 10), 500);
    const skip = request.query.cursor ? parseInt(request.query.cursor, 10) : 0;

    const { packages, total } = await packageRepo.findPackagesForServerListing(
      { search: request.query.search },
      { skip, take: limit }
    );

    const servers: ServerDetail[] = [];
    for (const pkg of packages) {
      const latest = pkg.versions[0];
      if (!latest) continue;
      const detail = await buildServerDetailWithScan(fastify, pkg, latest);
      if (detail) servers.push(detail);
    }

    let filtered = servers;
    if (request.query.updated_since) {
      const sinceDate = new Date(request.query.updated_since);
      if (!Number.isNaN(sinceDate.getTime())) {
        filtered = servers.filter((s) => {
          const meta = s._meta?.['dev.mpak/registry'] as Record<string, unknown> | undefined;
          const publishedAt = meta?.['published_at'];
          if (typeof publishedAt === 'string') {
            return new Date(publishedAt) >= sinceDate;
          }
          return true;
        });
      }
    }

    const response: { servers: ServerDetail[]; metadata: { count: number; next_cursor?: string } } = {
      servers: filtered,
      metadata: { count: filtered.length },
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
    const limit = Math.min(parseInt(request.query.limit ?? '100', 10), 500);
    const skip = request.query.cursor ? parseInt(request.query.cursor, 10) : 0;
    const { packages, total } = await packageRepo.findPackagesForServerListing(
      { search: request.query.q },
      { skip, take: limit }
    );
    const servers: ServerDetail[] = [];
    for (const pkg of packages) {
      const latest = pkg.versions[0];
      if (!latest) continue;
      const detail = await buildServerDetailWithScan(fastify, pkg, latest);
      if (detail) servers.push(detail);
    }
    const response: { servers: ServerDetail[]; metadata: { count: number; next_cursor?: string } } = {
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
      description: 'Get the latest ServerDetail for a server. Accepts both npm-style (@scope/name) and reverse-DNS forms.',
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
    const detail = await buildServerDetailWithScan(fastify, pkg, latest);
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
    const detail = await buildServerDetailWithScan(fastify, pkg, matchedVersion);
    if (!detail) {
      reply.code(500);
      return { error: `Server '${pkg.name}' version '${matchedVersion.version}' manifest could not be projected` };
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

  // GET /health - Health check
  fastify.get('/health', async () => {
    const { total } = await packageRepo.findPackagesForServerListing({}, { take: 0 });
    return {
      status: total > 0 ? 'healthy' : 'degraded',
      servers_count: total,
    };
  });
};
