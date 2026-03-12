/**
 * Skill API route tests.
 *
 * Covers announce name-normalisation to prevent uppercase-scope regressions.
 * External dependencies (config, db, oidc, discord) are mocked so tests run
 * without a database or network access.
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

vi.mock('../src/utils/badge.js', () => ({
  generateBadge: vi.fn().mockReturnValue('<svg>badge</svg>'),
}));

vi.mock('../src/utils/skill-content.js', () => ({
  extractSkillContent: vi.fn().mockReturnValue('# Skill content'),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { createMockSkillRepo, createMockStorage, createMockPrisma } from './helpers.js';
import { verifyGitHubOIDC } from '../src/lib/oidc.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('Skill Routes', () => {
  let app: FastifyInstance;
  let skillRepo: ReturnType<typeof createMockSkillRepo>;
  let storage: ReturnType<typeof createMockStorage>;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeAll(async () => {
    skillRepo = createMockSkillRepo();
    storage = createMockStorage();
    prisma = createMockPrisma();

    app = Fastify({ logger: false });
    app.setReplySerializer((payload) => JSON.stringify(payload));
    await app.register(sensible);

    // Decorate with mocks
    app.decorate('repositories', {
      packages: {},
      users: {},
      skills: skillRepo,
    });
    app.decorate('storage', storage);
    app.decorate('prisma', prisma);

    const { skillRoutes } = await import('../src/routes/v1/skills.js');
    await app.register(skillRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // POST /announce  (validation / normalisation tests)
  // =========================================================================

  describe('POST /announce', () => {
    const validOIDCClaims = {
      repository: 'test-org/my-skill',
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
      name: '@test-org/my-skill',
      version: '1.0.0',
      skill: { name: 'my-skill', description: 'A test skill', metadata: {} },
      release_tag: 'v1.0.0',
      artifact: {
        filename: 'my-skill-1.0.0.skill',
        sha256: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        size: 512,
      },
    };

    it('rejects requests without authorization header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        payload: validPayload,
      });

      // Returns 400 (schema validation) or 401 — either way, the request is rejected
      expect([400, 401]).toContain(res.statusCode);
    });

    it('rejects invalid (non-scoped) skill name', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims);

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          name: 'no-scope-skill',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('normalises uppercase skill name to lowercase before validation', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue({
        ...validOIDCClaims,
        repository_owner: 'TestOrg',
        repository: 'TestOrg/my-skill',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          name: '@TestOrg/my-skill',
        },
      });

      // Should NOT fail with "Invalid skill name" — the name is normalised
      // to lowercase before the regex check. It will fail later (GitHub fetch),
      // but the validation gate must pass.
      const body = JSON.parse(res.payload);
      expect(body.error?.message ?? '').not.toContain('Invalid skill name');
    });

    it('normalises mixed-case scope for OIDC owner matching', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue({
        ...validOIDCClaims,
        repository_owner: 'MyOrg',
        repository: 'MyOrg/my-skill',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          name: '@MyOrg/my-skill',
        },
      });

      const body = JSON.parse(res.payload);
      expect(body.error?.message ?? '').not.toContain('Scope mismatch');
    });

    it('rejects scope mismatch between skill name and OIDC owner', async () => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(validOIDCClaims); // owner = test-org

      const res = await app.inject({
        method: 'POST',
        url: '/announce',
        headers: { authorization: 'Bearer valid-token' },
        payload: {
          ...validPayload,
          name: '@other-org/my-skill',
        },
      });

      // Handler returns the error as JSON via handleError
      const body = JSON.parse(res.payload);
      expect(body.error.message).toContain('Scope mismatch');
      expect(res.statusCode).toBe(401);
    });
  });
});
