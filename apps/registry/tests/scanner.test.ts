/**
 * Scanner route tests.
 *
 * Covers the scan-results callback (POST) and the public security
 * summary endpoint (GET).
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../src/config.js', () => ({
  config: {
    scanner: {
      enabled: true,
      callbackSecret: 'test-secret-value',
    },
    storage: {
      type: 'local',
      path: '/tmp/test-storage',
      cloudfront: { urlExpirationSeconds: 900, domain: '', keyPairId: '' },
      s3: { bucket: '', region: '', accessKeyId: '', secretAccessKey: '' },
    },
    server: { nodeEnv: 'test', port: 3000, host: '0.0.0.0', corsOrigins: [] },
    clerk: { secretKey: '' },
    limits: { maxBundleSizeMB: 50 },
  },
  validateConfig: vi.fn(),
}));

vi.mock('../src/services/scanner.js', () => ({
  triggerSecurityScan: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  createMockPackageRepo,
  createMockPrisma,
  createMockStorage,
  mockPackage,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('Scanner Routes', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof createMockPrisma>;
  let packageRepo: ReturnType<typeof createMockPackageRepo>;

  beforeAll(async () => {
    prisma = createMockPrisma();
    packageRepo = createMockPackageRepo();

    app = Fastify({ logger: false });
    app.setReplySerializer((payload) => JSON.stringify(payload));
    await app.register(sensible);

    app.decorate('prisma', prisma);
    app.decorate('repositories', {
      packages: packageRepo,
      users: {},
      skills: {},
    });
    app.decorate('storage', createMockStorage());
    app.decorate('authenticate', async () => {});

    const { scannerRoutes, securityRoutes } = await import('../src/routes/scanner.js');
    await app.register(scannerRoutes);
    await app.register(securityRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // POST /scan-results
  // =========================================================================

  describe('POST /scan-results', () => {
    const validPayload = {
      scan_id: 'scan-123',
      status: 'completed' as const,
      risk_score: '2.5',
      report: {
        compliance: {
          level: 2,
          controls_passed: 20,
          controls_failed: 5,
          controls_total: 25,
        },
        findings: [
          { severity: 'high' },
          { severity: 'medium' },
          { severity: 'low' },
        ],
      },
    };

    it('rejects requests without callback secret', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/scan-results',
        payload: validPayload,
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects requests with wrong callback secret', async () => {
      // Must be same length for timingSafeEqual
      const res = await app.inject({
        method: 'POST',
        url: '/scan-results',
        headers: { 'x-callback-secret': 'wrong-secret-valu!' },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(401);
    });

    it('rejects requests with different-length secret', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/scan-results',
        headers: { 'x-callback-secret': 'short' },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(401);
    });

    it('returns success:false for unknown scan ID', async () => {
      prisma.securityScan.findUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/scan-results',
        headers: { 'x-callback-secret': 'test-secret-value' },
        payload: { scan_id: 'unknown', status: 'completed' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(false);
    });

    it('processes valid callback and updates scan with certification data', async () => {
      prisma.securityScan.findUnique.mockResolvedValue({
        id: 'db-scan-id',
        scanId: 'scan-123',
        status: 'scanning',
        versionId: 'ver-001',
      });
      prisma.securityScan.update.mockResolvedValue({});

      const res = await app.inject({
        method: 'POST',
        url: '/scan-results',
        headers: { 'x-callback-secret': 'test-secret-value' },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).success).toBe(true);

      expect(prisma.securityScan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { scanId: 'scan-123' },
          data: expect.objectContaining({
            status: 'completed',
            riskScore: '2.5',
            certificationLevel: 2,
            controlsPassed: 20,
            controlsFailed: 5,
            controlsTotal: 25,
          }),
        }),
      );
    });

    it('ignores callback for already-completed scan (idempotency)', async () => {
      prisma.securityScan.findUnique.mockResolvedValue({
        id: 'db-scan-id',
        scanId: 'scan-123',
        status: 'completed',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/scan-results',
        headers: { 'x-callback-secret': 'test-secret-value' },
        payload: { scan_id: 'scan-123', status: 'completed' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).success).toBe(true);
      expect(prisma.securityScan.update).not.toHaveBeenCalled();
    });

    it('ignores callback for already-failed scan (idempotency)', async () => {
      prisma.securityScan.findUnique.mockResolvedValue({
        id: 'db-scan-id',
        scanId: 'scan-456',
        status: 'failed',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/scan-results',
        headers: { 'x-callback-secret': 'test-secret-value' },
        payload: { scan_id: 'scan-456', status: 'completed' },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.securityScan.update).not.toHaveBeenCalled();
    });

    it('handles callback with null report (certification fields default to null)', async () => {
      prisma.securityScan.findUnique.mockResolvedValue({
        id: 'db-scan-id',
        scanId: 'scan-789',
        status: 'scanning',
      });
      prisma.securityScan.update.mockResolvedValue({});

      const res = await app.inject({
        method: 'POST',
        url: '/scan-results',
        headers: { 'x-callback-secret': 'test-secret-value' },
        payload: { scan_id: 'scan-789', status: 'completed' },
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.securityScan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            certificationLevel: null,
            controlsPassed: null,
            controlsFailed: null,
            controlsTotal: null,
          }),
        }),
      );
    });
  });

  // =========================================================================
  // GET /@:scope/:package/security
  // =========================================================================

  describe('GET /@:scope/:package/security', () => {
    it('returns security summary with scan data', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      prisma.packageVersion.findFirst.mockResolvedValue({
        id: 'ver-001',
        version: '1.0.0',
        securityScans: [
          {
            riskScore: '3.0',
            status: 'completed',
            completedAt: new Date('2024-06-01'),
            report: {
              findings: [
                { severity: 'high' },
                { severity: 'medium' },
                { severity: 'medium' },
              ],
            },
          },
        ],
      });

      const res = await app.inject({ method: 'GET', url: '/@test/mcp-server/security' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.risk_score).toBe('3.0');
      expect(body.status).toBe('completed');
      expect(body.summary.high_findings).toBe(1);
      expect(body.summary.medium_findings).toBe(2);
      expect(body.summary.total_findings).toBe(3);
    });

    it('returns pending status when no scans exist', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      prisma.packageVersion.findFirst.mockResolvedValue({
        id: 'ver-001',
        version: '1.0.0',
        securityScans: [],
      });

      const res = await app.inject({ method: 'GET', url: '/@test/mcp-server/security' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.status).toBe('pending');
      expect(body.summary).toBeNull();
      expect(body.scans).toBeNull();
    });

    it('returns 404 for unknown package', async () => {
      packageRepo.findByName.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/@test/nonexistent/security' });

      expect(res.statusCode).toBe(404);
    });

    it('returns 404 when version not found', async () => {
      packageRepo.findByName.mockResolvedValue(mockPackage);
      prisma.packageVersion.findFirst.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/@test/mcp-server/security' });

      expect(res.statusCode).toBe(404);
    });
  });
});
