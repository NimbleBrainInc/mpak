/**
 * Skill Repository
 * Handles operations for skills and skill versions
 */

import type { Skill, SkillVersion, Prisma } from '@prisma/client';
import { getPrismaClient, type TransactionClient } from '../client.js';
import type { FindOptions } from '../types.js';

export interface CreateSkillData {
  name: string;
  description?: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
  category?: string;
  tags?: string[];
  triggers?: string[];
  keywords?: string[];
  authorName?: string;
  authorEmail?: string;
  authorUrl?: string;
  githubRepo?: string;
  latestVersion: string;
}

export interface CreateSkillVersionData {
  skillId: string;
  version: string;
  frontmatter: unknown;
  content?: string;
  prerelease?: boolean;
  releaseTag?: string;
  releaseUrl?: string;
  storagePath: string;
  sourceUrl?: string;
  digest: string;
  sizeBytes: bigint;
  publishMethod?: string;
  provenanceRepository?: string;
  provenanceSha?: string;
  provenance?: unknown;
}

export interface SkillSearchFilters {
  query?: string;
  category?: string;
  tags?: string[];
}

export interface SkillSearchResult {
  skills: Skill[];
  total: number;
}

export class SkillRepository {
  /**
   * Find skill by name
   */
  async findByName(name: string, tx?: TransactionClient): Promise<Skill | null> {
    const client = tx ?? getPrismaClient();
    return client.skill.findUnique({
      where: { name },
    });
  }

  /**
   * Find skill with versions
   */
  async findByNameWithVersions(
    name: string,
    tx?: TransactionClient
  ): Promise<(Skill & { versions: SkillVersion[] }) | null> {
    const client = tx ?? getPrismaClient();
    return client.skill.findUnique({
      where: { name },
      include: {
        versions: {
          orderBy: { publishedAt: 'desc' },
        },
      },
    });
  }

