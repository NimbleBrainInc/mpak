/**
 * Route-level tests for the MCP Registry endpoints (`/v0.1/servers`
 * and `/v1/servers`). The composer is unit-tested in
 * server-detail-composer.test.ts; this file covers the routing layer:
 * URL parsing, npm-style ↔ reverse-DNS resolution, pagination params,
 * 404 paths, the `updated_since` filter push-down, and the route's
 * use of the pre-joined security-scan column.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';

vi.mock('../src/config.js', () => ({
  config: {
    storage: {
      type: 'local',
      path: '/tmp/test-storage',
      cloudfront: { urlExpirationSeconds: 900, domain: '', keyPairId: '' },
      s3: { bucket: '', region: '', accessKeyId: '', secretAccessKey: '' },
    },
    scanner: { enabled: false, callbackSecret: 'test-secret' },
    server: { nodeEnv: 'test', port: 3000, host: '0.0.0.0', corsOrigins: [] },
    clerk: { secretKey: '' },
    limits: { maxBundleSizeMB: 50 },
  },
  validateConfig: vi.fn(),
}));

vi.mock('../src/db/index.js', () => ({
  runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  getPrismaClient: vi.fn(),
  disconnectDatabase: vi.fn(),
}));

import {
  createMockPackageRepo,
  mockArtifact,
  mockPackage,
  mockVersion,
} from './helpers.js';
import { errorHandler } from '../src/errors/middleware.js';

/**
 * Build a "lookup row" — Package + versions[] each carrying artifacts
 * and the (possibly empty) latest completed scan. Mirrors what the
 * repo's `findPackageForServerLookup` returns.
 */
function lookupRow(
  over: {
    pkg?: Partial<typeof mockPackage>;
    version?: Partial<typeof mockVersion>;
    securityScans?: unknown[];
  } = {},
) {
  const pkg = { ...mockPackage, ...over.pkg };
  const version = {
    ...mockVersion,
    ...over.version,
    artifacts: [mockArtifact],
    securityScans: over.securityScans ?? [],
  };
  return { ...pkg, versions: [version] };
}

