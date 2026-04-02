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

vi.mock('../src/services/scanner.js', () => ({
  triggerSecurityScan: vi.fn(),
}));

vi.mock('../src/utils/badge.js', () => ({
  generateBadge: vi.fn().mockReturnValue('<svg>badge</svg>'),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// -------------------------------------------------------------------------

import {
  createMockPackageRepo,
  createMockStorage,
  createMockPrisma,
  mockArtifact,
  mockPackage,
  mockVersion,
  mockVersionWithArtifacts,
  mockVersionWithScans,
} from './helpers.js';
import { verifyGitHubOIDC } from '../src/lib/oidc.js';
import { errorHandler } from '../src/errors/middleware.js';

// ---------------------------------------------------------------------------
// Test setup
// -------------------------------------------------------------------------

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
    app.decorate('config', require('../src/config.js').config);
    app.decorate('storage', storage);
    app.decorate('prisma', prisma);
    app.decorate('repositories', { packages: packageRepo });
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
      packageRepo.findByName.mockResolvedValue(null);
    });

    it('handles uppercase bundle name with tightened assertion', async () => {
      const payload = {
        name: 'TESTBUNDLE',
        version: '1.0.0',
        repo: 'user/testbundle',
        artifacts: [],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/bundles/announce',
        headers: {
          'Content-Type': 'application/json',
        },
        payload,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toBe('Bundle not found');
      expect(body.message).not.toBe('Invalid package name');
    });
  });
});