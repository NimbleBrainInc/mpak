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
import { verifyGitHubOIDC, buildProvenance } from '../../lib/oidc.js';
import {
  SkillSearchResponseSchema,
  SkillDetailSchema,
  SkillDownloadInfoSchema,
  SkillAnnounceRequestSchema,
  SkillAnnounceResponseSchema,
} from '../../schemas/generated/skill.js';
import { generateBadge } from '../../utils/badge.js';
import { notifyDiscordAnnounce } from '../../utils/discord.js';

// GitHub release asset type
interface GitHubReleaseAsset {
  name: string;
  url: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

// Scoped name validation
const SCOPED_REGEX = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9-]*$/;

function isValidScopedName(name: string): boolean {
  return SCOPED_REGEX.test(name);
}

function parseScopedName(name: string): { scope: string; skillName: string } | null {
  if (!name.startsWith('@')) return null;
  const parts = name.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return {
    scope: parts[0].substring(1),
    skillName: parts[1],
  };
}

/**
 * Public API routes for skills
 *
 * All routes are prefixed with /v1/skills
 *
 * Public (no auth):
 * - GET /search - Search skills
 * - GET /@:scope/:name - Get skill details
 * - GET /@:scope/:name/download - Download skill bundle
 * - GET /@:scope/:name/versions/:version/download - Download specific version
 *
 * OIDC (GitHub Actions):
 * - POST /announce - Announce a new skill version
 */
