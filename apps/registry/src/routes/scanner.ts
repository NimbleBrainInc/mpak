/**
 * Scanner Routes
 *
 * Internal callback endpoint for scanner Jobs to report results
 * Public endpoints for viewing scan status and security badges
 */

import type { FastifyPluginAsync } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { toJsonSchema } from '../lib/zod-schema.js';
import { ForbiddenError, NotFoundError, UnauthorizedError, handleError } from '../errors/index.js';
import { triggerSecurityScan } from '../services/scanner.js';

// Callback request schema
const ScanCallbackSchema = z.object({
  scan_id: z.string(),
  status: z.enum(['completed', 'failed']),
  risk_score: z.string().optional(),
  report: z.record(z.string(), z.unknown()).optional(),
  report_s3_uri: z.string().optional(),
  pdf_s3_uri: z.string().optional(),
  error: z.string().optional(),
});

// Security summary response schema
const SecuritySummarySchema = z.object({
  risk_score: z.string().nullable(),
  status: z.string(),
  scanned_at: z.string().nullable(),
  summary: z.object({
    critical_findings: z.number(),
    high_findings: z.number(),
    medium_findings: z.number(),
    low_findings: z.number(),
    total_findings: z.number(),
  }).nullable(),
  scans: z.record(z.string(), z.object({
    status: z.string(),
    finding_count: z.number(),
  })).nullable(),
});

// Manual scan trigger request schema
const ScanTriggerSchema = z.object({
  packageName: z.string().regex(/^@[a-z0-9-]+\/[a-z0-9-]+$/, 'Must be scoped package name like @scope/name'),
  version: z.string().optional(),
});

type ScanCallback = z.infer<typeof ScanCallbackSchema>;
type SecuritySummary = z.infer<typeof SecuritySummarySchema>;
type ScanTrigger = z.infer<typeof ScanTriggerSchema>;

/**
 * Extract certification data from mpak-scanner report
 * The mpak-scanner outputs a structured report with compliance information
 */
interface CertificationData {
  certificationLevel: number | null;
  controlsPassed: number | null;
  controlsFailed: number | null;
  controlsTotal: number | null;
  findingsSummary: { critical: number; high: number; medium: number; low: number } | null;
}

function extractCertificationData(report: Record<string, unknown> | null): CertificationData {
  if (!report) {
    return {
      certificationLevel: null,
      controlsPassed: null,
      controlsFailed: null,
      controlsTotal: null,
      findingsSummary: null,
    };
  }

  // Extract compliance data from mpak-scanner report format
  const compliance = report['compliance'] as {
    level?: number;
    controls_passed?: number;
    controls_failed?: number;
    controls_total?: number;
  } | undefined;

  // Extract findings for summary
  const findings = report['findings'] as Array<{ severity?: string }> | undefined;
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  if (Array.isArray(findings)) {
    for (const finding of findings) {
      switch (finding.severity?.toLowerCase()) {
        case 'critical':
          critical++;
          break;
        case 'high':
          high++;
          break;
        case 'medium':
          medium++;
          break;
        case 'low':
          low++;
          break;
      }
    }
  }

  return {
    certificationLevel: compliance?.level ?? null,
    controlsPassed: compliance?.controls_passed ?? null,
    controlsFailed: compliance?.controls_failed ?? null,
    controlsTotal: compliance?.controls_total ?? null,
    findingsSummary: { critical, high, medium, low },
  };
}


/**
 * Extract finding counts from scan report
 */