  /**
   * Search skills with filters
   */
  async search(
    filters: SkillSearchFilters,
    options: FindOptions,
    tx?: TransactionClient
  ): Promise<SkillSearchResult> {
    const client = tx ?? getPrismaClient();

    const where: Prisma.SkillWhereInput = {};

    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: 'insensitive' } },
        { description: { contains: filters.query, mode: 'insensitive' } },
        { triggers: { hasSome: [filters.query] } },
        { keywords: { hasSome: [filters.query] } },
      ];
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    const [skills, total] = await Promise.all([
      client.skill.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: (options.orderBy as Prisma.SkillOrderByWithRelationInput) ?? { totalDownloads: 'desc' },
      }),
      client.skill.count({ where }),
    ]);

    return { skills, total };
  }

  /**
   * Create a skill
   */
  async create(data: CreateSkillData, tx?: TransactionClient): Promise<Skill> {
    const client = tx ?? getPrismaClient();
    return client.skill.create({
      data: {
        name: data.name,
        description: data.description,
        license: data.license,
        compatibility: data.compatibility,
        allowedTools: data.allowedTools,
        category: data.category,
        tags: data.tags ?? [],
        triggers: data.triggers ?? [],
        keywords: data.keywords ?? [],
        authorName: data.authorName,
        authorEmail: data.authorEmail,
        authorUrl: data.authorUrl,
        githubRepo: data.githubRepo,
        latestVersion: data.latestVersion,
      },
    });
  }

  /**
   * Upsert a skill by name
   */
  async upsertSkill(
    data: CreateSkillData,
    tx?: TransactionClient
  ): Promise<{ skill: Skill; created: boolean }> {
    const client = tx ?? getPrismaClient();

    const existing = await client.skill.findUnique({
      where: { name: data.name },
    });

    const skill = await client.skill.upsert({
      where: { name: data.name },
      create: {
        name: data.name,
        description: data.description,
        license: data.license,
        compatibility: data.compatibility,
        allowedTools: data.allowedTools,
        category: data.category,
        tags: data.tags ?? [],
        triggers: data.triggers ?? [],
        keywords: data.keywords ?? [],
        authorName: data.authorName,
        authorEmail: data.authorEmail,
        authorUrl: data.authorUrl,
        githubRepo: data.githubRepo,
        latestVersion: data.latestVersion,
      },
      update: {
        description: data.description,
        license: data.license,
        compatibility: data.compatibility,
        allowedTools: data.allowedTools,
        category: data.category,
        tags: data.tags ?? [],
        triggers: data.triggers ?? [],
        keywords: data.keywords ?? [],
        authorName: data.authorName,
        authorEmail: data.authorEmail,
        authorUrl: data.authorUrl,
      },
    });

    return { skill, created: !existing };
  }

  /**
   * Update latest version
   */
  async updateLatestVersion(
    id: string,
    version: string,
    tx?: TransactionClient
  ): Promise<Skill> {
    const client = tx ?? getPrismaClient();
    return client.skill.update({
      where: { id },
      data: { latestVersion: version },
    });
  }

  /**
   * Increment download count
   */
  async incrementDownloads(id: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? getPrismaClient();
    await client.skill.update({
      where: { id },
      data: {
        totalDownloads: { increment: 1 },
      },
    });
  }

  // ==================== Skill Version Methods ====================

  /**
   * Find version by skill ID and version string
   */
  async findVersion(
    skillId: string,
    version: string,
    tx?: TransactionClient
  ): Promise<SkillVersion | null> {
    const client = tx ?? getPrismaClient();
    return client.skillVersion.findUnique({
      where: {
        skillId_version: { skillId, version },
      },
    });
  }

  /**
   * Get all versions for a skill
   */
  async getVersions(skillId: string, tx?: TransactionClient): Promise<SkillVersion[]> {
    const client = tx ?? getPrismaClient();
    return client.skillVersion.findMany({
      where: { skillId },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /**
   * Create a skill version
   */
  async createVersion(
    data: CreateSkillVersionData,
    tx?: TransactionClient
  ): Promise<SkillVersion> {
    const client = tx ?? getPrismaClient();
    return client.skillVersion.create({
      data: {
        skillId: data.skillId,
        version: data.version,
        frontmatter: data.frontmatter as Prisma.InputJsonValue,
        content: data.content,
        prerelease: data.prerelease ?? false,
        releaseTag: data.releaseTag,
        releaseUrl: data.releaseUrl,
        storagePath: data.storagePath,
        sourceUrl: data.sourceUrl,
        digest: data.digest,
        sizeBytes: data.sizeBytes,
        publishMethod: data.publishMethod,
        provenanceRepository: data.provenanceRepository,
        provenanceSha: data.provenanceSha,
        provenance: data.provenance as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Upsert a skill version
   */
  async upsertVersion(
    skillId: string,
    data: CreateSkillVersionData,
    tx?: TransactionClient
  ): Promise<{ version: SkillVersion; created: boolean; oldStoragePath: string | null }> {
    const client = tx ?? getPrismaClient();

    const existing = await client.skillVersion.findUnique({
      where: {
        skillId_version: { skillId, version: data.version },
      },
    });

    if (existing) {
      const oldStoragePath =
        existing.storagePath !== data.storagePath ? existing.storagePath : null;

      const updated = await client.skillVersion.update({
        where: { id: existing.id },
        data: {
          frontmatter: data.frontmatter as Prisma.InputJsonValue,
          content: data.content,
          prerelease: data.prerelease ?? false,
          storagePath: data.storagePath,
          sourceUrl: data.sourceUrl,
          digest: data.digest,
          sizeBytes: data.sizeBytes,
          ...(data.publishMethod ? { publishMethod: data.publishMethod } : {}),
          ...(data.provenanceRepository ? { provenanceRepository: data.provenanceRepository } : {}),
          ...(data.provenanceSha ? { provenanceSha: data.provenanceSha } : {}),
          ...(data.provenance ? { provenance: data.provenance as Prisma.InputJsonValue } : {}),
          ...(data.releaseTag && !existing.releaseTag ? { releaseTag: data.releaseTag } : {}),
          ...(data.releaseUrl && !existing.releaseUrl ? { releaseUrl: data.releaseUrl } : {}),
        },
      });
      return { version: updated, created: false, oldStoragePath };
    }

    const created = await this.createVersion(data, tx);
    return { version: created, created: true, oldStoragePath: null };
  }

  /**
   * Increment version download count
   */
  async incrementVersionDownloads(
    skillId: string,
    version: string,
    tx?: TransactionClient
  ): Promise<void> {
    const client = tx ?? getPrismaClient();
    await client.skillVersion.update({
      where: {
        skillId_version: { skillId, version },
      },
      data: {
        downloadCount: { increment: 1 },
      },
    });
  }
}
