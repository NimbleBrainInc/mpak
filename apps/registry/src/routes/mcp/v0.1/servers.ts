/**
 * MCP Registry API v0.1 Routes
 *
 * DB-backed implementation: serves server.json metadata stored during
 * bundle announce, with dynamically populated `packages[]` from artifacts.
 *
 * All routes are prefixed with /v0.1
 */

import type { FastifyPluginAsync } from 'fastify';
import type { Artifact, PackageVersion } from '@prisma/client';
import type { MCPServerDetail, MCPServerListResponse, MCPRegistryMetadata } from '../../../types.js';

// Constants
const REGISTRY_VERSION = 'v0.1.0';

/**
 * Build the `packages[]` array for a server entry from its artifacts.
 * This populates the MCP Registry spec's package distribution info
 * dynamically from the registry's artifact data.
 */
function buildPackagesArray(
  packageName: string,
  version: PackageVersion & { artifacts: Artifact[] },
  serverJson: Record<string, unknown>
): unknown[] {
  if (!version.artifacts.length) return [];

  // Extract transport info from server.json _meta or default to stdio
  const meta = serverJson['_meta'] as Record<string, unknown> | undefined;
  const transportType = (meta?.['transport'] as string) ?? 'stdio';

  // Extract environment variables from server.json if present
  const envVars = serverJson['environment_variables'] as unknown[] | undefined;

  return version.artifacts.map((artifact) => ({
    registry_type: 'mcpb',
    name: packageName,
    version: version.version,
    environment_variables: envVars ?? [],
    package: {
      registry_name: 'mpak',
      name: packageName,
      version: version.version,
      file_sha256: artifact.digest.replace('sha256:', ''),
      file_size: Number(artifact.sizeBytes),
    },
    runtime: {
      type: transportType,
      ...(artifact.os !== 'any' || artifact.arch !== 'any'
        ? { platform: { os: artifact.os, arch: artifact.arch } }
        : {}),
    },
  }));
}

/**
 * Build a full MCPServerDetail from a version's stored server.json and DB data.
 */
function buildServerDetail(
  pkg: {
    id: string;
    name: string;
    latestVersion: string;
    description: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  },
  version: PackageVersion & { artifacts: Artifact[] },
  versionOverride?: string
): MCPServerDetail {
  const serverJson = (version.serverJson ?? {}) as Record<string, unknown>;

  // Start from the stored server.json as the base
  const server: MCPServerDetail = {
    ...serverJson,
    name: (serverJson['name'] as string) ?? pkg.name,
    version: versionOverride ?? (serverJson['version'] as string) ?? pkg.latestVersion,
    description: (serverJson['description'] as string) ?? pkg.description ?? '',
  };

  // Populate packages[] dynamically from artifacts
  server.packages = buildPackagesArray(pkg.name, version, serverJson);

  // Add registry metadata
  if (!server._meta) {
    server._meta = {};
  }

  const registryMeta: MCPRegistryMetadata = {
    serverId: pkg.name,
    versionId: version.id,
    publishedAt: (version.publishedAt ?? pkg.createdAt ?? new Date()).toISOString(),
    updatedAt: (pkg.updatedAt ?? new Date()).toISOString(),
    isLatest: version.version === pkg.latestVersion,
  };

  server._meta['io.modelcontextprotocol.registry/official'] = registryMeta;

  return server;
}

/**
 * MCP Registry v0.1 routes (DB-backed)
 *
 * Reads server.json metadata from PackageVersion records (populated during
 * bundle announce) and dynamically builds the `packages[]` array from
 * artifact data.
 */
