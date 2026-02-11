/**
 * Bundle API route tests.
 *
 * Covers search, detail, versions, download, and announce validation.
 * External dependencies (config, db, oidc, discord, scanner) are mocked
 * so tests run without a database or network access.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import type { Mock } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';

// ---------------------------------------------------------------------------
// Module mocks (hoisted before all imports)
// ---------------------------------------------------------------------------

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

vi.mock('../src/lib/oidc.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/oidc.js')>();
  return {
    ...actual,
    verifyGitHubOIDC: vi.fn(),
  };
});

vi.mock('../src/utils/discord.js', () => ({
  notifyDiscordAnnounce: vi.fn(),
}));

vi.mock('../src/services/scanner.js', () => ({
  triggerSecurityScan: vi.fn(),
}));

vi.mock('../src/utils/badge.js', () => ({
  generateBadge: vi.fn().mockReturnValue('<svg>badge</svg>'),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  createMockPackageRepo,
  createMockStorage,
  createMockPrisma,
  mockPackage,
  mockVersion,
  mockVersionWithArtifacts,
  mockVersionWithScans,
} from './helpers.js';
import { verifyGitHubOIDC } from '../src/lib/oidc.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('Bundle Routes', () => {
  let app: FastifyInstance;
  let packageRepo: ReturnType<typeof createMockPackageRepo>;
  let storage: ReturnType<typeof createMockStorage>;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeAll(async () => {
    packageRepo = createMockPackageRepo();
    storage = createMockStorage();
    prisma = createMockPrisma();

    app = Fastify({ logger: false });
    app.setReplySerializer((payload) => JSON.stringify(payload));
    await app.register(sensible);

    // Decorate with mocks
    app.decorate('repositories', {
      packages: packageRepo,
      users: {},
      skills: {},
    });
    app.decorate('storage', storage);
    app.decorate('prisma', prisma);

    const { bundleRoutes } = await import('../src/routes/v1/bundles.js');
    await app.register(bundleRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // GET /search
  // =========================================================================

  describe('GET /search', () => {
    it('returns search results with pagination', async () => {
      packageRepo.search.mockResolvedValue({ packages: [mockPackage], total: 1 });
      packageRepo.findVersionWithLatestScan.mockResolvedValue(mockVersionWithScans);

      const res = await app.inject({ method: 'GET', url: '/search?q=test' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.bundles).toHaveLength(1);
      expect(body.bundles[0].name).toBe('@test/mcp-server');
      expect(body.total).toBe(1);
      expect(body.pagination.has_more).toBe(false);
    });

    it('returns empty results for no matches', async () => {
      packageRepo.search.mockResolvedValue({ packages: [], total: 0 });

      const res = await app.inject({ method: 'GET', url: '/search?q=nonexistent' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.bundles).toHaveLength(0);
      expect(body.total).toBe(0);
    });

    it('clamps pagination limits to safe ranges', async () => {
      packageRepo.search.mockResolvedValue({ packages: [], total: 0 });

      // limit=0 should be clamped to 1, offset=-5 should be clamped to 0
      await app.inject({ method: 'GET', url: '/search?q=x&limit=0&offset=-5' });

      expect(packageRepo.search).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ take: 1, skip: 0 }),
      );
    });

    it('supports sort parameter', async () => {
      packageRepo.search.mockResolvedValue({ packages: [], total: 0 });

      await app.inject({ method: 'GET', url: '/search?q=x&sort=name' });

      expect(packageRepo.search).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });
  });

  // =========================================================================
  // GET /@:scope/:package (bundle detail)
  // =========================================================================

  describe('GET /@:scope/:package', () => {
    it('returns bundle detail', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      packageRepo.getVersions.mockResolvedValue([mockVersion]);
      packageRepo.findVersionWithLatestScan.mockResolvedValue(mockVersionWithScans);

      const res = await app.inject({ method: 'GET', url: '/@test/mcp-server' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe('@test/mcp-server');
      expect(body.latest_version).toBe('1.0.0');
      expect(body.versions).toHaveLength(1);
    });

    it('returns 404 for unknown bundle', async () => {
      packageRepo.findByName.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/@test/nonexistent' });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // GET /@:scope/:package/versions
  // =========================================================================

  describe('GET /@:scope/:package/versions', () => {
    it('lists versions with artifact counts', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      packageRepo.getVersionsWithArtifacts.mockResolvedValue([mockVersionWithArtifacts]);

      const res = await app.inject({ method: 'GET', url: '/@test/mcp-server/versions' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe('@test/mcp-server');
      expect(body.latest).toBe('1.0.0');
      expect(body.versions).toHaveLength(1);
      expect(body.versions[0].artifacts_count).toBe(1);
      expect(body.versions[0].platforms).toEqual([{ os: 'linux', arch: 'x64' }]);
    });

    it('returns 404 for unknown bundle', async () => {
      packageRepo.findByName.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/@test/nope/versions' });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // GET /@:scope/:package/versions/:version
  // =========================================================================

  describe('GET /@:scope/:package/versions/:version', () => {
    it('returns version detail with artifacts', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      packageRepo.findVersionWithArtifacts.mockResolvedValue(mockVersionWithArtifacts);

      const res = await app.inject({ method: 'GET', url: '/@test/mcp-server/versions/1.0.0' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe('@test/mcp-server');
      expect(body.version).toBe('1.0.0');
      expect(body.artifacts).toHaveLength(1);
      expect(body.artifacts[0].platform).toEqual({ os: 'linux', arch: 'x64' });
    });

    it('returns 404 for unknown version', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      packageRepo.findVersionWithArtifacts.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/@test/mcp-server/versions/9.9.9' });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // GET /@:scope/:package/versions/:version/download
  // =========================================================================

  describe('GET /@:scope/:package/versions/:version/download', () => {
    it('returns JSON download info when Accept: application/json', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      packageRepo.findVersionWithArtifacts.mockResolvedValue(mockVersionWithArtifacts);

      const res = await app.inject({
        method: 'GET',
        url: '/@test/mcp-server/versions/1.0.0/download',
        headers: { accept: 'application/json' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.url).toBe('https://cdn.example.com/signed');
      expect(body.bundle.name).toBe('@test/mcp-server');
      expect(body.bundle.version).toBe('1.0.0');
      expect(body.expires_at).toBeDefined();
    });

    it('resolves "latest" to the actual latest version', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      packageRepo.findVersionWithArtifacts.mockResolvedValue(mockVersionWithArtifacts);

      const res = await app.inject({
        method: 'GET',
        url: '/@test/mcp-server/versions/latest/download',
        headers: { accept: 'application/json' },
      });

      expect(res.statusCode).toBe(200);
      expect(packageRepo.findVersionWithArtifacts).toHaveBeenCalledWith('pkg-001', '1.0.0');
    });

    it('returns 404 when no artifact exists', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      packageRepo.findVersionWithArtifacts.mockResolvedValue({
        ...mockVersion,
        artifacts: [],
      });

      const res = await app.inject({
        method: 'GET',
        url: '/@test/mcp-server/versions/1.0.0/download',
        headers: { accept: 'application/json' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 for unknown bundle', async () => {
      packageRepo.findByName.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/@test/nope/versions/1.0.0/download',
        headers: { accept: 'application/json' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // POST /announce  (validation only, no external HTTP calls)
  // =========================================================================

  describe('POST /announce', () => {
    const validOIDCClaims = {
      repository: 'test-org/mcp-server',
      repository_owner: 'test-org',
      repository_owner_id: '12345',
      workflow: '.github/workflows/publish.yml',
      workflow_ref: 'ref',
      ref: 'refs/tags/v1.0.0',
      ref_type: 'tag',
      sha: 'abc123',
      actor: 'bot',
      actor_id: '1',
      run_id: '1',
      run_number: '1',
      run_attempt: '1',
      event_name: 'release',
      job_workflow_ref: 'ref',
    };

    const validPayload = {
      name: '@test-org/mcp-server',
      version: '1.0.0',
      manifest: { server: { type: 'node' }, description: 'Test' },
      release_tag: 'v1.0.0',
      artifact: {
        filename: 'server-linux-x64.mcpb',
        os: 'linux',
        arch: 'x64',
        sha256: 'deadbeef',
        size: 1024,
      },
    };

    it('rejects requests without authorization header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        payload: validPayload,
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects invalid OIDC token', async () => {
      (verifyGitHubOIDC as Mock).mockRejectedValue(new Error('Token expired'));

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer expired-token' },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects filename with path separators', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims);

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          artifact: { ...validPayload.artifact, filename: '../etc/passwd.mcpb' },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('path separator');
    });

    it('rejects filename with directory traversal', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims);

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          artifact: { ...validPayload.artifact, filename: 'foo..bar.mcpb' },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('..');
    });

    it('rejects filename without .mcpb extension', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims);

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          artifact: { ...validPayload.artifact, filename: 'server.tar.gz' },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('.mcpb');
    });

    it('rejects invalid artifact OS', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims);

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          artifact: { ...validPayload.artifact, os: 'freebsd' },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('os');
    });

    it('rejects invalid artifact arch', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims);

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          artifact: { ...validPayload.artifact, arch: 'mips' },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('arch');
    });

    it('rejects scope mismatch between package name and OIDC owner', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims); // owner = test-org

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          name: '@other-org/mcp-server', // different scope
        },
      });

      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('Scope mismatch');
    });

    it('rejects invalid (non-scoped) package name', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims);

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          name: 'no-scope-package',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects manifest without server type', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims);

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          manifest: { description: 'missing server type' },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('server type');
    });
  });
});