export const skillRoutes: FastifyPluginAsync = async (fastify) => {
  const { skills: skillRepo } = fastify.repositories;

  // GET /v1/skills/search - Search skills
  fastify.get('/search', {
    schema: {
      tags: ['skills'],
      description: 'Search for skills',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Search query' },
          tags: { type: 'string', description: 'Filter by tags (comma-separated)' },
          category: { type: 'string', description: 'Filter by category' },
          sort: { type: 'string', enum: ['downloads', 'recent', 'name'], default: 'downloads' },
          limit: { type: 'number', default: 20, maximum: 100 },
          offset: { type: 'number', default: 0 },
        },
      },
      response: {
        200: toJsonSchema(SkillSearchResponseSchema),
      },
    },
    handler: async (request) => {
      const {
        q,
        tags,
        category,
        sort = 'downloads',
        limit = 20,
        offset = 0,
      } = request.query as {
        q?: string;
        tags?: string;
        category?: string;
        sort?: string;
        limit?: number;
        offset?: number;
      };

      // Build filters
      const filters: Record<string, unknown> = {};
      if (q) filters['query'] = q;
      if (category) filters['category'] = category;
      if (tags) filters['tags'] = tags.split(',').map((t) => t.trim());

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

      const startTime = Date.now();
      const { skills, total } = await skillRepo.search(filters, {
        skip: safeOffset,
        take: safeLimit,
        orderBy,
      });

      fastify.log.info(
        {
          op: 'skill_search',
          query: q ?? null,
          category: category ?? null,
          sort,
          results: total,
          ms: Date.now() - startTime,
        },
        `skill_search: q="${q ?? '*'}" returned ${total} results`
      );

      return {
        skills: skills.map((skill) => ({
          name: skill.name,
          description: skill.description,
          latest_version: skill.latestVersion,
          tags: skill.tags,
          category: skill.category,
          downloads: Number(skill.totalDownloads),
          published_at: skill.createdAt?.toISOString(),
          author: skill.authorName
            ? {
                name: skill.authorName,
                url: skill.authorUrl || undefined,
                email: skill.authorEmail || undefined,
              }
            : undefined,
        })),
        total,
        pagination: {
          limit,
          offset,
          has_more: offset + skills.length < total,
        },
      };
    },
  });

  // GET /v1/skills/@:scope/:name - Get skill details
  fastify.get('/@:scope/:name', {
    schema: {
      tags: ['skills'],
      description: 'Get detailed skill information',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['scope', 'name'],
      },
      response: {
        200: toJsonSchema(SkillDetailSchema),
      },
    },
    handler: async (request) => {
      const { scope, name: skillName } = request.params as { scope: string; name: string };
      const name = `@${scope}/${skillName}`;

      const skill = await skillRepo.findByNameWithVersions(name);

      if (!skill) {
        throw new NotFoundError('Skill not found');
      }

      // Get content from the latest version
      const latestVersion = skill.versions.find((v) => v.version === skill.latestVersion);
      const content = latestVersion?.content ?? null;

      // Extract examples from the latest version's frontmatter
      const frontmatter = (latestVersion?.frontmatter ?? {}) as Record<string, unknown>;
      const meta = (frontmatter['metadata'] ?? {}) as Record<string, unknown>;
      const examples = Array.isArray(meta['examples']) ? meta['examples'] as { prompt: string; context?: string }[] : undefined;

      // Build provenance from the latest version
      const provenance = latestVersion?.provenanceRepository
        ? {
            publish_method: latestVersion.publishMethod ?? null,
            repository: latestVersion.provenanceRepository,
            sha: latestVersion.provenanceSha ?? null,
          }
        : null;

      return {
        name: skill.name,
        description: skill.description,
        latest_version: skill.latestVersion,
        license: skill.license,
        compatibility: skill.compatibility,
        allowed_tools: skill.allowedTools?.split(' ').filter(Boolean),
        tags: skill.tags,
        category: skill.category,
        triggers: skill.triggers,
        downloads: Number(skill.totalDownloads),
        published_at: skill.createdAt?.toISOString(),
        content,
        provenance,
        author: skill.authorName
          ? {
              name: skill.authorName,
              url: skill.authorUrl || undefined,
              email: skill.authorEmail || undefined,
            }
          : undefined,
        examples,
        versions: skill.versions.map((v) => ({
          version: v.version,
          published_at: v.publishedAt?.toISOString(),
          downloads: Number(v.downloadCount),
        })),
      };
    },
  });

  // GET /v1/skills/@:scope/:name/badge.svg - Get SVG badge for skill
  fastify.get('/@:scope/:name/badge.svg', {
    schema: {
      tags: ['skills'],
      description: 'Get an SVG badge for a skill (for README embeds)',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['scope', 'name'],
      },
      response: {
        200: {
          type: 'string',
          description: 'SVG badge image',
        },
      },
    },
    handler: async (request, reply) => {
      const { scope, name: skillName } = request.params as { scope: string; name: string };
      const name = `@${scope}/${skillName}`;

      const skill = await skillRepo.findByName(name);

      if (!skill) {
        throw new NotFoundError('Skill not found');
      }

      const svg = generateBadge(skill.latestVersion);

      return reply
        .header('Content-Type', 'image/svg+xml')
        .header('Cache-Control', 'max-age=300, s-maxage=3600')
        .send(svg);
    },
  });

  // GET /v1/skills/@:scope/:name/download - Download latest skill bundle
  fastify.get('/@:scope/:name/download', {
    schema: {
      tags: ['skills'],
      description: 'Download the latest version of a skill bundle',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['scope', 'name'],
      },
      response: {
        200: toJsonSchema(SkillDownloadInfoSchema),
        302: { type: 'null', description: 'Redirect to download URL' },
      },
    },
    handler: async (request, reply) => {
      const { scope, name: skillName } = request.params as { scope: string; name: string };
      const name = `@${scope}/${skillName}`;

      const skill = await skillRepo.findByName(name);

      if (!skill) {
        throw new NotFoundError('Skill not found');
      }

      const version = await skillRepo.findVersion(skill.id, skill.latestVersion);

      if (!version) {
        throw new NotFoundError('No versions found');
      }

      // Log download
      fastify.log.info(
        { op: 'skill_download', skill: name, version: version.version },
        `skill_download: ${name}@${version.version}`
      );

      // Increment download counts atomically in a single transaction
      void runInTransaction(async (tx) => {
        await skillRepo.incrementVersionDownloads(skill.id, version.version, tx);
        await skillRepo.incrementDownloads(skill.id, tx);
      }).catch((err: unknown) =>
        fastify.log.error({ err }, 'Failed to update skill download counts')
      );

      // Check if client wants JSON response
      const acceptHeader = request.headers.accept ?? '';
      const wantsJson = acceptHeader.includes('application/json');

      const downloadUrl = await fastify.storage.getSignedDownloadUrlFromPath(version.storagePath);

      if (wantsJson) {
        const expiresAt = new Date();
        expiresAt.setSeconds(
          expiresAt.getSeconds() + (config.storage.cloudfront.urlExpirationSeconds || 900)
        );

        return {
          url: downloadUrl,
          skill: {
            name,
            version: version.version,
            sha256: version.digest.replace('sha256:', ''),
            size: Number(version.sizeBytes),
          },
          expires_at: expiresAt.toISOString(),
        };
      } else {
        // Always stream through server to set proper Content-Disposition filename
        const fileBuffer = await fastify.storage.getBundle(version.storagePath);

        return reply
          .header('Content-Type', 'application/octet-stream')
          .header('Content-Disposition', `attachment; filename="${skillName}-${version.version}.skill"`)
          .send(fileBuffer);
      }
    },
  });

  // GET /v1/skills/@:scope/:name/versions/:version/download - Download specific version
  fastify.get('/@:scope/:name/versions/:version/download', {
    schema: {
      tags: ['skills'],
      description: 'Download a specific version of a skill bundle',
      params: {
        type: 'object',
        properties: {
          scope: { type: 'string' },
          name: { type: 'string' },
          version: { type: 'string' },
        },
        required: ['scope', 'name', 'version'],
      },
      response: {
        200: toJsonSchema(SkillDownloadInfoSchema),
        302: { type: 'null', description: 'Redirect to download URL' },
      },
    },
    handler: async (request, reply) => {
      const { scope, name: skillName, version: versionParam } = request.params as {
        scope: string;
        name: string;
        version: string;
      };
      const name = `@${scope}/${skillName}`;

      const skill = await skillRepo.findByName(name);

      if (!skill) {
        throw new NotFoundError('Skill not found');
      }

      const versionStr = versionParam === 'latest' ? skill.latestVersion : versionParam;
      const version = await skillRepo.findVersion(skill.id, versionStr);

      if (!version) {
        throw new NotFoundError('Version not found');
      }

      fastify.log.info(
        { op: 'skill_download', skill: name, version: version.version },
        `skill_download: ${name}@${version.version}`
      );

      // Increment download counts atomically in a single transaction
      void runInTransaction(async (tx) => {
        await skillRepo.incrementVersionDownloads(skill.id, version.version, tx);
        await skillRepo.incrementDownloads(skill.id, tx);
      }).catch((err: unknown) =>
        fastify.log.error({ err }, 'Failed to update skill download counts')
      );

      const acceptHeader = request.headers.accept ?? '';
      const wantsJson = acceptHeader.includes('application/json');

      const downloadUrl = await fastify.storage.getSignedDownloadUrlFromPath(version.storagePath);

      if (wantsJson) {
        const expiresAt = new Date();
        expiresAt.setSeconds(
          expiresAt.getSeconds() + (config.storage.cloudfront.urlExpirationSeconds || 900)
        );

        return {
          url: downloadUrl,
          skill: {
            name,
            version: version.version,
            sha256: version.digest.replace('sha256:', ''),
            size: Number(version.sizeBytes),
          },
          expires_at: expiresAt.toISOString(),
        };
      } else {
        // Always stream through server to set proper Content-Disposition filename
        const fileBuffer = await fastify.storage.getBundle(version.storagePath);

        return reply
          .header('Content-Type', 'application/octet-stream')
          .header('Content-Disposition', `attachment; filename="${skillName}-${version.version}.skill"`)
          .send(fileBuffer);
      }
    },
  });

  // POST /v1/skills/announce - Announce a skill version (OIDC only)
  fastify.post('/announce', {
    schema: {
      tags: ['skills'],
      description:
        'Announce a skill version from a GitHub release (OIDC only). Idempotent - can be called multiple times.',
      body: toJsonSchema(SkillAnnounceRequestSchema),
      response: {
        200: toJsonSchema(SkillAnnounceResponseSchema),
      },
    },
    handler: async (request, reply) => {
      try {
        // Extract OIDC token
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          throw new UnauthorizedError(
            'Missing OIDC token. This endpoint requires a GitHub Actions OIDC token.'
          );
        }

        const token = authHeader.substring(7);
        const announceStart = Date.now();

        // Verify the OIDC token
        let claims;
        try {
          claims = await verifyGitHubOIDC(token);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Token verification failed';
          fastify.log.warn(
            { op: 'skill_announce', error: message },
            `skill_announce: OIDC verification failed`
          );
          throw new UnauthorizedError(`Invalid OIDC token: ${message}`);
        }

        const { name, version, skill: frontmatter, release_tag, prerelease = false, artifact } =
          request.body as {
            name: string;
            version: string;
            skill: Record<string, unknown>;
            release_tag: string;
            prerelease?: boolean;
            artifact: {
              filename: string;
              sha256: string;
              size: number;
            };
          };

        // Validate name
        if (!isValidScopedName(name)) {
          throw new BadRequestError(
            `Invalid skill name: "${name}". Must be scoped (@scope/name) with lowercase alphanumeric characters and hyphens.`
          );
        }

        const parsed = parseScopedName(name);
        if (!parsed) {
          throw new BadRequestError('Invalid skill name format');
        }

        // Security: Verify scope matches repository owner
        const repoOwnerLower = claims.repository_owner.toLowerCase();
        const scopeLower = parsed.scope.toLowerCase();

        if (scopeLower !== repoOwnerLower) {
          fastify.log.warn(
            {
              op: 'skill_announce',
              skill: name,
              version,
              repo: claims.repository,
              error: 'scope_mismatch',
            },
            `skill_announce: scope mismatch @${parsed.scope} != ${claims.repository_owner}`
          );
          throw new UnauthorizedError(
            `Scope mismatch: Skill scope "@${parsed.scope}" does not match repository owner "${claims.repository_owner}".`
          );
        }

        fastify.log.info(
          {
            op: 'skill_announce',
            skill: name,
            version,
            repo: claims.repository,
            tag: release_tag,
            prerelease,
          },
          `skill_announce: starting ${name}@${version}`
        );

        // Build provenance
        const provenance = buildProvenance(claims);

        // Fetch release from GitHub
        const releaseApiUrl = `https://api.github.com/repos/${claims.repository}/releases/tags/${release_tag}`;
        fastify.log.info(`Fetching release from ${releaseApiUrl}`);

        const releaseResponse = await fetch(releaseApiUrl, {
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'mpak-registry/1.0',
          },
        });

        if (!releaseResponse.ok) {
          throw new BadRequestError(
            `Failed to fetch release ${release_tag}: ${releaseResponse.statusText}`
          );
        }

        const release = (await releaseResponse.json()) as {
          tag_name: string;
          html_url: string;
          assets: GitHubReleaseAsset[];
        };

        // Find the skill artifact
        const asset = release.assets.find((a: GitHubReleaseAsset) => a.name === artifact.filename);
        if (!asset) {
          throw new BadRequestError(
            `Artifact "${artifact.filename}" not found in release ${release_tag}`
          );
        }

        // Download and verify artifact
        const tempPath = path.join(tmpdir(), `skill-${randomUUID()}`);
        let storagePath: string;
        let computedSha256: string;
        let skillContent: string | undefined;

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
          if (bytesWritten !== artifact.size) {
            throw new BadRequestError(
              `Size mismatch for ${asset.name}: declared ${artifact.size} bytes, got ${bytesWritten} bytes`
            );
          }

          // Verify hash
          computedSha256 = hash.digest('hex');
          if (computedSha256 !== artifact.sha256) {
            throw new BadRequestError(
              `SHA256 mismatch for ${asset.name}: declared ${artifact.sha256}, computed ${computedSha256}`
            );
          }

          // Extract body content from the .skill file (after YAML frontmatter)
          const fileContent = await fs.readFile(tempPath, 'utf-8');
          const fmMatch = fileContent.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
          if (fmMatch?.[1]) {
            const body = fmMatch[1].trim();
            if (body.length > 0) {
              skillContent = body;
            }
          }

          // Store the skill bundle (skills don't have platform variants)
          const uploadStream = createReadStream(tempPath);
          const result = await fastify.storage.saveBundleFromStream(
            parsed.scope,
            parsed.skillName,
            version,
            uploadStream,
            computedSha256,
            bytesWritten,
            'skill' // Use 'skill' as the "platform" to distinguish from mcpb bundles
          );
          storagePath = result.path;

          fastify.log.info(`Stored ${asset.name} -> ${storagePath}`);
        } finally {
          await fs.unlink(tempPath).catch(() => {});
        }

        // Extract metadata from frontmatter
        const meta = (frontmatter['metadata'] ?? {}) as Record<string, unknown>;

        let status: 'created' | 'exists' = 'created';
        let oldStoragePath: string | null = null;

        // Use transaction to upsert skill and version
        try {
          await runInTransaction(async (tx) => {
            // Upsert skill
            const { skill: existingSkill } = await skillRepo.upsertSkill(
              {
                name,
                description: frontmatter['description'] as string,
                license: frontmatter['license'] as string | undefined,
                compatibility: frontmatter['compatibility'] as string | undefined,
                allowedTools: frontmatter['allowed-tools'] as string | undefined,
                category: meta['category'] as string | undefined,
                tags: (meta['tags'] as string[]) ?? [],
                triggers: (meta['triggers'] as string[]) ?? [],
                keywords: (meta['keywords'] as string[]) ?? [],
                authorName: (meta['author'] as Record<string, unknown>)?.['name'] as string | undefined,
                authorEmail: (meta['author'] as Record<string, unknown>)?.['email'] as string | undefined,
                authorUrl: (meta['author'] as Record<string, unknown>)?.['url'] as string | undefined,
                githubRepo: claims.repository,
                latestVersion: version,
              },
              tx
            );

            // Upsert version
            const { created: versionCreated, oldStoragePath: oldPath } =
              await skillRepo.upsertVersion(existingSkill.id, {
                skillId: existingSkill.id,
                version,
                frontmatter,
                content: skillContent,
                prerelease,
                releaseTag: release_tag,
                releaseUrl: release.html_url,
                storagePath,
                sourceUrl: asset.browser_download_url,
                digest: `sha256:${computedSha256}`,
                sizeBytes: BigInt(artifact.size),
                publishMethod: 'oidc',
                provenanceRepository: provenance.repository,
                provenanceSha: provenance.sha,
                provenance,
              }, tx);

            status = versionCreated ? 'created' : 'exists';
            oldStoragePath = oldPath;

            // Update latest version if this is stable
            if (versionCreated && !prerelease) {
              await skillRepo.updateLatestVersion(existingSkill.id, version, tx);
            }
          });
        } catch (error) {
          // Clean up on failure
          try {
            await fastify.storage.deleteBundle(storagePath);
            fastify.log.info(`Cleaned up after transaction failure: ${storagePath}`);
          } catch (cleanupError) {
            fastify.log.error({ err: cleanupError, path: storagePath }, 'Failed to cleanup uploaded file');
          }
          throw error;
        }

        // Clean up old storage if updated
        if (oldStoragePath) {
          try {
            await fastify.storage.deleteBundle(oldStoragePath);
            fastify.log.info(`Cleaned up old skill: ${oldStoragePath}`);
          } catch (cleanupError) {
            fastify.log.warn({ err: cleanupError, path: oldStoragePath }, 'Failed to cleanup old skill file');
          }
        }

        fastify.log.info(
          {
            op: 'skill_announce',
            skill: name,
            version,
            repo: claims.repository,
            status,
            ms: Date.now() - announceStart,
          },
          `skill_announce: ${status} ${name}@${version} (${Date.now() - announceStart}ms)`
        );

        // Non-blocking Discord notification for new or updated skills
        notifyDiscordAnnounce({ name, version, type: 'skill', repo: claims.repository });

        return {
          skill: name,
          version,
          status,
        };
      } catch (error) {
        fastify.log.error(
          { op: 'skill_announce', error: error instanceof Error ? error.message : 'unknown' },
          `skill_announce: failed`
        );
        return handleError(error, request, reply);
      }
    },
  });
};
