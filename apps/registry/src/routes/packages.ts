import AdmZip from 'adm-zip';
import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { runInTransaction } from '../db/index.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  handleError,
} from '../errors/index.js';
import { toJsonSchema } from '../lib/zod-schema.js';
import type { PackageSearchParams } from '../schemas/generated/package.js';
import {
  PublishResponseSchema,
  PackageSearchResponseSchema,
  PackageDetailSchema,
  InternalDownloadResponseSchema,
  ClaimStatusResponseSchema,
  ClaimResponseSchema,
  MyPackagesResponseSchema,
  UnclaimedPackagesResponseSchema,
} from '../schemas/generated/api-responses.js';
import { generateMpakJsonExample } from '../schemas/mpak-schema.js';
import { extractScannerVersion } from '../utils/scanner-version.js';
import { fetchGitHubRepoStats, parseGitHubRepo, verifyPackageClaim } from '../services/github-verifier.js';
import { validateManifest } from '../services/manifest-validator.js';
import { triggerSecurityScan } from '../services/scanner.js';
import type { MCPBManifest } from '../types.js';

// Package name validation
const UNSCOPED_REGEX = /^[a-z0-9][a-z0-9-]{0,213}$/;
const SCOPED_REGEX = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9-]{0,213}$/;

function parsePackageName(name: string): { scope: string | null; packageName: string; isScoped: boolean } {
  if (name.startsWith('@')) {
    const parts = name.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      return {
        scope: parts[0].substring(1), // Remove @
        packageName: parts[1],
        isScoped: true,
      };
    }
  }
  return {
    scope: null,
    packageName: name,
    isScoped: false,
  };
}

function isValidPackageName(name: string): boolean {
  return UNSCOPED_REGEX.test(name) || SCOPED_REGEX.test(name);
}