describe('MCP Registry routes', () => {
  let app: FastifyInstance;
  let packageRepo: ReturnType<typeof createMockPackageRepo>;

  beforeAll(async () => {
    packageRepo = createMockPackageRepo();
    app = Fastify({ logger: false });
    app.setReplySerializer((payload) => JSON.stringify(payload));
    await app.register(sensible);
    app.setErrorHandler(errorHandler);

    app.decorate('repositories', {
      packages: packageRepo,
      users: {},
      skills: {},
    });

    const { mcpRegistryRoutes } = await import('../src/routes/mcp/v0.1/servers.js');
    await app.register(mcpRegistryRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /servers (list)
  // ─────────────────────────────────────────────────────────────────

  describe('GET /servers', () => {
    it('returns a ServerListResponse from the listing repo method', async () => {
      packageRepo.findPackagesForServerListing.mockResolvedValue({
        packages: [lookupRow()],
        total: 1,
      });

      const res = await app.inject({ method: 'GET', url: '/servers' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.servers).toHaveLength(1);
      expect(body.metadata.count).toBe(1);
      expect(body.metadata.next_cursor).toBeUndefined();
    });

    it('exposes next_cursor when more pages remain', async () => {
      packageRepo.findPackagesForServerListing.mockResolvedValue({
        packages: [lookupRow()],
        total: 250,
      });

      const res = await app.inject({ method: 'GET', url: '/servers?limit=100' });

      const body = JSON.parse(res.payload);
      expect(body.metadata.next_cursor).toBe('100');
    });

    it('passes search through to the repo', async () => {
      packageRepo.findPackagesForServerListing.mockResolvedValue({ packages: [], total: 0 });

      await app.inject({ method: 'GET', url: '/servers?search=echo' });

      expect(packageRepo.findPackagesForServerListing).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'echo' }),
        expect.any(Object),
      );
    });

    it('pushes updated_since into the repo as a Date (filter applied at DB, not in JS post-fetch)', async () => {
      packageRepo.findPackagesForServerListing.mockResolvedValue({ packages: [], total: 0 });

      await app.inject({
        method: 'GET',
        url: '/servers?updated_since=2026-04-01T00:00:00Z',
      });

      const callArgs = packageRepo.findPackagesForServerListing.mock.calls[0];
      expect(callArgs).toBeDefined();
      const filters = callArgs![0] as { updatedSince?: Date };
      expect(filters.updatedSince).toBeInstanceOf(Date);
      expect((filters.updatedSince as Date).toISOString()).toBe('2026-04-01T00:00:00.000Z');
    });

    it('ignores a malformed updated_since value (no-op filter)', async () => {
      packageRepo.findPackagesForServerListing.mockResolvedValue({ packages: [], total: 0 });

      await app.inject({ method: 'GET', url: '/servers?updated_since=not-a-date' });

      const filters = (packageRepo.findPackagesForServerListing.mock.calls[0]?.[0] ?? {}) as {
        updatedSince?: Date;
      };
      expect(filters.updatedSince).toBeUndefined();
    });

    it('coerces garbage cursor / limit values to defaults (no NaN reaches the repo)', async () => {
      packageRepo.findPackagesForServerListing.mockResolvedValue({ packages: [], total: 0 });

      await app.inject({ method: 'GET', url: '/servers?cursor=garbage&limit=also-garbage' });

      const opts = (packageRepo.findPackagesForServerListing.mock.calls[0]?.[1] ?? {}) as {
        skip: number;
        take: number;
      };
      expect(opts.skip).toBe(0);
      expect(opts.take).toBe(100);
    });

    it('clamps limit > 500 to 500', async () => {
      packageRepo.findPackagesForServerListing.mockResolvedValue({ packages: [], total: 0 });

      await app.inject({ method: 'GET', url: '/servers?limit=10000' });

      const opts = (packageRepo.findPackagesForServerListing.mock.calls[0]?.[1] ?? {}) as {
        take: number;
      };
      expect(opts.take).toBe(500);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /servers/search
  // ─────────────────────────────────────────────────────────────────

  describe('GET /servers/search', () => {
    it('forwards `q` to the listing repo', async () => {
      packageRepo.findPackagesForServerListing.mockResolvedValue({ packages: [], total: 0 });

      await app.inject({ method: 'GET', url: '/servers/search?q=echo' });

      expect(packageRepo.findPackagesForServerListing).toHaveBeenCalledWith(
        { search: 'echo' },
        expect.any(Object),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /servers/{name} — name resolution
  // ─────────────────────────────────────────────────────────────────

  describe('GET /servers/{name}', () => {
    it('resolves an npm-style name via the direct lookup', async () => {
      packageRepo.findPackageForServerLookup.mockResolvedValueOnce(lookupRow());

      const res = await app.inject({
        method: 'GET',
        url: '/servers/' + encodeURIComponent('@test/mcp-server'),
      });

      expect(res.statusCode).toBe(200);
      expect(packageRepo.findPackageForServerLookup).toHaveBeenCalledWith('@test/mcp-server');
    });

    it('lowercases the lookup name (npm names are case-insensitive at the registry)', async () => {
      packageRepo.findPackageForServerLookup.mockResolvedValueOnce(lookupRow());

      await app.inject({
        method: 'GET',
        url: '/servers/' + encodeURIComponent('@Test/MCP-Server'),
      });

      expect(packageRepo.findPackageForServerLookup).toHaveBeenCalledWith('@test/mcp-server');
    });

    it('resolves a reverse-DNS name to its npm-style origin via the candidate map', async () => {
      // First call (direct lookup with the reverse-DNS string itself) misses;
      // second call (candidate) hits.
      packageRepo.findPackageForServerLookup.mockImplementation(async (name: string) => {
        if (name === '@nimblebraininc/echo') {
          return lookupRow({
            pkg: { name: '@nimblebraininc/echo' },
            version: { manifest: { name: '@nimblebraininc/echo', version: '0.1.0' } },
          });
        }
        return null;
      });

      const res = await app.inject({
        method: 'GET',
        url: '/servers/' + encodeURIComponent('ai.nimblebrain/echo'),
      });

      expect(res.statusCode).toBe(200);
      // Two calls: first the direct (miss for "ai.nimblebrain/echo"), then
      // the candidate ("@nimblebraininc/echo") that hit.
      expect(packageRepo.findPackageForServerLookup).toHaveBeenCalledTimes(2);
    });

    it('returns 404 with the requested name in the message when the package is missing', async () => {
      packageRepo.findPackageForServerLookup.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/servers/' + encodeURIComponent('@missing/server'),
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toContain('@missing/server');
    });

    it('uses the pre-joined security scan (no extra repo call for findLatestCompletedScan)', async () => {
      packageRepo.findPackageForServerLookup.mockResolvedValueOnce(
        lookupRow({
          securityScans: [
            {
              certificationLevel: 1,
              controlsPassed: 15,
              controlsFailed: 1,
              controlsTotal: 16,
            },
          ],
        }),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/servers/' + encodeURIComponent('@test/mcp-server'),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const cert = body._meta['dev.mpak/registry'].certification;
      expect(cert).toEqual({
        level: 1,
        controlsPassed: 15,
        controlsFailed: 1,
        controlsTotal: 16,
      });
      // The route should NOT have made a separate scan lookup.
      expect(packageRepo.findLatestCompletedScan).not.toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /servers/{name}/versions/{version}
  // ─────────────────────────────────────────────────────────────────

  describe('GET /servers/{name}/versions/{version}', () => {
    it('returns the version-specific ServerDetail when the version exists', async () => {
      packageRepo.findPackageForServerLookup.mockResolvedValueOnce(
        lookupRow({ version: { version: '1.0.0' } }),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/servers/' + encodeURIComponent('@test/mcp-server') + '/versions/1.0.0',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.version).toBe('1.0.0');
    });

    it('treats "latest" as an alias for the most recent version', async () => {
      packageRepo.findPackageForServerLookup.mockResolvedValueOnce(lookupRow());

      const res = await app.inject({
        method: 'GET',
        url: '/servers/' + encodeURIComponent('@test/mcp-server') + '/versions/latest',
      });

      expect(res.statusCode).toBe(200);
    });

    it('404s when the version is unknown', async () => {
      packageRepo.findPackageForServerLookup.mockResolvedValueOnce(
        lookupRow({ version: { version: '1.0.0' } }),
      );

      const res = await app.inject({
        method: 'GET',
        url: '/servers/' + encodeURIComponent('@test/mcp-server') + '/versions/9.9.9',
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // GET /servers/{name}/versions
  // ─────────────────────────────────────────────────────────────────

  describe('GET /servers/{name}/versions', () => {
    it('lists the versions for a server', async () => {
      packageRepo.findPackageForServerLookup.mockResolvedValueOnce(lookupRow());

      const res = await app.inject({
        method: 'GET',
        url: '/servers/' + encodeURIComponent('@test/mcp-server') + '/versions',
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe('@test/mcp-server');
      expect(body.versions[0].version).toBe('1.0.0');
      expect(body.versions[0].is_latest).toBe(true);
    });
  });
});
