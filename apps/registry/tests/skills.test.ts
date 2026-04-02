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
// -------------------------------------------------------------------------

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
// -------------------------------------------------------------------------

import { createMockSkillRepo, createMockStorage, createMockPrisma } from './helpers.js';
import { verifyGitHubOIDC } from '../src/lib/oidc.js';

// ---------------------------------------------------------------------------
// Test setup
// -------------------------------------------------------------------------

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
      skills: skillRepo
    });
    app.decorate('config', require('../src/config.js').config);
    app.decorate('storage', storage);
    app.decorate('prisma', prisma);
    await app.register(errorHandler);
    // Assume route registration here
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('announce', () => {
    beforeEach(() => {
      (verifyGitHubOIDC as Mock).mockResolvedValue(true);
      skillRepo.findByName.mockResolvedValue(null);
    });

    it('handles uppercase skill name with tightened assertion', async () => {
      const payload = {
        name: 'TESTSKILL',
        version: '1.0.0',
        repo: 'user/testskill',
        // other fields
      };

      const response = await app.inject({
        method: 'POST',
        url: '/skills/announce',
        headers: {
          'Content-Type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toBe('Skill not found');
      expect(body.message).not.toBe('Invalid skill name');
    });
  });
});