import type { FastifyPluginAsync } from 'fastify';
import { createHash, randomUUID } from 'crypto';
import { createWriteStream, createReadStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { config } from '../../config.js';
import { runInTransaction } from '../../db/index.js';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  handleError,
} from '../../errors/index.js';
import { toJsonSchema } from '../../lib/zod-schema.js';
import { verifyGitHubOIDC, buildProvenance, type ProvenanceRecord } from '../../lib/oidc.js';
import {
  BundleSearchResponseSchema,
  BundleDetailSchema,
  VersionsResponseSchema,
  VersionDetailSchema,
  DownloadInfoSchema,
  MCPBIndexSchema,
  AnnounceRequestSchema,
  AnnounceResponseSchema,
} from '../../schemas/generated/api-responses.js';
import { generateBadge } from '../../utils/badge.js';
import { notifyDiscordAnnounce } from '../../utils/discord.js';
import { triggerSecurityScan } from '../../services/scanner.js';

// GitHub release asset type
interface GitHubReleaseAsset {
  name: string;
  url: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

/**
 * Get platform string for storage (e.g., "linux-x64")
 */
function getPlatformString(os: string, arch: string): string {
  if (os === 'any' && arch === 'any') {
    return ''; // Universal bundle, no platform suffix
  }
  return `${os}-${arch}`;
}

// Package name validation (scoped only for v1 API)
const SCOPED_REGEX = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9-]{0,213}$/;

function isValidScopedPackageName(name: string): boolean {
  return SCOPED_REGEX.test(name);
}

function parsePackageName(name: string): { scope: string; packageName: string } | null {
  if (!name.startsWith('@')) return null;
  const parts = name.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return {
    scope: parts[0].substring(1), // Remove @
    packageName: parts[1],
  };
}

/**
 * Helper to extract provenance summary for API responses
 */
function getProvenanceSummary(version: { publishMethod: string | null; provenance: unknown }) {
  if (version.publishMethod !== 'oidc' || !version.provenance) {
    return null;
  }
  const p = version.provenance as ProvenanceRecord;
  return {
    schema_version: p.schema_version,
    provider: p.provider,
    repository: p.repository,
    sha: p.sha,
  };
}

/**
 * Helper to extract full provenance for detailed API responses
 */
function getProvenanceFull(version: { publishMethod: string | null; provenance: unknown }) {
  if (version.publishMethod !== 'oidc' || !version.provenance) {
    return null;
  }
  return version.provenance as ProvenanceRecord;
}

/**
 * Validate an artifact filename for safety and format.
 * Rejects empty filenames, filenames over 255 chars, path traversal attempts,
 * and filenames that don't end with .mcpb.
 */
function validateArtifactFilename(filename: string): string | null {
  if (!filename || filename.length === 0) {
    return 'Filename must not be empty.';
  }
  if (filename.length > 255) {
    return 'Filename must be at most 255 characters.';
  }
  if (/[/\\]/.test(filename)) {
    return 'Filename must not contain path separators (/ or \\).';
  }
  if (filename.includes('..')) {
    return 'Filename must not contain "..".';
  }
  if (!filename.endsWith('.mcpb')) {
    return 'Filename must end with .mcpb.';
  }
  return null;
}

/**
 * Public API routes for bundles
 *
 * All routes are prefixed with /v1/bundles
 *
 * Public (no auth):
 * - GET /search - Search bundles
 * - GET /:name - Get bundle details
 * - GET /:name/index.json - Get multi-platform distribution index
 * - GET /:name/versions - List versions
 * - GET /:name/versions/:version - Get specific version info
 * - GET /:name/versions/:version/download - Download bundle
 *
 * OIDC (GitHub Actions):
 * - POST /announce - Announce a new bundle version
 */
