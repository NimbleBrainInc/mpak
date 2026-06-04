/**
 * Package Repository
 * Handles operations for packages and versions
 */

import type { Artifact, Package, PackageVersion, Prisma, SecurityScan } from '@prisma/client';
import { getPrismaClient, type TransactionClient } from '../client.js';
import type { FindOptions, PackageSearchFilters, PackageWithRelations } from '../types.js';

// Version with artifacts included
export type PackageVersionWithArtifacts = PackageVersion & {
  artifacts: Artifact[];
};

// Minimal version fields for public version listings (see getVersions)
export type VersionListItem = Pick<PackageVersion, 'version' | 'publishedAt' | 'downloadCount'>;

/**
 * Scan columns the listing/lookup paths actually use — just the MTF
 * certification summary. The full `SecurityScan.report` JSON averages
 * ~120 KB uncompressed on the wire (TOAST-compressed to ~16 KB on
 * disk), so eager-loading whole scan rows on hot, crawled endpoints was
 * the dominant source of database egress. These four scalars are all
 * `scanToCertification` / the `/v1/bundles` certification block read;
 * the report itself is served only by the dedicated scan endpoints,
 * which run their own queries. Keep this in sync with `SCAN_CERT_SELECT`.
 */
export type ScanCertFields = Pick<
  SecurityScan,
  'certificationLevel' | 'controlsPassed' | 'controlsFailed' | 'controlsTotal'
>;

const SCAN_CERT_SELECT = {
  certificationLevel: true,
  controlsPassed: true,
  controlsFailed: true,
  controlsTotal: true,
} as const satisfies Prisma.SecurityScanSelect;

// Version with artifacts and the latest completed scan's certification summary
export type PackageVersionWithArtifactsAndScans = PackageVersion & {
  artifacts: Artifact[];
  securityScans: ScanCertFields[];
};

/**
 * Package row joined with its versions, per-version artifacts, and
 * (when present) the latest completed security scan per version. The
 * shape `findPackageForServerLookup` and `findPackagesForServerListing`
 * return — both pull the same data in one query so the route layer
 * can compose `ServerDetail` without further round-trips. Scans are
 * projected to the certification summary only (see {@link ScanCertFields}).
 */
export type PackageForServerLookup = Package & {
  versions: (PackageVersion & {
    artifacts: Artifact[];
    securityScans: ScanCertFields[];
  })[];
};

export interface CreatePackageData {
  name: string;
  displayName?: string;
  description?: string;
  authorName?: string;
  authorEmail?: string;
  authorUrl?: string;
  homepage?: string;
  license?: string;
  iconUrl?: string;
  serverType: string;
  verified?: boolean;
  latestVersion: string;
  createdBy?: string;
  githubRepo?: string;
  claimedBy?: string;
  claimedAt?: Date;
}

export interface CreatePackageVersionData {
  packageId: string;
  version: string;
  manifest: unknown;
  prerelease?: boolean;
  publishedBy: string | null;
  publishedByEmail: string | null;
  releaseTag?: string;
  releaseUrl?: string;
  sourceIndex?: unknown;
  readme?: string;
  publishMethod?: string;
  provenanceRepository?: string;
  provenanceSha?: string;
  provenance?: unknown;
  serverJson?: unknown;
}

export interface CreateArtifactData {
  versionId: string;
  os: string;
  arch: string;
  mimeType?: string;
  digest: string;
  sizeBytes: bigint;
  storagePath: string;
  sourceUrl: string;
}

export interface PackageSearchResult {
  packages: Package[];
  total: number;
}

export class PackageRepository {
  /**
   * Find package by ID
   */
  async findById(id: string, tx?: TransactionClient): Promise<Package | null> {
    const client = tx ?? getPrismaClient();
    return client.package.findUnique({
      where: { id },
    });
  }

  /**
   * Find package by name
   */
  async findByName(name: string, tx?: TransactionClient): Promise<Package | null> {
    const client = tx ?? getPrismaClient();
    return client.package.findUnique({
      where: { name },
    });
  }

  /**
   * Find package with all relations
   */
  async findByNameWithRelations(
    name: string,
    tx?: TransactionClient,
  ): Promise<PackageWithRelations | null> {
    const client = tx ?? getPrismaClient();
    return client.package.findUnique({
      where: { name },
      include: {
        versions: {
          orderBy: { publishedAt: 'desc' },
        },
      },
    });
  }