function extractFindingCounts(report: Record<string, unknown> | null): {
  summary: SecuritySummary['summary'];
  scans: SecuritySummary['scans'];
} {
  if (!report) {
    return { summary: null, scans: null };
  }

  // First try mpak-scanner format (findings array at top level)
  const findings = report['findings'] as Array<{ severity?: string }> | undefined;
  if (Array.isArray(findings)) {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const finding of findings) {
      switch (finding.severity?.toLowerCase()) {
        case 'critical':
          critical++;
          break;
        case 'high':
          high++;
          break;
        case 'medium':
          medium++;
          break;
        case 'low':
          low++;
          break;
      }
    }

    // Extract domain-level scan status from mpak-scanner format
    const domains = report['domains'] as Record<string, { controls?: Record<string, { status?: string; findings?: unknown[] }> }> | undefined;
    const scans: Record<string, { status: string; finding_count: number }> = {};

    if (domains) {
      for (const [domainName, domain] of Object.entries(domains)) {
        if (domain.controls) {
          let domainFindings = 0;
          let domainStatus = 'pass';
          for (const control of Object.values(domain.controls)) {
            if (Array.isArray(control.findings)) {
              domainFindings += control.findings.length;
            }
            if (control.status === 'fail') {
              domainStatus = 'fail';
            }
          }
          scans[domainName] = {
            status: domainStatus,
            finding_count: domainFindings,
          };
        }
      }
    }

    return {
      summary: {
        critical_findings: critical,
        high_findings: high,
        medium_findings: medium,
        low_findings: low,
        total_findings: critical + high + medium + low,
      },
      scans: Object.keys(scans).length > 0 ? scans : null,
    };
  }

  // Fallback to legacy format
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  const scans: Record<string, { status: string; finding_count: number }> = {};

  // Process each scanner result (legacy format)
  const scanners = ['sbom', 'vulnerabilities', 'secrets', 'malware', 'static_analysis'];
  for (const scanner of scanners) {
    const result = report[scanner] as { status?: string; findings?: unknown[] } | undefined;
    if (result) {
      const findingCount = Array.isArray(result.findings) ? result.findings.length : 0;
      scans[scanner] = {
        status: result.status ?? 'unknown',
        finding_count: findingCount,
      };

      // Count severity levels from findings
      if (Array.isArray(result.findings)) {
        for (const finding of result.findings) {
          const f = finding as { severity?: string };
          switch (f.severity?.toLowerCase()) {
            case 'critical':
              critical++;
              break;
            case 'high':
              high++;
              break;
            case 'medium':
              medium++;
              break;
            case 'low':
              low++;
              break;
          }
        }
      }
    }
  }

  return {
    summary: {
      critical_findings: critical,
      high_findings: high,
      medium_findings: medium,
      low_findings: low,
      total_findings: critical + high + medium + low,
    },
    scans: Object.keys(scans).length > 0 ? scans : null,
  };
}

export const scannerRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /app/scan-results - Receive scan results from scanner Job
   *
   * Auth: X-Callback-Secret header must match SCANNER_CALLBACK_SECRET
   */
  fastify.post<{ Body: ScanCallback }>('/scan-results', {
    schema: {
      tags: ['scanner'],
      description: 'Receive scan results from scanner Job (internal)',
      body: toJsonSchema(ScanCallbackSchema),
      response: {
        200: toJsonSchema(z.object({ success: z.boolean() })),
      },
    },
    handler: async (request, reply) => {
      try {
        // Validate callback secret using constant-time comparison
        const secret = request.headers['x-callback-secret'];
        if (
          !config.scanner.callbackSecret ||
          typeof secret !== 'string' ||
          secret.length !== config.scanner.callbackSecret.length ||
          !timingSafeEqual(Buffer.from(secret), Buffer.from(config.scanner.callbackSecret))
        ) {
          throw new UnauthorizedError('Invalid callback secret');
        }

        const { scan_id, status, risk_score, report, report_s3_uri, pdf_s3_uri, error } = request.body;

        // Find the scan record
        const scan = await fastify.prisma.securityScan.findUnique({
          where: { scanId: scan_id },
        });

        if (!scan) {
          fastify.log.warn({ scanId: scan_id }, 'Received callback for unknown scan');
          return { success: false };
        }

        // Reject callbacks for already-completed scans (idempotency guard)
        if (scan.status === 'completed' || scan.status === 'failed') {
          fastify.log.warn({ scanId: scan_id, existingStatus: scan.status }, 'Received callback for already-finalized scan, ignoring');
          return { success: true };
        }

        // Extract certification data from mpak-scanner report
        const certData = extractCertificationData(report ?? null);

        // Update scan record with certification data
        await fastify.prisma.securityScan.update({
          where: { scanId: scan_id },
          data: {
            status,
            riskScore: risk_score ?? null,
            report: report ? (report as object) : undefined,
            reportS3Uri: report_s3_uri ?? null,
            pdfS3Uri: pdf_s3_uri ?? null,
            error: error ?? null,
            completedAt: new Date(),
            // Certification fields
            certificationLevel: certData.certificationLevel,
            controlsPassed: certData.controlsPassed,
            controlsFailed: certData.controlsFailed,
            controlsTotal: certData.controlsTotal,
            findingsSummary: certData.findingsSummary ?? undefined,
          },
        });

        fastify.log.info({
          scanId: scan_id,
          status,
          riskScore: risk_score,
          certificationLevel: certData.certificationLevel,
          controlsPassed: certData.controlsPassed,
        }, `Scan callback received: ${status}`);

        return { success: true };
      } catch (err) {
        return handleError(err, request, reply);
      }
    },
  });

  /**
   * POST /app/scan-trigger - Manually trigger a security scan
   *
   * Auth: Bearer token required, must have admin role
   */
  fastify.post<{ Body: ScanTrigger }>('/scan-trigger', {
    preHandler: fastify.authenticate,
    schema: {
      tags: ['scanner'],
      description: 'Manually trigger a security scan (admin only)',
      body: toJsonSchema(ScanTriggerSchema),
      response: {
        200: toJsonSchema(z.object({
          success: z.boolean(),
          scanId: z.string().optional(),
          message: z.string(),
        })),
      },
    },
    handler: async (request, reply) => {
      try {
        // Check admin role
        if (request.user?.metadata.role !== 'admin') {
          throw new ForbiddenError('Only admins can trigger manual scans');
        }

        const { packageName, version } = request.body;

        // Find the package
        const pkg = await fastify.prisma.package.findFirst({
          where: { name: packageName },
        });

        if (!pkg) {
          throw new NotFoundError(`Package ${packageName} not found`);
        }

        // Determine version to scan (default to latest)
        const targetVersion = version ?? pkg.latestVersion;
        if (!targetVersion) {
          throw new NotFoundError(`Package ${packageName} has no versions`);
        }

        // Find the package version with artifacts
        const pkgVersion = await fastify.prisma.packageVersion.findFirst({
          where: {
            packageId: pkg.id,
            version: targetVersion,
          },
          include: {
            artifacts: {
              take: 1, // Just need one artifact for the storagePath
            },
          },
        });

        if (!pkgVersion) {
          throw new NotFoundError(`Version ${targetVersion} not found for ${packageName}`);
        }

        const artifact = pkgVersion.artifacts[0];
        if (!artifact) {
          throw new NotFoundError(`No artifacts found for ${packageName}@${targetVersion}`);
        }

        // Check if a scan is already in progress (with 15-min expiry for stale scans)
        const scanTimeout = new Date(Date.now() - 15 * 60 * 1000);
        const existingScan = await fastify.prisma.securityScan.findFirst({
          where: {
            versionId: pkgVersion.id,
            status: { in: ['pending', 'scanning'] },
            startedAt: { gt: scanTimeout },
          },
        });

        if (existingScan) {
          return {
            success: false,
            scanId: existingScan.scanId,
            message: `Scan already in progress (status: ${existingScan.status})`,
          };
        }

        // Trigger the scan
        await triggerSecurityScan(fastify.prisma, {
          versionId: pkgVersion.id,
          bundleStoragePath: artifact.storagePath,
          packageName,
          version: targetVersion,
        });

        // Get the newly created scan
        const newScan = await fastify.prisma.securityScan.findFirst({
          where: { versionId: pkgVersion.id },
          orderBy: { startedAt: 'desc' },
        });

        fastify.log.info({
          packageName,
          version: targetVersion,
          scanId: newScan?.scanId,
          triggeredBy: request.user?.email,
        }, 'Manual scan triggered');

        return {
          success: true,
          scanId: newScan?.scanId,
          message: `Scan triggered for ${packageName}@${targetVersion}`,
        };
      } catch (err) {
        return handleError(err, request, reply);
      }
    },
  });
};