export const bundleRoutes: FastifyPluginAsync = async (fastify) => {
  const { packages: packageRepo } = fastify.repositories;

  // GET /v1/bundles/search - Search bundles
  fastify.get('/search', {
    schema: {
      tags: ['bundles'],
      description: 'Search for bundles',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          type: { type: 'string', description: 'Filter by server type' },
          sort: { type: 'string', enum: ['downloads', 'recent', 'name'], default: 'downloads' },
          limit: { type: 'number', default: 20, maximum: 100 },
          offset: { type: 'number', default: 0 },
        },
      },
      response: {
        200: toJsonSchema(BundleSearchResponseSchema),
      },
    },
    handler: async (request) => {
      const {
        q,
        type,
        sort = 'downloads',
        limit = 20,
        offset = 0,
      } = request.query as {
        q?: string;
        type?: string;
        sort?: string;
        limit?: number;
        offset?: number;
      };

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

      // Clamp pagination values to safe ranges
      const safeLimit = Math.max(1, Math.min(limit, 100));
      const safeOffset = Math.max(0, offset);

      // Search packages
      const startTime = Date.now();
      const { packages, total } = await packageRepo.search(
        filters,
        {
          skip: safeOffset,
          take: safeLimit,
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
      const bundles = await Promise.all(
        packages.map(async (pkg) => {
          const latestVersion = await packageRepo.findVersionWithLatestScan(pkg.id, pkg.latestVersion);
          const manifest = (latestVersion?.manifest ?? {}) as Record<string, unknown>;
          const scan = latestVersion?.securityScans[0];

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
            provenance: latestVersion ? getProvenanceSummary(latestVersion) : null,
            certification_level: scan?.certificationLevel ?? null,
          };
        })
      );

      return {
        bundles,
        total,
        pagination: {
          limit,
          offset,
          has_more: offset + bundles.length < total,
        },
      };
    },
  });

  // GET /v1/bundles/@:scope/:package - Get bundle details
  fastify.get('/@:scope/:package', {
    schema: {
      tags: ['bundles'],
      description: 'Get detailed bundle information',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
        },
        required: ['scope', 'package'],
      },
      response: {
        200: toJsonSchema(BundleDetailSchema),
      },
    },
    handler: async (request) => {
      const { scope, package: packageName } = request.params as { scope: string; package: string };
      const name = `@${scope}/${packageName}`;

      const pkg = await packageRepo.findByName(name);

      if (!pkg) {
        throw new NotFoundError('Bundle not found');
      }

      // Get all versions
      const versions = await packageRepo.getVersions(pkg.id);

      // Get latest version manifest with security scan
      const latestVersion = await packageRepo.findVersionWithLatestScan(pkg.id, pkg.latestVersion);
      const manifest = (latestVersion?.manifest ?? {}) as Record<string, unknown>;
      const scan = latestVersion?.securityScans[0];

      // Build certification object from scan
      const CERT_LEVEL_LABELS: Record<number, string> = { 1: 'L1 Basic', 2: 'L2 Verified', 3: 'L3 Hardened', 4: 'L4 Certified' };
      const certLevel = scan?.certificationLevel ?? null;
      const certification = certLevel != null ? {
        level: certLevel,
        level_name: CERT_LEVEL_LABELS[certLevel] ?? null,
        controls_passed: scan?.controlsPassed ?? null,
        controls_failed: scan?.controlsFailed ?? null,
        controls_total: scan?.controlsTotal ?? null,
      } : null;

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
        provenance: latestVersion ? getProvenanceFull(latestVersion) : null,
        certification_level: certLevel,
        certification,
        versions: versions.map((v) => ({
          version: v.version,
          published_at: v.publishedAt,
          downloads: Number(v.downloadCount),
        })),
      };
    },
  });

  // GET /v1/bundles/@:scope/:package/badge.svg - Get SVG badge for package
  fastify.get('/@:scope/:package/badge.svg', {
    schema: {
      tags: ['bundles'],
      description: 'Get an SVG badge for a bundle. Shows version for uncertified packages, or certification level for certified ones.',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
        },
        required: ['scope', 'package'],
      },
      response: {
        200: {
          type: 'string',
          description: 'SVG badge image',
        },
      },
    },
    handler: async (request, reply) => {
      const { scope, package: packageName } = request.params as { scope: string; package: string };
      const name = `@${scope}/${packageName}`;

      const pkg = await packageRepo.findByName(name);

      if (!pkg) {
        throw new NotFoundError('Bundle not found');
      }

      // Check for certification level from latest scan
      let certLevel: number | null = null;
      const latestVersion = await fastify.prisma.packageVersion.findFirst({
        where: {
          packageId: pkg.id,
          version: pkg.latestVersion,
        },
        include: {
          securityScans: {
            where: { status: 'completed' },
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        },
      });

      const scan = latestVersion?.securityScans[0];
      if (scan?.certificationLevel) {
        certLevel = scan.certificationLevel;
      }

      const svg = generateBadge(pkg.latestVersion, certLevel);

      return reply
        .header('Content-Type', 'image/svg+xml')
        .header('Cache-Control', 'max-age=300, s-maxage=3600')
        .send(svg);
    },
  });

  // GET /v1/bundles/@:scope/:package/index.json - Get multi-platform distribution index
  fastify.get('/@:scope/:package/index.json', {
    schema: {
      tags: ['bundles'],
      description: 'Get multi-platform distribution index for a bundle (MCPB Index spec)',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
        },
        required: ['scope', 'package'],
      },
      response: {
        200: toJsonSchema(MCPBIndexSchema),
      },
    },
    handler: async (request, reply) => {
      const { scope, package: packageName } = request.params as { scope: string; package: string };
      const name = `@${scope}/${packageName}`;

      const pkg = await packageRepo.findByName(name);

      if (!pkg) {
        throw new NotFoundError('Bundle not found');
      }

      // Get latest version with artifacts
      const latestVersion = await packageRepo.findVersionWithArtifacts(pkg.id, pkg.latestVersion);
      if (!latestVersion) {
        throw new NotFoundError('No versions found');
      }

      // Build bundles array from artifacts
      const bundleArtifacts = await Promise.all(
        latestVersion.artifacts.map(async (artifact) => {
          const url = await fastify.storage.getSignedDownloadUrlFromPath(artifact.storagePath);

          return {
            mimeType: artifact.mimeType,
            digest: artifact.digest,
            size: Number(artifact.sizeBytes),
            platform: { os: artifact.os, arch: artifact.arch },
            urls: [url, artifact.sourceUrl].filter(Boolean),
          };
        })
      );

      // Build conformant MCPB index.json
      const index = {
        index_version: '0.1',
        mimeType: 'application/vnd.mcp.bundle.index.v0.1+json',
        name: pkg.name,
        version: pkg.latestVersion,
        description: pkg.description,
        bundles: bundleArtifacts,
        annotations: {
          ...(latestVersion.releaseUrl && { 'dev.mpak.release.url': latestVersion.releaseUrl }),
          ...(latestVersion.provenanceRepository && { 'dev.mpak.provenance.repository': latestVersion.provenanceRepository }),
          ...(latestVersion.provenanceSha && { 'dev.mpak.provenance.sha': latestVersion.provenanceSha }),
          ...(latestVersion.publishMethod && { 'dev.mpak.provenance.provider': latestVersion.publishMethod === 'oidc' ? 'github_oidc' : latestVersion.publishMethod }),
        },
      };

      reply.header('Content-Type', 'application/vnd.mcp.bundle.index.v0.1+json');
      return index;
    },
  });

  // GET /v1/bundles/@:scope/:package/versions - List versions
  fastify.get('/@:scope/:package/versions', {
    schema: {
      tags: ['bundles'],
      description: 'List all versions of a bundle',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
        },
        required: ['scope', 'package'],
      },
      response: {
        200: toJsonSchema(VersionsResponseSchema),
      },
    },
    handler: async (request) => {
      const { scope, package: packageName } = request.params as { scope: string; package: string };
      const name = `@${scope}/${packageName}`;

      const pkg = await packageRepo.findByName(name);

      if (!pkg) {
        throw new NotFoundError('Bundle not found');
      }

      // Get all versions with artifacts
      const versions = await packageRepo.getVersionsWithArtifacts(pkg.id);

      return {
        name: pkg.name,
        latest: pkg.latestVersion,
        versions: versions.map((v) => ({
          version: v.version,
          artifacts_count: v.artifacts.length,
          platforms: v.artifacts.map((a) => ({ os: a.os, arch: a.arch })),
          published_at: v.publishedAt,
          downloads: Number(v.downloadCount),
          publish_method: v.publishMethod,
          provenance: getProvenanceSummary(v),
        })),
      };
    },
  });

  // GET /v1/bundles/@:scope/:package/versions/:version - Get specific version info
  fastify.get('/@:scope/:package/versions/:version', {
    schema: {
      tags: ['bundles'],
      description: 'Get information about a specific version',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          package: { type: 'string' },
          version: { type: 'string' },
        },
        required: ['scope', 'package', 'version'],
      },
      response: {
        200: toJsonSchema(VersionDetailSchema),
      },
    },
    handler: async (request) => {
      const { scope, package: packageName, version } = request.params as {
        scope: string;
        package: string;
        version: string;
      };
      const name = `@${scope}/${packageName}`;

      const pkg = await packageRepo.findByName(name);

      if (!pkg) {
        throw new NotFoundError('Bundle not found');
      }

      const packageVersion = await packageRepo.findVersionWithArtifacts(pkg.id, version);

      if (!packageVersion) {
        throw new NotFoundError('Version not found');
      }

      // Build artifacts array with download URLs
      const artifacts = await Promise.all(
        packageVersion.artifacts.map(async (a) => {
          const downloadUrl = await fastify.storage.getSignedDownloadUrlFromPath(a.storagePath);

          return {
            platform: { os: a.os, arch: a.arch },
            digest: a.digest,
            size: Number(a.sizeBytes),
            download_url: downloadUrl,
            source_url: a.sourceUrl || undefined,
          };
        })
      );

      return {
        name: pkg.name,
        version: packageVersion.version,
        published_at: packageVersion.publishedAt,
        downloads: Number(packageVersion.downloadCount),
        artifacts,
        manifest: packageVersion.manifest,
        release: packageVersion.releaseUrl ? {
          tag: packageVersion.releaseTag,
          url: packageVersion.releaseUrl,
        } : undefined,
        publish_method: packageVersion.publishMethod,
        provenance: getProvenanceFull(packageVersion),
      };
    },
  });

  // GET /v1/bundles/@:scope/:package/versions/:version/download - Download bundle
  fastify.get('/@:scope/:package/versions/:version/download', {
    schema: {
      tags: ['bundles'],
      description: 'Download a specific version of a bundle',
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
        200: toJsonSchema(DownloadInfoSchema),
        302: { type: 'null', description: 'Redirect to download URL' },
      },
    },
    handler: async (request, reply) => {
      const { scope, package: packageName, version: versionParam } = request.params as {
        scope: string;
        package: string;
        version: string;
      };
      const { os: queryOs, arch: queryArch } = request.query as { os?: string; arch?: string };
      const name = `@${scope}/${packageName}`;

      const pkg = await packageRepo.findByName(name);

      if (!pkg) {
        throw new NotFoundError('Bundle not found');
      }

      // Resolve "latest" to actual version
      const version = versionParam === 'latest' ? pkg.latestVersion : versionParam;

      const packageVersion = await packageRepo.findVersionWithArtifacts(pkg.id, version);

      if (!packageVersion) {
        throw new NotFoundError('Version not found');
      }

      // Find the appropriate artifact
      let artifact = packageVersion.artifacts[0]; // Default to first

      if (queryOs || queryArch) {
        // Look for exact match
        const match = packageVersion.artifacts.find(
          (a) => a.os === queryOs && a.arch === queryArch
        );
        if (match) {
          artifact = match;
        } else {
          // Look for universal fallback
          const universal = packageVersion.artifacts.find(
            (a) => a.os === 'any' && a.arch === 'any'
          );
          if (universal) {
            artifact = universal;
          }
        }
      }

      if (!artifact) {
        throw new NotFoundError('No artifact found for this version');
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
      const downloadUrl = await fastify.storage.getSignedDownloadUrlFromPath(artifact.storagePath);

      if (wantsJson) {
        // CLI/API mode: Return JSON with download URL and metadata
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (config.storage.cloudfront.urlExpirationSeconds || 900));

        return {
          url: downloadUrl,
          bundle: {
            name,
            version,
            platform: { os: artifact.os, arch: artifact.arch },
            sha256: artifact.digest.replace('sha256:', ''),
            size: Number(artifact.sizeBytes),
          },
          expires_at: expiresAt.toISOString(),
        };
      } else {
        // Browser mode: Redirect to download URL
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

  // POST /v1/bundles/announce - Announce a single artifact (OIDC only, idempotent per-artifact)
  fastify.post('/announce', {
    schema: {
      tags: ['bundles'],
      description: 'Announce a single artifact for a bundle version from a GitHub release (OIDC only). Idempotent - can be called multiple times for different artifacts of the same version.',
      body: toJsonSchema(AnnounceRequestSchema),
      response: {
        200: toJsonSchema(AnnounceResponseSchema),
      },
    },
    handler: async (request, reply) => {
      try {
        // Extract OIDC token from Authorization header
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError('Missing OIDC token. This endpoint requires a GitHub Actions OIDC token.');
        }

        const token = authHeader.substring(7);
        const announceStart = Date.now();

        // Verify the OIDC token
        let claims;
        try {
          claims = await verifyGitHubOIDC(token);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Token verification failed';
          fastify.log.warn({ op: 'announce', error: message }, `announce: OIDC verification failed`);
          throw new UnauthorizedError(`Invalid OIDC token: ${message}`);
        }

        // Extract body
        const {
          name,
          version,
          manifest,
          release_tag,
          prerelease = false,
          artifact: artifactInfo,
        } = request.body as {
          name: string;
          version: string;
          manifest: Record<string, unknown>;
          release_tag: string;
          prerelease?: boolean;
          artifact: {
            filename: string;
            os: string;
            arch: string;
            sha256: string;
            size: number;
          };
        };

        // Validate artifact platform values
        const VALID_OS = ['darwin', 'linux', 'win32', 'any'];
        const VALID_ARCH = ['x64', 'arm64', 'any'];
        if (!VALID_OS.includes(artifactInfo.os)) {
          throw new BadRequestError(
            `Invalid artifact os: "${artifactInfo.os}". Must be one of: ${VALID_OS.join(', ')}`
          );
        }
        if (!VALID_ARCH.includes(artifactInfo.arch)) {
          throw new BadRequestError(
            `Invalid artifact arch: "${artifactInfo.arch}". Must be one of: ${VALID_ARCH.join(', ')}`
          );
        }
        // Validate artifact filename (path traversal, extension, length)
        const filenameError = validateArtifactFilename(artifactInfo.filename);
        if (filenameError) {
          throw new BadRequestError(
            `Invalid artifact filename: "${artifactInfo.filename}". ${filenameError}`
          );
        }

        // Validate package name
        if (!isValidScopedPackageName(name)) {
          throw new BadRequestError(
            `Invalid package name: "${name}". Must be scoped (@scope/name) with lowercase alphanumeric characters and hyphens.`
          );
        }

        const parsed = parsePackageName(name);
        if (!parsed) {
          throw new BadRequestError('Invalid package name format');
        }

        // Security: Verify the package name scope matches the repository owner
        const repoOwnerLower = claims.repository_owner.toLowerCase();
        const scopeLower = parsed.scope.toLowerCase();

        if (scopeLower !== repoOwnerLower) {
          fastify.log.warn({
            op: 'announce',
            pkg: name,
            version,
            repo: claims.repository,
            error: 'scope_mismatch',
          }, `announce: scope mismatch @${parsed.scope} != ${claims.repository_owner}`);
          throw new UnauthorizedError(
            `Scope mismatch: Package scope "@${parsed.scope}" does not match repository owner "${claims.repository_owner}". ` +
            `OIDC publishing requires the package scope to match the GitHub organization or user.`
          );
        }

        fastify.log.info({
          op: 'announce',
          pkg: name,
          version,
          repo: claims.repository,
          tag: release_tag,
          prerelease,
          artifact: artifactInfo.filename,
          platform: `${artifactInfo.os}-${artifactInfo.arch}`,
        }, `announce: starting ${name}@${version} artifact ${artifactInfo.filename}`);

        // Extract server_type from manifest
        const serverObj = manifest['server'] as Record<string, unknown> | undefined;
        const serverType = (serverObj?.['type'] as string) ?? (manifest['server_type'] as string);
        if (!serverType) {
          throw new BadRequestError('Manifest must contain server type (server.type or server_type)');
        }

        // Build provenance record
        const provenance = buildProvenance(claims);

        // Fetch release from GitHub API to get the specific artifact
        const releaseApiUrl = `https://api.github.com/repos/${claims.repository}/releases/tags/${release_tag}`;
        fastify.log.info(`Fetching release from ${releaseApiUrl}`);

        const releaseResponse = await fetch(releaseApiUrl, {
          headers: {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'mpak-registry/1.0',
          },
        });

        if (!releaseResponse.ok) {
          throw new BadRequestError(`Failed to fetch release ${release_tag}: ${releaseResponse.statusText}`);
        }

        const release = await releaseResponse.json() as {
          tag_name: string;
          html_url: string;
          assets: GitHubReleaseAsset[];
        };

        // Check for server.json in the release assets (for MCP Registry discovery)
        let serverJson: Record<string, unknown> | null = null;
        const serverJsonAsset = release.assets.find((a: GitHubReleaseAsset) => a.name === 'server.json');
        if (serverJsonAsset) {
          try {
            fastify.log.info(`Fetching server.json from release ${release_tag}`);
            const sjResponse = await fetch(serverJsonAsset.browser_download_url);
            if (sjResponse.ok) {
              const sjData = await sjResponse.json() as Record<string, unknown>;
              // Strip packages[] before storing (the registry populates it dynamically at serve time)
              delete sjData['packages'];
              serverJson = sjData;
              fastify.log.info(`Loaded server.json for MCP Registry discovery`);
            }
          } catch (sjError) {
            fastify.log.warn({ err: sjError }, 'Failed to fetch server.json from release, continuing without it');
          }
        }

        // Find the specific artifact by filename
        const asset = release.assets.find((a: GitHubReleaseAsset) => a.name === artifactInfo.filename);
        if (!asset) {
          throw new BadRequestError(`Artifact "${artifactInfo.filename}" not found in release ${release_tag}`);
        }

        // Download artifact to temp file while computing hash (memory-efficient streaming)
        const tempPath = path.join(tmpdir(), `mcpb-${randomUUID()}`);
        const platformStr = getPlatformString(artifactInfo.os, artifactInfo.arch);
        let storagePath: string;
        let computedSha256: string;

        try {
          fastify.log.info(`Downloading artifact: ${asset.name}`);
          const assetResponse = await fetch(asset.browser_download_url);
          if (!assetResponse.ok || !assetResponse.body) {
            throw new BadRequestError(`Failed to download ${asset.name}: ${assetResponse.statusText}`);
          }

          // Stream to temp file while computing hash
          const hash = createHash('sha256');
          let bytesWritten = 0;
          const writeStream = createWriteStream(tempPath);

          // Convert web ReadableStream to async iterable
          const reader = assetResponse.body.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              hash.update(value);
              bytesWritten += value.length;
              writeStream.write(value);
            }
          } finally {
            reader.releaseLock();
          }

          await new Promise<void>((resolve, reject) => {
            writeStream.end();
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
          });

          // Verify size
          if (bytesWritten !== artifactInfo.size) {
            throw new BadRequestError(
              `Size mismatch for ${asset.name}: declared ${artifactInfo.size} bytes, got ${bytesWritten} bytes`
            );
          }

          // Verify hash
          computedSha256 = hash.digest('hex');
          if (computedSha256 !== artifactInfo.sha256) {
            throw new BadRequestError(
              `SHA256 mismatch for ${asset.name}: declared ${artifactInfo.sha256}, computed ${computedSha256}`
            );
          }

          // Stream verified file to storage
          const uploadStream = createReadStream(tempPath);
          const result = await fastify.storage.saveBundleFromStream(
            parsed.scope,
            parsed.packageName,
            version,
            uploadStream,
            computedSha256,
            bytesWritten,
            platformStr || undefined
          );
          storagePath = result.path;

          fastify.log.info(`Stored ${asset.name} -> ${storagePath} (${artifactInfo.os}-${artifactInfo.arch})`);
        } finally {
          // Always clean up temp file
          await fs.unlink(tempPath).catch(() => {});
        }

        // Track whether we created or updated
        let status: 'created' | 'updated' = 'created';
        let totalArtifacts = 0;
        let oldStoragePath: string | null = null;
        let versionId: string | null = null;

        // Use transaction to upsert package, version, and artifact
        try {
          const txResult = await runInTransaction(async (tx) => {
            // Find or create package (handles race conditions atomically)
            const { package: existingPackage, created: packageCreated } = await packageRepo.upsertPackage({
              name,
              displayName: (manifest['display_name'] as string) ?? undefined,
              description: (manifest['description'] as string) ?? undefined,
              authorName: (manifest['author'] as Record<string, unknown>)?.['name'] as string ?? undefined,
              authorEmail: (manifest['author'] as Record<string, unknown>)?.['email'] as string ?? undefined,
              authorUrl: (manifest['author'] as Record<string, unknown>)?.['url'] as string ?? undefined,
              homepage: (manifest['homepage'] as string) ?? undefined,
              license: (manifest['license'] as string) ?? undefined,
              iconUrl: (manifest['icon'] as string) ?? undefined,
              serverType,
              verified: false,
              latestVersion: version,
              githubRepo: claims.repository,
            }, tx);

            const packageId = existingPackage.id;
            let versionCreated = packageCreated; // New package means new version

            // Fetch README only if this might be a new version
            let readme: string | null = null;
            const existingVersion = await packageRepo.findVersion(packageId, version, tx);

            if (!existingVersion || !existingVersion.readme) {
              // Fetch README.md from the repository at the release tag
              try {
                const readmeUrl = `https://api.github.com/repos/${claims.repository}/contents/README.md?ref=${release_tag}`;
                fastify.log.info(`Fetching README from ${readmeUrl}`);

                const readmeResponse = await fetch(readmeUrl, {
                  headers: {
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'mpak-registry/1.0',
                  },
                });

                if (readmeResponse.ok) {
                  const readmeData = await readmeResponse.json() as { content?: string; encoding?: string };
                  if (readmeData.content && readmeData.encoding === 'base64') {
                    readme = Buffer.from(readmeData.content, 'base64').toString('utf-8');
                    fastify.log.info(`Fetched README.md (${readme.length} chars)`);
                  }
                }
              } catch (readmeError) {
                fastify.log.warn({ err: readmeError }, 'Failed to fetch README.md, continuing without it');
              }
            }

            // Upsert version
            const { version: packageVersion, created } = await packageRepo.upsertVersion(packageId, {
              packageId,
              version,
              manifest,
              prerelease,
              publishedBy: null,
              publishedByEmail: null,
              releaseTag: release_tag,
              releaseUrl: release.html_url,
              readme: readme ?? undefined,
              publishMethod: 'oidc',
              provenanceRepository: provenance.repository,
              provenanceSha: provenance.sha,
              provenance,
              serverJson: serverJson ?? undefined,
            }, tx);

            versionCreated = created;

            // Update latestVersion only when version is first created
            if (versionCreated) {
              if (!prerelease) {
                await packageRepo.updateLatestVersion(packageId, version, tx);
              } else {
                // Check if current latest is a prerelease - if so, update to newer prerelease
                const currentLatest = await packageRepo.findVersion(packageId, existingPackage.latestVersion, tx);
                if (currentLatest?.prerelease) {
                  await packageRepo.updateLatestVersion(packageId, version, tx);
                }
              }
            }

            // Upsert artifact
            const artifactResult = await packageRepo.upsertArtifact({
              versionId: packageVersion.id,
              os: artifactInfo.os,
              arch: artifactInfo.arch,
              digest: `sha256:${computedSha256}`,
              sizeBytes: BigInt(artifactInfo.size),
              storagePath,
              sourceUrl: asset.browser_download_url,
            }, tx);

            status = artifactResult.created ? 'created' : 'updated';
            oldStoragePath = artifactResult.oldStoragePath;

            // Count total artifacts for this version
            totalArtifacts = await packageRepo.countVersionArtifacts(packageVersion.id, tx);

            return { versionId: packageVersion.id };
          });

          versionId = txResult.versionId;
        } catch (error) {
          // Transaction failed - clean up uploaded file
          try {
            await fastify.storage.deleteBundle(storagePath);
            fastify.log.info(`Cleaned up after transaction failure: ${storagePath}`);
          } catch (cleanupError) {
            fastify.log.error({ err: cleanupError, path: storagePath }, 'Failed to cleanup uploaded file');
          }
          throw error;
        }

        // Clean up old storage path if artifact was updated with different path
        if (oldStoragePath) {
          try {
            await fastify.storage.deleteBundle(oldStoragePath);
            fastify.log.info(`Cleaned up old artifact: ${oldStoragePath}`);
          } catch (cleanupError) {
            fastify.log.warn({ err: cleanupError, path: oldStoragePath }, 'Failed to cleanup old artifact file');
          }
        }

        fastify.log.info({
          op: 'announce',
          pkg: name,
          version,
          repo: claims.repository,
          artifact: artifactInfo.filename,
          platform: `${artifactInfo.os}-${artifactInfo.arch}`,
          status,
          totalArtifacts,
          ms: Date.now() - announceStart,
        }, `announce: ${status} ${name}@${version} artifact ${artifactInfo.filename} (${totalArtifacts} total, ${Date.now() - announceStart}ms)`);

        // Non-blocking Discord notification for new or updated bundles
        notifyDiscordAnnounce({ name, version, type: 'bundle', repo: claims.repository });

        // Non-blocking security scan trigger
        if (config.scanner.enabled && versionId) {
          triggerSecurityScan(fastify.prisma, {
            versionId,
            bundleStoragePath: storagePath,
            packageName: name,
            version,
          }).catch((err: unknown) => fastify.log.error({ err }, 'Failed to trigger security scan'));
        }

        return {
          package: name,
          version,
          artifact: {
            os: artifactInfo.os,
            arch: artifactInfo.arch,
            filename: artifactInfo.filename,
          },
          total_artifacts: totalArtifacts,
          status,
        };
      } catch (error) {
        fastify.log.error({ op: 'announce', error: error instanceof Error ? error.message : 'unknown' }, `announce: failed`);
        return handleError(error, request, reply);
      }
    },
  });
};