export const mcpRegistryRoutes: FastifyPluginAsync = async (fastify) => {
  const { packages: packageRepo } = fastify.repositories;

  // GET /v0.1 - API info endpoint
  fastify.get('/', async () => {
    return {
      name: 'mpak MCP Registry API',
      version: REGISTRY_VERSION,
      endpoints: {
        listServers: '/v0.1/servers',
        getServer: '/v0.1/servers/{name}/versions/{version}',
        health: '/v0.1/health',
      },
      documentation: '/docs',
    };
  });

  // GET /v0.1/servers - List servers
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
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string', description: 'Pagination cursor' },
          limit: { type: 'string', description: 'Maximum number of results (default 100, max 500)' },
          search: { type: 'string', description: 'Case-insensitive search on server name' },
          version: { type: 'string', enum: ['latest'], description: 'Filter to latest versions only' },
          updated_since: { type: 'string', description: 'RFC3339 timestamp to filter recently updated servers' },
        },
      },
    },
  }, async (request) => {
    const limit = Math.min(parseInt(request.query.limit ?? '100', 10), 500);
    const skip = request.query.cursor ? parseInt(request.query.cursor, 10) : 0;

    const { packages, total } = await packageRepo.findPackagesWithServerJson(
      { search: request.query.search },
      { skip, take: limit }
    );

    // Build server details with dynamically populated packages[]
    // Each package here is guaranteed to have at least one version with serverJson
    let servers = packages
      .filter((pkg) => pkg.versions[0])
      .map((pkg) => buildServerDetail(pkg, pkg.versions[0]));

    // Apply updated_since filter (post-query since it depends on metadata)
    if (request.query.updated_since) {
      const sinceDate = new Date(request.query.updated_since);
      if (!isNaN(sinceDate.getTime())) {
        servers = servers.filter(s => {
          const meta = s._meta?.['io.modelcontextprotocol.registry/official'] as MCPRegistryMetadata | undefined;
          if (meta?.updatedAt) {
            return new Date(meta.updatedAt) >= sinceDate;
          }
          return true;
        });
      }
    }

    const response: MCPServerListResponse = {
      servers,
      metadata: {
        count: servers.length,
      },
    };

    // Add next cursor if there are more results
    const nextIdx = skip + limit;
    if (nextIdx < total && response.metadata) {
      response.metadata.next_cursor = String(nextIdx);
    }

    return response;
  });

  // GET /v0.1/servers/:name/versions/:version - Get server by name and version
  fastify.get<{
    Params: { name: string; version: string };
  }>('/servers/:name/versions/:version', {
    schema: {
      params: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Server name (URL-encoded)' },
          version: { type: 'string', description: 'Server version or "latest"' },
        },
        required: ['name', 'version'],
      },
    },
  }, async (request, reply) => {
    const decodedName = decodeURIComponent(request.params.name);

    const pkg = await packageRepo.findPackageWithServerJsonByName(decodedName);

    if (!pkg) {
      reply.code(404);
      return { error: `Server '${decodedName}' not found` };
    }

    // Find a version with serverJson
    const requestedVersion = request.params.version;

    if (requestedVersion === 'latest') {
      // Find the latest version that has serverJson
      const versionWithServerJson = pkg.versions.find(v => v.serverJson != null);
      if (!versionWithServerJson) {
        reply.code(404);
        return { error: `Server '${decodedName}' not found` };
      }
      return buildServerDetail(pkg, versionWithServerJson);
    }

    // Find the specific version
    const matchedVersion = pkg.versions.find(v => v.version === requestedVersion);
    if (!matchedVersion || !matchedVersion.serverJson) {
      reply.code(404);
      return { error: `Version '${requestedVersion}' not found for server '${decodedName}'` };
    }

    return buildServerDetail(pkg, matchedVersion, requestedVersion);
  });

  // GET /v0.1/servers/:name/versions - List all versions for a server
  fastify.get<{
    Params: { name: string };
  }>('/servers/:name/versions', {
    schema: {
      params: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Server name (URL-encoded)' },
        },
        required: ['name'],
      },
    },
  }, async (request, reply) => {
    const decodedName = decodeURIComponent(request.params.name);

    const pkg = await packageRepo.findPackageWithServerJsonByName(decodedName);

    // Check that at least one version has serverJson
    const hasServerJson = pkg?.versions.some(v => v.serverJson != null);
    if (!pkg || !hasServerJson) {
      reply.code(404);
      return { error: `Server '${decodedName}' not found` };
    }

    return {
      name: decodedName,
      versions: pkg.versions
        .filter(v => v.serverJson != null)
        .map(v => ({
          version: v.version,
          published_at: v.publishedAt,
          is_latest: v.version === pkg.latestVersion,
        })),
    };
  });

  // GET /v0.1/servers/:server_id - Legacy endpoint for backwards compatibility
  fastify.get<{
    Params: { server_id: string };
  }>('/servers/:server_id', {
    schema: {
      params: {
        type: 'object',
        properties: {
          server_id: { type: 'string' },
        },
        required: ['server_id'],
      },
    },
  }, async (request, reply) => {
    const decodedName = decodeURIComponent(request.params.server_id);

    const pkg = await packageRepo.findPackageWithServerJsonByName(decodedName);

    // Find latest version with serverJson
    const versionWithServerJson = pkg?.versions.find(v => v.serverJson != null);
    if (!pkg || !versionWithServerJson) {
      reply.code(404);
      return { error: `Server '${decodedName}' not found` };
    }

    return buildServerDetail(pkg, versionWithServerJson);
  });

  // GET /v0.1/health - Health check
  fastify.get('/health', async () => {
    const { total } = await packageRepo.findPackagesWithServerJson({}, { take: 0 });

    return {
      status: total > 0 ? 'healthy' : 'degraded',
      servers_count: total,
    };
  });
};