/**
 * Public security endpoints for v1 API
 */
export const securityRoutes: FastifyPluginAsync = async (fastify) => {
  const { packages: packageRepo } = fastify.repositories;

  /**
   * GET /v1/bundles/@:scope/:package/security - View latest scan
   */
  fastify.get<{
    Params: { scope: string; package: string };
    Reply: SecuritySummary;
  }>('/@:scope/:package/security', {
    schema: {
      tags: ['bundles', 'security'],
      description: 'Get security scan status for a bundle',
      params: toJsonSchema(z.object({
        scope: z.string(),
        package: z.string(),
      })),
      response: {
        200: toJsonSchema(SecuritySummarySchema),
      },
    },
    handler: async (request, reply) => {
      try {
        const { scope, package: pkgName } = request.params;
        const name = `@${scope}/${pkgName}`;

        // Get package with latest version
        const pkg = await packageRepo.findByName(name);
        if (!pkg) {
          throw new NotFoundError(`Package ${name} not found`);
        }

        // Get latest version
        const latestVersion = await fastify.prisma.packageVersion.findFirst({
          where: {
            packageId: pkg.id,
            version: pkg.latestVersion,
          },
          include: {
            securityScans: {
              orderBy: { startedAt: 'desc' },
              take: 1,
            },
          },
        });

        if (!latestVersion) {
          throw new NotFoundError(`Version ${pkg.latestVersion} not found`);
        }

        const scan = latestVersion.securityScans[0];

        if (!scan) {
          return {
            risk_score: null,
            status: 'pending',
            scanned_at: null,
            summary: null,
            scans: null,
          };
        }

        const { summary, scans } = extractFindingCounts(scan.report as Record<string, unknown> | null);

        return {
          risk_score: scan.riskScore,
          status: scan.status,
          scanned_at: scan.completedAt?.toISOString() ?? null,
          summary,
          scans,
        };
      } catch (err) {
        return handleError(err, request, reply);
      }
    },
  });

};