export const packageRoutes: FastifyPluginAsync = async (fastify) => {
  const { packages: packageRepo } = fastify.repositories;

  // PUT /app/packages - Publish a package
  fastify.put('/', {
    schema: {
      tags: ['packages'],
      description: 'Publish a new package version',
      security: [{ bearerAuth: [] }],
      consumes: ['multipart/form-data'],
      response: {
        200: toJsonSchema(PublishResponseSchema),
      },
    },
    preHandler: fastify.authenticate,
    handler: async (request, reply) => {
      try {
        const user = request.user!;

        // Get the uploaded file
        const data = await request.file();
        if (!data) {
          throw new BadRequestError('No file uploaded');
        }

        // Read file into buffer
        const buffer = await data.toBuffer();

        // Verify it's a valid zip file and extract manifest
        let manifest: MCPBManifest;
        try {
          const zip = new AdmZip(buffer);
          const manifestEntry = zip.getEntry('manifest.json');

          if (!manifestEntry) {
            throw new BadRequestError('Package must contain manifest.json');
          }

          const manifestContent = manifestEntry.getData().toString('utf8');
          manifest = JSON.parse(manifestContent) as MCPBManifest;
        } catch (error) {
          if (error instanceof BadRequestError) throw error;
          throw new BadRequestError('Invalid package format or manifest.json');
        }

        // Validate manifest
        const validation = validateManifest(manifest);
        if (!validation.valid) {
          throw new ValidationError('Invalid manifest', { errors: validation.errors });
        }

        // Extract name and version from manifest
        const packageName = manifest.name;
        const version = manifest.version;

        if (!packageName || !version) {
          throw new BadRequestError('Manifest must contain name and version');
        }

        // Validate package name format
        if (!isValidPackageName(packageName)) {
          throw new BadRequestError(
            `Invalid package name: "${packageName}". Must match pattern for scoped (@scope/name) or unscoped (name) packages.`
          );
        }

        const { scope, packageName: parsedPackageName, isScoped } = parsePackageName(packageName);

        // SECURITY: All packages must be scoped to prevent namespace squatting
        if (!isScoped || !scope) {
          throw new BadRequestError(
            'All packages must be scoped (e.g., @username/package-name). Unscoped packages are not allowed.'
          );
        }

        // Extract server_type from manifest (supports both nested server.type and flat server_type)
        const manifestRecord = manifest as unknown as Record<string, unknown>;
        const serverObj = manifestRecord['server'] as Record<string, unknown> | undefined;
        const serverType = (serverObj?.['type'] as string) ?? (manifestRecord['server_type'] as string);

        if (!serverType) {
          throw new BadRequestError('Manifest must contain server type (server.type or server_type)');
        }

        // PRE-CHECK: Verify ownership and version availability BEFORE uploading
        const existingPackage = await packageRepo.findByName(packageName);

        if (existingPackage) {
          // Check if package has been claimed - only the claimer can publish new versions
          if (existingPackage.claimedBy && existingPackage.claimedBy !== user.userId) {
            throw new ForbiddenError('This package has been claimed by another user. You cannot publish to it.');
          }

          // Check if this version already exists
          const existingVersion = await packageRepo.findVersion(existingPackage.id, version);
          if (existingVersion) {
            throw new ConflictError(`Version ${version} already exists. Cannot overwrite existing versions.`);
          }
        }

        // Extract and parse GitHub repository URL from manifest
        let githubRepo: string | undefined;
        if (manifest.repository?.url) {
          const parsed = parseGitHubRepo(manifest.repository.url);
          if (parsed) {
            githubRepo = `${parsed.owner}/${parsed.repo}`;
          }
        }

        // Auto-verify and claim if GitHub repo exists and mpak.json is valid (BEFORE transaction)
        let claimedBy: string | undefined;
        let claimedAt: Date | undefined;
        let wasAutoClaimed = false;

        if (githubRepo && user.githubUsername) {
          try {
            const verification = await verifyPackageClaim(
              packageName,
              githubRepo,
              user.githubUsername
            );

            if (verification.verified) {
              // Automatically claim the package
              claimedBy = user.userId;
              claimedAt = new Date();
              wasAutoClaimed = true;
              fastify.log.info(`Auto-claimed package ${packageName} for user ${user.githubUsername}`);
            } else {
              // Log verification failure but continue with unclaimed package
              fastify.log.info(`Package ${packageName} not auto-claimed: ${verification.error}`);
            }
          } catch (error) {
            // If verification fails, just log and continue with unclaimed package
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            fastify.log.warn(`Failed to verify mpak.json for ${packageName}: ${errorMsg}`);
          }
        }

        // Upload to storage ONLY AFTER verifying version doesn't exist
        const { path: storagePath, sha256, size } = await fastify.storage.saveBundle(
          scope,
          parsedPackageName,
          version,
          buffer
        );

        // Use transaction to ensure atomicity
        let result;
        try {
          result = await runInTransaction(async (tx) => {
            let packageId: string;

            if (existingPackage) {
              // Update existing package
              packageId = existingPackage.id;
              await packageRepo.updateLatestVersion(packageId, version, tx);
            } else {
              // Create new package (unclaimed by default, even if published by a user)
              const pkg = await packageRepo.create({
                name: packageName,
                displayName: manifest.display_name ?? undefined,
                description: manifest.description ?? undefined,
                authorName: manifest.author?.name ?? undefined,
                authorEmail: manifest.author?.email ?? undefined,
                authorUrl: manifest.author?.url ?? undefined,
                homepage: manifest.homepage ?? undefined,
                license: manifest.license ?? undefined,
                iconUrl: manifest.icon ?? undefined,
                serverType,
                verified: false,
                latestVersion: version,
                // Do NOT set createdBy - packages are unclaimed by default
                githubRepo,
                claimedBy,
                claimedAt,
              }, tx);

              packageId = pkg.id;
            }

            // Create package version record
            const packageVersion = await packageRepo.createVersion({
              packageId,
              version,
              manifest,
              publishedBy: user.userId,
              publishedByEmail: user.email,
              publishMethod: 'upload',
            }, tx);

            // Create artifact for universal bundle
            await packageRepo.createArtifact({
              versionId: packageVersion.id,
              os: 'any',
              arch: 'any',
              digest: `sha256:${sha256}`,
              sizeBytes: BigInt(size),
              storagePath,
              sourceUrl: '', // Direct upload, no source URL
            }, tx);

            return { packageId, versionId: packageVersion.id, sha256, size, githubRepo, wasAutoClaimed };
          });
        } catch (error) {
          // Transaction failed - clean up uploaded file
          try {
            await fastify.storage.deleteBundle(storagePath);
            fastify.log.info(`Cleaned up uploaded file after transaction failure: ${storagePath}`);
          } catch (cleanupError) {
            fastify.log.error({ err: cleanupError, path: storagePath }, 'Failed to cleanup uploaded file');
          }

          // Re-throw to let global error handler sanitize and handle
          throw error;
        }

        // Fetch GitHub stats asynchronously (non-blocking)
        if (result.githubRepo) {
          fetchGitHubRepoStats(result.githubRepo).then((stats) => {
            if (stats) {
              packageRepo.updateGitHubStats(result.packageId, stats).catch((err: unknown) =>
                fastify.log.error({ err }, 'Failed to update GitHub stats')
              );
            }
          }).catch((err: unknown) =>
            fastify.log.error({ err }, 'Failed to fetch GitHub stats')
          );
        }

        // Non-blocking security scan trigger
        if (config.scanner.enabled && result.versionId) {
          triggerSecurityScan(fastify.prisma, {
            versionId: result.versionId,
            bundleStoragePath: storagePath,
            packageName,
            version,
          }).catch((err: unknown) => fastify.log.error({ err }, 'Failed to trigger security scan'));
        }

        // Return success response
        const downloadUrl = fastify.storage.getBundleUrl(
          scope,
          parsedPackageName,
          version
        );

        const response: Record<string, unknown> = {
          success: true,
          package: {
            name: packageName,
            version: manifest.version,
            manifest,
          },
          sha256: result.sha256,
          size: result.size,
          url: downloadUrl,
        };

        // Include auto-claim info if package was claimed during publish
        if (result.wasAutoClaimed) {
          response['auto_claimed'] = true;
          response['message'] = 'Package published and automatically claimed based on mpak.json verification';
        }

        return response;
      } catch (error) {
        // Let the global error handler handle it
        return handleError(error, request, reply);
      }
    },
  });

  // GET /app/packages - Search/list packages
  fastify.get('/', {
    schema: {
      tags: ['packages'],
      description: 'Search and list packages',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          type: { type: 'string', description: 'Filter by server type' },
          sort: { type: 'string', enum: ['downloads', 'recent', 'name'], default: 'downloads' },
          limit: { type: 'string', default: '20' },
          offset: { type: 'string', default: '0' },
        },
      },
      response: {
        200: toJsonSchema(PackageSearchResponseSchema),
      },
    },
    handler: async (request) => {
    const {
      q,
      type,
      sort = 'downloads',
      limit = '20',
      offset = '0',
    } = request.query as PackageSearchParams;

    // Convert query params to numbers
    const limitNum = parseInt(String(limit), 10) || 20;
    const offsetNum = parseInt(String(offset), 10) || 0;

    // Build filters
    const filters: Record<string, unknown> = {};
    if (q) filters['query'] = q;
    if (type) filters['serverType'] = type;

    // Build sort options
    let orderBy: Record<string, string> = { totalDownloads: 'desc' };
    if (sort === 'recent') {
      orderBy = { createdAt: 'desc' };
    } else if (sort === 'name') {
      orderBy = { name: 'asc' };
    }

    // Search packages
    const startTime = Date.now();
    const { packages, total } = await packageRepo.search(
      filters,
      {
        skip: offsetNum,
        take: limitNum,
        orderBy,
      }
    );

    fastify.log.info({
      op: 'search',
      query: q ?? null,
      type: type ?? null,
      sort,
      results: total,
      ms: Date.now() - startTime,
    }, `search: q="${q ?? '*'}" returned ${total} results`);

    // Get package versions with tools info and certification
    const packagesWithDetails = await Promise.all(
      packages.map(async (pkg) => {
        const latestVersion = await packageRepo.findVersionWithLatestScan(pkg.id, pkg.latestVersion);
        const manifest = (latestVersion?.manifest ?? {}) as Record<string, unknown>;
        const scan = latestVersion?.securityScans?.[0];

        return {
          name: pkg.name,
          display_name: pkg.displayName,
          description: pkg.description,
          author: pkg.authorName ? { name: pkg.authorName } : null,
          latest_version: pkg.latestVersion,
          icon: pkg.iconUrl,
          server_type: pkg.serverType,
          tools: (manifest['tools'] as unknown[]) ?? [],
          downloads: Number(pkg.totalDownloads),
          published_at: latestVersion?.publishedAt ?? pkg.createdAt,
          verified: pkg.verified,
          claimable: pkg.claimedBy === null,
          claimed: pkg.claimedBy !== null,
          github: pkg.githubRepo ? {
            repo: pkg.githubRepo,
            stars: pkg.githubStars,
            forks: pkg.githubForks,
            watchers: pkg.githubWatchers,
          } : null,
          certification_level: scan?.certificationLevel ?? null,
        };
      })
    );

    return {
      packages: packagesWithDetails,
      total,
    };
    },
  });

  // GET /app/packages/@{scope}/{package} - Get package info (scoped packages only)
  fastify.get('/@:scope/:package', {
    schema: {
      tags: ['packages'],
      description: 'Get detailed package information',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
        },
        required: ['scope', 'package'],
      },
      response: {
        200: toJsonSchema(PackageDetailSchema),
      },
    },
    handler: async (request) => {
    const { scope, package: packageName } = request.params as { scope: string; package: string };
    const name = `@${scope}/${packageName}`;

    const pkg = await packageRepo.findByName(name);

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    // Refresh GitHub stats if stale (>24h) - async, non-blocking
    if (pkg.githubRepo) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const isStale = !pkg.githubUpdatedAt || pkg.githubUpdatedAt < oneDayAgo;

      if (isStale) {
        fetchGitHubRepoStats(pkg.githubRepo).then((stats) => {
          if (stats) {
            packageRepo.updateGitHubStats(pkg.id, stats).catch((err: unknown) =>
              fastify.log.error({ err }, 'Failed to update GitHub stats')
            );
          }
        }).catch((err: unknown) =>
          fastify.log.error({ err }, 'Failed to fetch GitHub stats')
        );
      }
    }

    // Get all versions with artifacts and security scans
    const versionsWithArtifactsAndScans = await packageRepo.getVersionsWithArtifactsAndScans(pkg.id);

    // Get latest version manifest
    const latestVersion = versionsWithArtifactsAndScans.find(v => v.version === pkg.latestVersion);
    const manifest = (latestVersion?.manifest ?? {}) as Record<string, unknown>;

    // Check claiming status
    const isClaimable = pkg.claimedBy === null;

    // Helper to get certification level name
    const getCertificationLevelName = (level: number | null): string | null => {
      switch (level) {
        case 0: return 'None';
        case 1: return 'Basic';
        case 2: return 'Standard';
        case 3: return 'Verified';
        case 4: return 'Attested';
        default: return null;
      }
    };

    // Display names for security domains
    const DOMAIN_DISPLAY_NAMES: Record<string, string> = {
      supply_chain: 'Supply Chain',
      code_quality: 'Code Quality',
      artifact_integrity: 'Artifact Integrity',
      provenance: 'Provenance',
      capability_declaration: 'Capability Declaration',
    };

    // Human-readable control names
    const CONTROL_NAMES: Record<string, string> = {
      'AI-01': 'Valid Manifest',
      'AI-02': 'File Hashes',
      'SC-01': 'SBOM Generation',
      'SC-02': 'Vulnerability Scan',
      'SC-03': 'Dependency Pinning',
      'CQ-01': 'Secret Detection',
      'CQ-02': 'Malicious Pattern Scan',
      'CQ-03': 'Static Analysis',
      'CQ-06': 'Slopsquat Detection',
      'PR-01': 'Repository Declaration',
      'PR-02': 'Author Verification',
      'CD-01': 'Tool Declaration',
      'CD-02': 'Permission Declaration',
      'CD-03': 'Safety Declaration',
    };

    // Severity sort order (lower = higher priority)
    const SEVERITY_ORDER: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      info: 4,
    };

    // Helper to transform security scan for API response
    const transformSecurityScan = (scan: Record<string, unknown>) => {
      if (!scan) return null;

      const report = scan['report'] as Record<string, unknown> | undefined;
      const scans = (report?.['scans'] ?? {}) as Record<string, unknown>;

      // Calculate summary from scan results
      const sbomFindings = ((scans['sbom'] as Record<string, unknown>)?.['findings'] ?? []) as unknown[];
      const vulnFindings = ((scans['vulnerability'] as Record<string, unknown>)?.['findings'] ?? []) as Array<Record<string, unknown>>;
      const secretFindings = ((scans['secrets'] as Record<string, unknown>)?.['findings'] ?? []) as unknown[];
      const maliciousFindings = ((scans['malicious'] as Record<string, unknown>)?.['findings'] ?? []) as unknown[];
      const staticFindings = ((scans['static_analysis'] as Record<string, unknown>)?.['findings'] ?? []) as unknown[];

      // Count vulnerabilities by severity
      const vulnCounts = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const f of vulnFindings) {
        const sev = (f['severity'] as string | undefined)?.toLowerCase();
        if (sev === 'critical') vulnCounts.critical++;
        else if (sev === 'high') vulnCounts.high++;
        else if (sev === 'medium') vulnCounts.medium++;
        else if (sev === 'low') vulnCounts.low++;
      }

      // Transform domains from report
      const reportDomains = report?.['domains'] as Record<string, Record<string, unknown>> | undefined;
      let domains: Record<string, unknown> | undefined;
      if (reportDomains) {
        domains = {};
        for (const [domainKey, domain] of Object.entries(reportDomains)) {
          const controls = domain['controls'] as Record<string, Record<string, unknown>> | undefined;
          let controlsPassed = 0;
          let controlsTotal = 0;
          const transformedControls: Record<string, unknown> = {};

          if (controls) {
            for (const [controlId, control] of Object.entries(controls)) {
              const status = control['status'] as string;
              controlsTotal++;
              if (status === 'pass') controlsPassed++;
              transformedControls[controlId] = {
                status,
                name: CONTROL_NAMES[controlId] || controlId,
                findings_count: ((control['findings'] as unknown[]) ?? []).length,
              };
            }
          }

          domains[domainKey] = {
            display_name: DOMAIN_DISPLAY_NAMES[domainKey] || domainKey,
            controls_passed: controlsPassed,
            controls_total: controlsTotal,
            controls: transformedControls,
          };
        }
      }

      // Transform and sort findings from report (exclude info severity)
      const reportFindings = (report?.['findings'] as Array<Record<string, unknown>>) ?? [];
      const findings = reportFindings
        .filter((f) => (f['severity'] as string) !== 'info')
        .sort((a, b) => (SEVERITY_ORDER[a['severity'] as string] ?? 4) - (SEVERITY_ORDER[b['severity'] as string] ?? 4))
        .map((f) => ({
          id: f['id'] as string,
          control: f['control'] as string,
          severity: f['severity'] as string,
          title: f['title'] as string,
          description: f['description'] as string,
          file: (f['file'] as string) ?? null,
          line: (f['line'] as number) ?? null,
          remediation: (f['remediation'] as string) ?? null,
        }));

      // Extract scanner version from report metadata
      const scannerVersion = extractScannerVersion(report);

      return {
        status: scan['status'],
        risk_score: scan['riskScore'],
        scanned_at: scan['completedAt'],
        scanner_version: scannerVersion,
        certification: scan['certificationLevel'] !== null ? {
          level: scan['certificationLevel'],
          level_name: getCertificationLevelName(scan['certificationLevel'] as number | null),
          controls_passed: scan['controlsPassed'],
          controls_failed: scan['controlsFailed'],
          controls_total: scan['controlsTotal'],
        } : null,
        summary: {
          components: ((report?.['sbom'] as Record<string, unknown>)?.['component_count'] as number)
            ?? sbomFindings.filter((f) => (f as Record<string, unknown>)['purl']).length,
          vulnerabilities: vulnCounts,
          secrets: secretFindings.length,
          malicious: maliciousFindings.length,
          code_issues: staticFindings.length,
        },
        domains: domains || undefined,
        findings: findings.length > 0 ? findings : undefined,
      };
    };

    return {
      name: pkg.name,
      display_name: pkg.displayName,
      description: pkg.description,
      author: pkg.authorName ? { name: pkg.authorName } : null,
      latest_version: pkg.latestVersion,
      icon: pkg.iconUrl,
      server_type: pkg.serverType,
      tools: (manifest['tools'] as unknown[]) ?? [],
      downloads: Number(pkg.totalDownloads),
      published_at: pkg.createdAt,
      verified: pkg.verified,
      homepage: pkg.homepage,
      license: pkg.license,
      claiming: {
        claimable: isClaimable,
        claimed: pkg.claimedBy !== null,
        claimed_by: pkg.claimedBy,
        claimed_at: pkg.claimedAt,
        github_repo: pkg.githubRepo,
      },
      github: pkg.githubRepo ? {
        repo: pkg.githubRepo,
        stars: pkg.githubStars,
        forks: pkg.githubForks,
        watchers: pkg.githubWatchers,
        updated_at: pkg.githubUpdatedAt,
      } : null,
      versions: versionsWithArtifactsAndScans.map((v) => ({
        version: v.version,
        published_at: v.publishedAt,
        downloads: Number(v.downloadCount),
        readme: v.readme,
        release_url: v.releaseUrl,
        prerelease: v.prerelease,
        manifest: v.manifest,
        provenance: v.publishMethod ? {
          publish_method: v.publishMethod,
          repository: v.provenanceRepository,
          sha: v.provenanceSha,
        } : null,
        artifacts: v.artifacts.map((a) => ({
          os: a.os,
          arch: a.arch,
          size_bytes: Number(a.sizeBytes),
          digest: a.digest,
          downloads: Number(a.downloadCount),
        })),
        security_scan: v.securityScans[0] ? transformSecurityScan(v.securityScans[0] as unknown as Record<string, unknown>) : null,
      })),
    };
    },
  });

  // GET /app/packages/@{scope}/{package}/versions/latest/download - Redirect to latest version
  fastify.get('/@:scope/:package/versions/latest/download', {
    schema: {
      tags: ['packages'],
      description: 'Download the latest version of a package (redirects)',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
        },
        required: ['scope', 'package'],
      },
    },
    handler: async (request, reply) => {
    const { scope, package: packageName } = request.params as {
      scope: string;
      package: string;
    };
    const name = `@${scope}/${packageName}`;

    // Get package
    const pkg = await packageRepo.findByName(name);

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    // Redirect to the actual latest version
    const latestVersionUrl = `/app/packages/@${scope}/${packageName}/versions/${pkg.latestVersion}/download`;

    // Use 302 (temporary redirect) so CDN/browsers don't cache permanently
    // This ensures they always check for the latest version
    return reply.code(302).redirect(latestVersionUrl);
    },
  });

  // GET /app/packages/@{scope}/{package}/versions/{version}/download - Download package
  fastify.get('/@:scope/:package/versions/:version/download', {
    schema: {
      tags: ['packages'],
      description: 'Download a specific version of a package',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
          version: { type: 'string' },
        },
        required: ['scope', 'package', 'version'],
      },
      querystring: {
        type: 'object',
        properties: {
          os: { type: 'string', description: 'Target OS (darwin, linux, win32, any)' },
          arch: { type: 'string', description: 'Target arch (x64, arm64, any)' },
        },
      },
      response: {
        200: toJsonSchema(InternalDownloadResponseSchema),
        302: { type: 'null', description: 'Redirect to download URL' },
      },
    },
    handler: async (request, reply) => {
    const { scope, package: packageName, version } = request.params as {
      scope: string;
      package: string;
      version: string;
    };
    const { os, arch } = request.query as { os?: string; arch?: string };
    const name = `@${scope}/${packageName}`;

    // Get package and version with artifacts
    const pkg = await packageRepo.findByName(name);

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    const packageVersion = await packageRepo.findVersionWithArtifacts(pkg.id, version);

    if (!packageVersion) {
      throw new NotFoundError('Version not found');
    }

    // Select artifact based on platform query params, or fall back to universal/first
    let artifact = packageVersion.artifacts[0];
    if (os && arch) {
      // Try exact match first
      const exactMatch = packageVersion.artifacts.find(a => a.os === os && a.arch === arch);
      if (exactMatch) {
        artifact = exactMatch;
      } else {
        // Fall back to universal artifact if available
        const universal = packageVersion.artifacts.find(a => a.os === 'any' && a.arch === 'any');
        if (universal) {
          artifact = universal;
        }
      }
    }

    if (!artifact) {
      throw new NotFoundError('No artifacts found for this version');
    }

    // Log download
    const platform = artifact.os === 'any' ? 'universal' : `${artifact.os}-${artifact.arch}`;
    fastify.log.info({
      op: 'download',
      pkg: name,
      version,
      platform,
    }, `download: ${name}@${version} (${platform})`);

    // Increment download counts atomically in a single transaction
    void runInTransaction(async (tx) => {
      await packageRepo.incrementArtifactDownloads(artifact.id, tx);
      await packageRepo.incrementVersionDownloads(pkg.id, version, tx);
      await packageRepo.incrementDownloads(pkg.id, tx);
    }).catch((err: unknown) =>
      fastify.log.error({ err }, 'Failed to update download counts')
    );

    // Check if client wants JSON response (CLI/API) or redirect (browser)
    const acceptHeader = request.headers.accept ?? '';
    const wantsJson = acceptHeader.includes('application/json');

    // Generate signed download URL using the actual storage path
    // This ensures the URL matches where the file was actually stored
    const downloadUrl = await fastify.storage.getSignedDownloadUrlFromPath(artifact.storagePath);

    if (wantsJson) {
      // CLI/API mode: Return JSON with download URL and metadata
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + (config.storage.cloudfront.urlExpirationSeconds || 900));

      return {
        url: downloadUrl,
        package: {
          name,
          version,
          sha256: artifact.digest.replace('sha256:', ''),
          size: Number(artifact.sizeBytes),
        },
        expires_at: expiresAt.toISOString(),
      };
    } else {
      // Browser mode: Redirect to download URL
      // For local storage, this will be back to the server
      // For S3/CloudFront, this will be a signed CDN URL

      // Check if this is a local storage URL (starts with /)
      if (downloadUrl.startsWith('/')) {
        // Local storage - serve file directly
        const fileBuffer = await fastify.storage.getBundle(artifact.storagePath);

        return reply
          .header('Content-Type', 'application/octet-stream')
          .header('Content-Disposition', `attachment; filename="${packageName}-${version}.mcpb"`)
          .send(fileBuffer);
      } else {
        // S3/CloudFront - redirect to signed URL
        return reply.code(302).redirect(downloadUrl);
      }
    }
    },
  });

  // GET /app/packages/@{scope}/{package}/claim-status - Check if package can be claimed
  // Optional authentication - will use user's GitHub username if authenticated
  fastify.get('/@:scope/:package/claim-status', {
    schema: {
      tags: ['packages'],
      description: 'Check if a package can be claimed and get claim instructions',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
        },
        required: ['scope', 'package'],
      },
      response: {
        200: toJsonSchema(ClaimStatusResponseSchema),
      },
    },
    handler: async (request) => {
    const { scope, package: packageName } = request.params as { scope: string; package: string };
    const name = `@${scope}/${packageName}`;

    // Try to authenticate (optional - won't fail if not authenticated)
    try {
      await fastify.authenticate(request);
    } catch {
      // Not authenticated - that's okay for this endpoint
    }

    const pkg = await packageRepo.findByName(name);

    if (!pkg) {
      throw new NotFoundError('Package not found');
    }

    const isClaimable = await packageRepo.isClaimable(name);

    if (!isClaimable) {
      return {
        claimable: false,
        reason: pkg.claimedBy ? 'Package already claimed' : 'Package cannot be claimed',
        claimed_by: pkg.claimedBy,
        claimed_at: pkg.claimedAt,
      };
    }

    // Generate example mpak.json for the user (use their GitHub username if authenticated)
    const githubUsername = request.user?.githubUsername ?? 'your-github-username';
    const exampleMpakJson = generateMpakJsonExample(name, githubUsername);

    return {
      claimable: true,
      package_name: name,
      github_repo: pkg.githubRepo,
      instructions: {
        steps: [
          `Create a file named "mpak.json" in the root of your GitHub repository${pkg.githubRepo ? ` (${pkg.githubRepo})` : ''}`,
          'Add the content shown in the "mpak_json_example" field below',
          'Commit and push the file to your main or master branch',
          'Come back here and click the "Claim Package" button',
        ],
        mpak_json_example: exampleMpakJson,
        verification_url: pkg.githubRepo
          ? `https://github.com/${pkg.githubRepo}/blob/main/mpak.json`
          : null,
      },
    };
    },
  });

  // POST /app/packages/@{scope}/{package}/claim - Claim a package
  fastify.post('/@:scope/:package/claim', {
    schema: {
      tags: ['packages'],
      description: 'Claim ownership of a package via GitHub verification',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
        },
        required: ['scope', 'package'],
      },
      body: {
        type: 'object',
        properties: {
          github_repo: { type: 'string', description: 'GitHub repository (e.g., owner/repo)' },
        },
      },
      response: {
        200: toJsonSchema(ClaimResponseSchema),
      },
    },
    preHandler: fastify.authenticate,
    handler: async (request) => {
      const user = request.user!;
      const { scope, package: packageName } = request.params as { scope: string; package: string };
      const name = `@${scope}/${packageName}`;
      const { github_repo } = request.body as { github_repo?: string };

      // Get package
      const pkg = await packageRepo.findByName(name);

      if (!pkg) {
        throw new NotFoundError('Package not found');
      }

      // Check if package is claimable
      const isClaimable = await packageRepo.isClaimable(name);

      if (!isClaimable) {
        const reason = pkg.claimedBy ? 'Package already claimed' : 'Package is not claimable';
        throw new BadRequestError('Package cannot be claimed', { reason });
      }

      // Determine GitHub repo to verify
      const repoToVerify = github_repo ?? pkg.githubRepo;

      if (!repoToVerify) {
        throw new BadRequestError(
          'GitHub repository required. Please provide the github_repo field in your request body (e.g., "owner/repo")'
        );
      }

      // Parse and validate GitHub repo format
      const parsedRepo = parseGitHubRepo(repoToVerify);
      if (!parsedRepo) {
        throw new BadRequestError('Invalid GitHub repository format. Use format "owner/repo" or full GitHub URL');
      }

      // Get GitHub username from user profile
      const githubUsername = user.githubUsername;

      if (!githubUsername) {
        throw new BadRequestError(
          'GitHub account not linked. Please link your GitHub account to claim packages. You need to sign in with GitHub via Clerk.'
        );
      }

      // Verify package claim by checking mpak.json
      const verificationResult = await verifyPackageClaim(
        name,
        repoToVerify,
        githubUsername
      );

      if (!verificationResult.verified) {
        throw new ForbiddenError(verificationResult.error ?? 'Verification failed', {
          instructions: {
            steps: [
              'Ensure mpak.json exists in the root of your repository',
              `The "name" field must exactly match: "${name}"`,
              `The "maintainers" array must include: "${githubUsername}"`,
              'The file must be on the main or master branch',
            ],
            example_mpak_json: generateMpakJsonExample(name, githubUsername),
          },
        });
      }

      // Claim the package
      const claimedPackage = await packageRepo.claimPackage(
        name,
        user.userId,
        repoToVerify
      );

      // Fetch GitHub stats asynchronously (non-blocking)
      fetchGitHubRepoStats(repoToVerify).then((stats) => {
        if (stats) {
          packageRepo.updateGitHubStats(claimedPackage.id, stats).catch((err: unknown) =>
            fastify.log.error({ err }, 'Failed to update GitHub stats')
          );
        }
      }).catch((err: unknown) =>
        fastify.log.error({ err }, 'Failed to fetch GitHub stats')
      );

      return {
        success: true,
        message: 'Package claimed successfully!',
        package: {
          name: claimedPackage.name,
          claimed_by: claimedPackage.claimedBy,
          claimed_at: claimedPackage.claimedAt,
          github_repo: claimedPackage.githubRepo,
        },
        verification: {
          mpak_json_url: verificationResult.details?.githubUrl,
          verified_at: new Date().toISOString(),
        },
      };
    },
  });

  // GET /app/packages/me - Get current user's packages (published or claimed)
  fastify.get('/me', {
    schema: {
      tags: ['packages'],
      description: 'Get packages published or claimed by the authenticated user',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', default: '20' },
          offset: { type: 'string', default: '0' },
          sort: { type: 'string', enum: ['recent', 'name', 'downloads'], default: 'recent' },
        },
      },
      response: {
        200: toJsonSchema(MyPackagesResponseSchema),
      },
    },
    preHandler: fastify.authenticate,
    handler: async (request) => {
      const user = request.user!;

      const { limit = '20', offset = '0', sort = 'recent' } = request.query as {
        limit?: string;
        offset?: string;
        sort?: string;
      };

      // Convert query params to numbers
      const limitNum = parseInt(String(limit), 10) || 20;
      const offsetNum = parseInt(String(offset), 10) || 0;

      // Build sort options
      let orderBy: Record<string, string> = { createdAt: 'desc' };
      if (sort === 'name') {
        orderBy = { name: 'asc' };
      } else if (sort === 'downloads') {
        orderBy = { totalDownloads: 'desc' };
      }

      // Get packages claimed by the user (not createdBy, since packages are unclaimed by default)
      const { packages, total } = await packageRepo.search(
        {
          claimedBy: user.userId,
        },
        {
          skip: offsetNum,
          take: limitNum,
          orderBy,
        }
      );

      // Get package versions with tools info
      const packagesWithDetails = await Promise.all(
        packages.map(async (pkg) => {
          const latestVersion = await packageRepo.findVersion(pkg.id, pkg.latestVersion);
          const manifest = (latestVersion?.manifest ?? {}) as Record<string, unknown>;

          return {
            name: pkg.name,
            display_name: pkg.displayName,
            description: pkg.description,
            author: pkg.authorName ? { name: pkg.authorName } : null,
            latest_version: pkg.latestVersion,
            icon: pkg.iconUrl,
            server_type: pkg.serverType,
            tools: (manifest['tools'] as unknown[]) ?? [],
            downloads: Number(pkg.totalDownloads),
            published_at: latestVersion?.publishedAt ?? pkg.createdAt,
            verified: pkg.verified,
            claimable: pkg.claimedBy === null,
            claimed: pkg.claimedBy !== null,
            github: pkg.githubRepo ? {
              repo: pkg.githubRepo,
              stars: pkg.githubStars,
              forks: pkg.githubForks,
              watchers: pkg.githubWatchers,
            } : null,
          };
        })
      );

      return {
        packages: packagesWithDetails,
        total,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          has_more: offsetNum + packages.length < total,
        },
      };
    },
  });

  // GET /app/packages/unclaimed - List unclaimed packages
  fastify.get('/unclaimed/list', {
    schema: {
      tags: ['packages'],
      description: 'List packages that are available to claim',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', default: '20' },
          offset: { type: 'string', default: '0' },
          sort: { type: 'string', enum: ['recent', 'name', 'downloads'], default: 'recent' },
        },
      },
      response: {
        200: toJsonSchema(UnclaimedPackagesResponseSchema),
      },
    },
    handler: async (request) => {
    const { limit = '20', offset = '0', sort = 'recent' } = request.query as {
      limit?: string;
      offset?: string;
      sort?: string;
    };

    // Convert query params to numbers
    const limitNum = parseInt(String(limit), 10) || 20;
    const offsetNum = parseInt(String(offset), 10) || 0;

    // Build sort options
    let orderBy: Record<string, string> = { createdAt: 'desc' };
    if (sort === 'name') {
      orderBy = { name: 'asc' };
    } else if (sort === 'downloads') {
      orderBy = { totalDownloads: 'desc' };
    }

    const { packages, total } = await packageRepo.findUnclaimed({
      skip: offsetNum,
      take: limitNum,
      orderBy,
    });

    return {
      packages: packages.map((pkg) => ({
        name: pkg.name,
        display_name: pkg.displayName,
        description: pkg.description,
        server_type: pkg.serverType,
        latest_version: pkg.latestVersion,
        downloads: Number(pkg.totalDownloads),
        github_repo: pkg.githubRepo,
        created_at: pkg.createdAt,
      })),
      total,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        has_more: offsetNum + packages.length < total,
      },
    };
    },
  });
};