  /**
   * Search packages with filters
   */
  async search(
    filters: PackageSearchFilters,
    options: FindOptions,
    tx?: TransactionClient,
  ): Promise<PackageSearchResult> {
    const client = tx ?? getPrismaClient();

    const where: Prisma.PackageWhereInput = {};

    if (filters.query) {
      where.OR = [
        { name: { contains: filters.query, mode: 'insensitive' } },
        { displayName: { contains: filters.query, mode: 'insensitive' } },
        { description: { contains: filters.query, mode: 'insensitive' } },
      ];
    }

    if (filters.serverType) {
      where.serverType = filters.serverType;
    }

    if (filters.verified !== undefined) {
      where.verified = filters.verified;
    }

    if (filters.createdBy) {
      where.createdBy = filters.createdBy;
    }

    if (filters.claimedBy) {
      where.claimedBy = filters.claimedBy;
    }

    const [packages, total] = await Promise.all([
      client.package.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: (options.orderBy as Prisma.PackageOrderByWithRelationInput) ?? {
          totalDownloads: 'desc',
        },
      }),
      client.package.count({ where }),
    ]);

    return { packages, total };
  }

  /**
   * Create a package
   */
  async create(data: CreatePackageData, tx?: TransactionClient): Promise<Package> {
    const client = tx ?? getPrismaClient();
    return client.package.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        authorName: data.authorName,
        authorEmail: data.authorEmail,
        authorUrl: data.authorUrl,
        homepage: data.homepage,
        license: data.license,
        iconUrl: data.iconUrl,
        serverType: data.serverType,
        verified: data.verified ?? false,
        latestVersion: data.latestVersion,
        createdBy: data.createdBy,
        githubRepo: data.githubRepo,
        claimedBy: data.claimedBy,
        claimedAt: data.claimedAt,
      },
    });
  }

  /**
   * Update a package
   */
  async update(
    id: string,
    data: Partial<CreatePackageData>,
    tx?: TransactionClient,
  ): Promise<Package> {
    const client = tx ?? getPrismaClient();
    return client.package.update({
      where: { id },
      data,
    });
  }

  /**
   * Update latest version
   */
  async updateLatestVersion(id: string, version: string, tx?: TransactionClient): Promise<Package> {
    const client = tx ?? getPrismaClient();
    return client.package.update({
      where: { id },
      data: { latestVersion: version },
    });
  }

  /**
   * Increment download count
   */
  async incrementDownloads(id: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? getPrismaClient();
    await client.package.update({
      where: { id },
      data: {
        totalDownloads: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Delete a package
   */
  async delete(id: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? getPrismaClient();
    await client.package.delete({
      where: { id },
    });
  }

  /**
   * Upsert a package by name (atomic find-or-create)
   */
  async upsertPackage(
    data: CreatePackageData,
    tx?: TransactionClient,
  ): Promise<{ package: Package; created: boolean }> {
    const client = tx ?? getPrismaClient();

    const existing = await client.package.findUnique({
      where: { name: data.name },
    });

    // Manifest-derived metadata refreshed on every announce so re-releases
    // pick up changes (display name, description, icon, author, etc.).
    // `undefined` values are skipped by Prisma, so a manifest that omits a
    // field leaves the existing value intact rather than nulling it.
    // Hoisted into one object and reused for both create and update so the
    // two clauses cannot drift — the empty `update: {}` that this object
    // replaces was itself a create/update drift bug.
    const manifestMetadata = {
      displayName: data.displayName,
      description: data.description,
      authorName: data.authorName,
      authorEmail: data.authorEmail,
      authorUrl: data.authorUrl,
      homepage: data.homepage,
      license: data.license,
      iconUrl: data.iconUrl,
      serverType: data.serverType,
      githubRepo: data.githubRepo,
    };

    const pkg = await client.package.upsert({
      where: { name: data.name },
      create: {
        name: data.name,
        ...manifestMetadata,
        // Ownership/trust and version ordering are set only at creation.
        // On update they are owned elsewhere: `latestVersion` by
        // updateLatestVersion, `verified`/`claimedBy`/`claimedAt` by the
        // claim flow — never overwritten by an announce.
        verified: data.verified ?? false,
        latestVersion: data.latestVersion,
        createdBy: data.createdBy,
        claimedBy: data.claimedBy,
        claimedAt: data.claimedAt,
      },
      update: manifestMetadata,
    });

    return { package: pkg, created: !existing };
  }

  /**
   * Get packages by creator
   */
  async findByCreator(
    createdBy: string,
    options: FindOptions,
    tx?: TransactionClient,
  ): Promise<Package[]> {
    const client = tx ?? getPrismaClient();
    return client.package.findMany({
      where: { createdBy },
      skip: options.skip,
      take: options.take,
      orderBy: (options.orderBy as Prisma.PackageOrderByWithRelationInput) ?? { createdAt: 'desc' },
    });
  }

  /**
   * Find a package by its npm-style scoped name with all versions,
   * artifacts, and the latest completed security scan per version
   * (joined in one query — avoids the per-version round-trip the
   * caller used to do for certification metadata).
   */
  async findPackageForServerLookup(
    name: string,
    tx?: TransactionClient,
  ): Promise<PackageForServerLookup | null> {
    const client = tx ?? getPrismaClient();
    return client.package.findUnique({
      where: { name },
      include: {
        versions: {
          orderBy: { publishedAt: 'desc' },
          include: {
            artifacts: true,
            securityScans: {
              where: { status: 'completed' },
              orderBy: { startedAt: 'desc' },
              take: 1,
              select: SCAN_CERT_SELECT,
            },
          },
        },
      },
    });
  }

  /**
   * List packages with their latest version, artifacts, and the
   * latest completed security scan — all in one query. Honors a
   * case-insensitive substring search on name / displayName /
   * description and an optional `updatedSince` filter pushed down to
   * the database so pagination math reflects the filter (a request
   * like `limit=100&updatedSince=...` returns up to 100 *matching*
   * packages, not 100 fetched then filtered to a few).
   */
  async findPackagesForServerListing(
    filters: { search?: string; updatedSince?: Date },
    options: { skip?: number; take?: number },
    tx?: TransactionClient,
  ): Promise<{ packages: PackageForServerLookup[]; total: number }> {
    const client = tx ?? getPrismaClient();

    const conditions: Prisma.PackageWhereInput[] = [];
    if (filters.search) {
      conditions.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { displayName: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.updatedSince) {
      // "Updated" here means "has at least one version published since".
      // Filter at the DB so pagination cursor math is consistent.
      conditions.push({
        versions: { some: { publishedAt: { gte: filters.updatedSince } } },
      });
    }
    const where: Prisma.PackageWhereInput =
      conditions.length === 0 ? {} : conditions.length === 1 ? conditions[0]! : { AND: conditions };

    const [packages, total] = await Promise.all([
      client.package.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: { name: 'asc' },
        include: {
          versions: {
            orderBy: { publishedAt: 'desc' },
            take: 1,
            include: {
              artifacts: true,
              securityScans: {
                where: { status: 'completed' },
                orderBy: { startedAt: 'desc' },
                take: 1,
                select: SCAN_CERT_SELECT,
              },
            },
          },
        },
      }),
      client.package.count({ where }),
    ]);

    return { packages, total };
  }

  // ==================== Package Version Methods ====================

  /**
   * Find version by package ID and version string, including latest completed security scan
   */
  async findVersionWithLatestScan(
    packageId: string,
    version: string,
    tx?: TransactionClient,
  ): Promise<PackageVersionWithArtifactsAndScans | null> {
    const client = tx ?? getPrismaClient();
    return client.packageVersion.findUnique({
      where: {
        packageId_version: {
          packageId,
          version,
        },
      },
      include: {
        artifacts: true,
        securityScans: {
          where: { status: 'completed' },
          orderBy: { startedAt: 'desc' },
          take: 1,
          select: SCAN_CERT_SELECT,
        },
      },
    });
  }

  /**
   * Find version by package ID and version string
   */
  async findVersion(
    packageId: string,
    version: string,
    tx?: TransactionClient,
  ): Promise<PackageVersion | null> {
    const client = tx ?? getPrismaClient();
    return client.packageVersion.findUnique({
      where: {
        packageId_version: {
          packageId,
          version,
        },
      },
    });
  }

  /**
   * Get the version list for a package — just the fields the public
   * version listing renders. Deliberately omits the heavy `manifest`,
   * `readme`, `serverJson`, `sourceIndex`, and `provenance` columns: a
   * package's full version history was being fetched in full to emit
   * three small fields per version, multiplying egress on the bundle
   * detail endpoint.
   */
  async getVersions(packageId: string, tx?: TransactionClient): Promise<VersionListItem[]> {
    const client = tx ?? getPrismaClient();
    return client.packageVersion.findMany({
      where: { packageId },
      orderBy: { publishedAt: 'desc' },
      select: { version: true, publishedAt: true, downloadCount: true },
    });
  }

  /**
   * Get latest version for a package
   */
  async getLatestVersion(
    packageId: string,
    tx?: TransactionClient,
  ): Promise<PackageVersion | null> {
    const client = tx ?? getPrismaClient();
    const versions = await client.packageVersion.findMany({
      where: { packageId },
      orderBy: { publishedAt: 'desc' },
      take: 1,
    });
    return versions[0] ?? null;
  }

  /**
   * Create a package version
   */
  async createVersion(
    data: CreatePackageVersionData,
    tx?: TransactionClient,
  ): Promise<PackageVersion> {
    const client = tx ?? getPrismaClient();
    return client.packageVersion.create({
      data: {
        packageId: data.packageId,
        version: data.version,
        manifest: data.manifest as Prisma.InputJsonValue,
        prerelease: data.prerelease ?? false,
        publishedBy: data.publishedBy,
        publishedByEmail: data.publishedByEmail,
        releaseTag: data.releaseTag,
        releaseUrl: data.releaseUrl,
        sourceIndex: data.sourceIndex as Prisma.InputJsonValue,
        readme: data.readme,
        publishMethod: data.publishMethod,
        provenanceRepository: data.provenanceRepository,
        provenanceSha: data.provenanceSha,
        provenance: data.provenance as Prisma.InputJsonValue,
        serverJson: data.serverJson as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Upsert a package version (find or create, update manifest/prerelease if exists)
   */
  async upsertVersion(
    packageId: string,
    data: CreatePackageVersionData,
    tx?: TransactionClient,
  ): Promise<{ version: PackageVersion; created: boolean }> {
    const client = tx ?? getPrismaClient();

    const existing = await client.packageVersion.findUnique({
      where: {
        packageId_version: {
          packageId,
          version: data.version,
        },
      },
    });

    const version = await client.packageVersion.upsert({
      where: {
        packageId_version: {
          packageId,
          version: data.version,
        },
      },
      create: {
        packageId: data.packageId,
        version: data.version,
        manifest: data.manifest as Prisma.InputJsonValue,
        prerelease: data.prerelease ?? false,
        publishedBy: data.publishedBy,
        publishedByEmail: data.publishedByEmail,
        releaseTag: data.releaseTag,
        releaseUrl: data.releaseUrl,
        sourceIndex: data.sourceIndex as Prisma.InputJsonValue,
        readme: data.readme,
        publishMethod: data.publishMethod,
        provenanceRepository: data.provenanceRepository,
        provenanceSha: data.provenanceSha,
        provenance: data.provenance as Prisma.InputJsonValue,
        serverJson: data.serverJson as Prisma.InputJsonValue,
      },
      update: {
        manifest: data.manifest as Prisma.InputJsonValue,
        prerelease: data.prerelease ?? false,
        ...(data.publishMethod ? { publishMethod: data.publishMethod } : {}),
        ...(data.provenanceRepository ? { provenanceRepository: data.provenanceRepository } : {}),
        ...(data.provenanceSha ? { provenanceSha: data.provenanceSha } : {}),
        ...(data.provenance ? { provenance: data.provenance as Prisma.InputJsonValue } : {}),
        ...(data.serverJson !== undefined
          ? { serverJson: data.serverJson as Prisma.InputJsonValue }
          : {}),
      },
    });

    return { version, created: !existing };
  }

  /**
   * Find version with artifacts
   */
  async findVersionWithArtifacts(
    packageId: string,
    version: string,
    tx?: TransactionClient,
  ): Promise<PackageVersionWithArtifacts | null> {
    const client = tx ?? getPrismaClient();
    return client.packageVersion.findUnique({
      where: {
        packageId_version: {
          packageId,
          version,
        },
      },
      include: {
        artifacts: true,
      },
    });
  }

  /**
   * Get all versions with artifacts for a package
   */
  async getVersionsWithArtifacts(
    packageId: string,
    tx?: TransactionClient,
  ): Promise<PackageVersionWithArtifacts[]> {
    const client = tx ?? getPrismaClient();
    return client.packageVersion.findMany({
      where: { packageId },
      include: {
        artifacts: true,
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /**
   * Get all versions with artifacts and security scans for a package
   */
  async getVersionsWithArtifactsAndScans(
    packageId: string,
    tx?: TransactionClient,
  ): Promise<PackageVersionWithArtifactsAndScans[]> {
    const client = tx ?? getPrismaClient();
    return client.packageVersion.findMany({
      where: { packageId },
      include: {
        artifacts: true,
        securityScans: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  // ==================== Artifact Methods ====================

  /**
   * Create an artifact for a version
   */
  async createArtifact(data: CreateArtifactData, tx?: TransactionClient): Promise<Artifact> {
    const client = tx ?? getPrismaClient();
    return client.artifact.create({
      data: {
        versionId: data.versionId,
        os: data.os,
        arch: data.arch,
        mimeType: data.mimeType ?? 'application/vnd.mcp.bundle.v0.3+gzip',
        digest: data.digest,
        sizeBytes: data.sizeBytes,
        storagePath: data.storagePath,
        sourceUrl: data.sourceUrl,
      },
    });
  }

  /**
   * Create multiple artifacts for a version
   */
  async createArtifacts(artifacts: CreateArtifactData[], tx?: TransactionClient): Promise<number> {
    const client = tx ?? getPrismaClient();
    const result = await client.artifact.createMany({
      data: artifacts.map((a) => ({
        versionId: a.versionId,
        os: a.os,
        arch: a.arch,
        mimeType: a.mimeType ?? 'application/vnd.mcp.bundle.v0.3+gzip',
        digest: a.digest,
        sizeBytes: a.sizeBytes,
        storagePath: a.storagePath,
        sourceUrl: a.sourceUrl,
      })),
    });
    return result.count;
  }

  /**
   * Get artifacts for a version
   */
  async getArtifacts(versionId: string, tx?: TransactionClient): Promise<Artifact[]> {
    const client = tx ?? getPrismaClient();
    return client.artifact.findMany({
      where: { versionId },
    });
  }

  /**
   * Get artifact by platform
   */
  async getArtifactByPlatform(
    versionId: string,
    os: string,
    arch: string,
    tx?: TransactionClient,
  ): Promise<Artifact | null> {
    const client = tx ?? getPrismaClient();
    return client.artifact.findUnique({
      where: {
        versionId_os_arch: {
          versionId,
          os,
          arch,
        },
      },
    });
  }

  /**
   * Upsert an artifact by (versionId, os, arch)
   */
  async upsertArtifact(
    data: CreateArtifactData,
    tx?: TransactionClient,
  ): Promise<{ artifact: Artifact; created: boolean; oldStoragePath: string | null }> {
    const client = tx ?? getPrismaClient();

    const existing = await client.artifact.findUnique({
      where: {
        versionId_os_arch: {
          versionId: data.versionId,
          os: data.os,
          arch: data.arch,
        },
      },
    });

    const oldStoragePath =
      existing && existing.storagePath !== data.storagePath ? existing.storagePath : null;

    const artifact = await client.artifact.upsert({
      where: {
        versionId_os_arch: {
          versionId: data.versionId,
          os: data.os,
          arch: data.arch,
        },
      },
      create: {
        versionId: data.versionId,
        os: data.os,
        arch: data.arch,
        mimeType: data.mimeType ?? 'application/vnd.mcp.bundle.v0.3+gzip',
        digest: data.digest,
        sizeBytes: data.sizeBytes,
        storagePath: data.storagePath,
        sourceUrl: data.sourceUrl,
      },
      update: {
        mimeType: data.mimeType ?? 'application/vnd.mcp.bundle.v0.3+gzip',
        digest: data.digest,
        sizeBytes: data.sizeBytes,
        storagePath: data.storagePath,
        sourceUrl: data.sourceUrl,
      },
    });

    return { artifact, created: !existing, oldStoragePath };
  }

  /**
   * Count artifacts for a version
   */
  async countVersionArtifacts(versionId: string, tx?: TransactionClient): Promise<number> {
    const client = tx ?? getPrismaClient();
    return client.artifact.count({
      where: { versionId },
    });
  }

  /**
   * Delete all artifacts for a version
   */
  async deleteArtifacts(versionId: string, tx?: TransactionClient): Promise<number> {
    const client = tx ?? getPrismaClient();
    const result = await client.artifact.deleteMany({
      where: { versionId },
    });
    return result.count;
  }

  /**
   * Increment artifact download count
   */
  async incrementArtifactDownloads(artifactId: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? getPrismaClient();
    await client.artifact.update({
      where: { id: artifactId },
      data: {
        downloadCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Increment version download count
   */
  async incrementVersionDownloads(
    packageId: string,
    version: string,
    tx?: TransactionClient,
  ): Promise<void> {
    const client = tx ?? getPrismaClient();
    await client.packageVersion.update({
      where: {
        packageId_version: {
          packageId,
          version,
        },
      },
      data: {
        downloadCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Delete a version
   */
  async deleteVersion(packageId: string, version: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? getPrismaClient();
    await client.packageVersion.delete({
      where: {
        packageId_version: {
          packageId,
          version,
        },
      },
    });
  }

  /**
   * Check if a package is claimable (i.e., not yet claimed)
   */
  async isClaimable(name: string, tx?: TransactionClient): Promise<boolean> {
    const client = tx ?? getPrismaClient();
    const pkg = await client.package.findUnique({
      where: { name },
      select: { claimedBy: true },
    });

    return pkg?.claimedBy === null;
  }

  /**
   * Claim a package
   */
  async claimPackage(
    name: string,
    claimedBy: string,
    githubRepo: string,
    tx?: TransactionClient,
  ): Promise<Package> {
    const client = tx ?? getPrismaClient();
    return client.package.update({
      where: { name },
      data: {
        claimedBy,
        claimedAt: new Date(),
        githubRepo,
      },
    });
  }

  /**
   * Get all unclaimed packages
   */
  async findUnclaimed(options: FindOptions, tx?: TransactionClient): Promise<PackageSearchResult> {
    const client = tx ?? getPrismaClient();

    const [packages, total] = await Promise.all([
      client.package.findMany({
        where: {
          claimedBy: null,
        },
        skip: options.skip,
        take: options.take,
        orderBy: options.orderBy as Prisma.PackageOrderByWithRelationInput,
      }),
      client.package.count({
        where: {
          claimedBy: null,
        },
      }),
    ]);

    return { packages, total };
  }

  /**
   * Get packages claimed by a specific user
   */
  async findClaimedByUser(
    userId: string,
    options: FindOptions,
    tx?: TransactionClient,
  ): Promise<PackageSearchResult> {
    const client = tx ?? getPrismaClient();

    const [packages, total] = await Promise.all([
      client.package.findMany({
        where: {
          claimedBy: userId,
        },
        skip: options.skip,
        take: options.take,
        orderBy: options.orderBy as Prisma.PackageOrderByWithRelationInput,
      }),
      client.package.count({
        where: {
          claimedBy: userId,
        },
      }),
    ]);

    return { packages, total };
  }

  /**
   * Update package GitHub repository
   */
  async updateGitHubRepo(
    name: string,
    githubRepo: string,
    tx?: TransactionClient,
  ): Promise<Package> {
    const client = tx ?? getPrismaClient();
    return client.package.update({
      where: { name },
      data: { githubRepo },
    });
  }

  /**
   * Update GitHub stats for a package
   */
  async updateGitHubStats(
    packageId: string,
    stats: {
      stars: number;
      forks: number;
      watchers: number;
    },
    tx?: TransactionClient,
  ): Promise<Package> {
    const client = tx ?? getPrismaClient();
    return client.package.update({
      where: { id: packageId },
      data: {
        githubStars: stats.stars,
        githubForks: stats.forks,
        githubWatchers: stats.watchers,
        githubUpdatedAt: new Date(),
      },
    });
  }
}
