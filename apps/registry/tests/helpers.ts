/**
 * Test helpers: mock factories for Fastify decorators and repository data.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { vi } from 'vitest';

/**
 * Create a test Fastify instance with common configuration.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.setReplySerializer((payload) => JSON.stringify(payload));
  await app.register(sensible);
  return app;
}

/**
 * Create a mock PackageRepository with all methods stubbed.
 */
export function createMockPackageRepo() {
  return {
    findById: vi.fn(),
    findByName: vi.fn(),
    findByNameWithRelations: vi.fn(),
    search: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateLatestVersion: vi.fn(),
    incrementDownloads: vi.fn(),
    delete: vi.fn(),
    upsertPackage: vi.fn(),
    findByCreator: vi.fn(),
    findPackagesWithServerJson: vi.fn(),
    findPackageWithServerJsonByName: vi.fn(),
    findVersionWithLatestScan: vi.fn(),
    findVersion: vi.fn(),
    getVersions: vi.fn(),
    getLatestVersion: vi.fn(),
    createVersion: vi.fn(),
    upsertVersion: vi.fn(),
    findVersionWithArtifacts: vi.fn(),
    getVersionsWithArtifacts: vi.fn(),
    getVersionsWithArtifactsAndScans: vi.fn(),
    createArtifact: vi.fn(),
    createArtifacts: vi.fn(),
    getArtifacts: vi.fn(),
    getArtifactByPlatform: vi.fn(),
    upsertArtifact: vi.fn(),
    countVersionArtifacts: vi.fn(),
    deleteArtifacts: vi.fn(),
    incrementArtifactDownloads: vi.fn(),
    incrementVersionDownloads: vi.fn(),
    deleteVersion: vi.fn(),
    isClaimable: vi.fn(),
    claimPackage: vi.fn(),
    findUnclaimed: vi.fn(),
    findClaimedByUser: vi.fn(),
    updateGitHubRepo: vi.fn(),
    updateGitHubStats: vi.fn(),
  };
}

/**
 * Create a mock SkillRepository with all methods stubbed.
 */
export function createMockSkillRepo() {
  return {
    findById: vi.fn(),
    findByName: vi.fn(),
    findByNameWithVersions: vi.fn(),
    search: vi.fn(),
    findVersion: vi.fn(),
    incrementDownloads: vi.fn(),
    incrementVersionDownloads: vi.fn(),
    upsertSkill: vi.fn(),
    upsertVersion: vi.fn(),
    updateLatestVersion: vi.fn(),
  };
}

/**
 * Create a mock UserRepository.
 */
export function createMockUserRepo() {
  return {
    upsert: vi.fn(),
    findById: vi.fn(),
    findByClerkId: vi.fn(),
  };
}

/**
 * Create a mock StorageService.
 */
export function createMockStorage() {
  return {
    saveBundle: vi.fn(),
    saveBundleFromStream: vi.fn(),
    getBundle: vi.fn().mockResolvedValue(Buffer.from('mock-bundle-data')),
    getBundleUrl: vi.fn().mockReturnValue('/mock/url'),
    getSignedDownloadUrl: vi.fn().mockResolvedValue('https://cdn.example.com/signed'),
    getSignedDownloadUrlFromPath: vi.fn().mockResolvedValue('https://cdn.example.com/signed'),
    deleteBundle: vi.fn(),
  };
}

/**
 * Create a mock PrismaClient with commonly accessed models.
 */
export function createMockPrisma() {
  return {
    package: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    packageVersion: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    securityScan: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    artifact: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

export const mockPackage = {
  id: 'pkg-001',
  name: '@test/mcp-server',
  displayName: 'Test MCP Server',
  description: 'A test MCP server bundle',
  authorName: 'Test Author',
  authorEmail: null,
  authorUrl: null,
  homepage: null,
  license: 'MIT',
  iconUrl: null,
  serverType: 'node',
  verified: false,
  latestVersion: '1.0.0',
  totalDownloads: BigInt(100),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  createdBy: null,
  claimedBy: null,
  claimedAt: null,
  githubRepo: 'test-org/mcp-server',
  githubStars: 10,
  githubForks: 2,
  githubWatchers: 5,
  githubUpdatedAt: null,
};

export const mockArtifact = {
  id: 'art-001',
  versionId: 'ver-001',
  os: 'linux',
  arch: 'x64',
  digest: 'sha256:abc123',
  mimeType: 'application/octet-stream',
  sizeBytes: BigInt(1024),
  storagePath: '@test/mcp-server/1.0.0/linux-x64.mcpb',
  sourceUrl: 'https://github.com/test-org/mcp-server/releases/download/v1.0.0/server-linux-x64.mcpb',
  downloadCount: BigInt(50),
  createdAt: new Date('2024-01-01'),
};

export const mockVersion = {
  id: 'ver-001',
  packageId: 'pkg-001',
  version: '1.0.0',
  manifest: { name: '@test/mcp-server', version: '1.0.0', server: { type: 'node' } },
  readme: '# Test MCP Server',
  prerelease: false,
  releaseTag: 'v1.0.0',
  releaseUrl: 'https://github.com/test-org/mcp-server/releases/tag/v1.0.0',
  sourceIndex: null,
  serverJson: null,
  publishedBy: null,
  publishedByEmail: null,
  publishedAt: new Date('2024-01-01'),
  publishMethod: 'oidc',
  provenanceRepository: 'test-org/mcp-server',
  provenanceSha: 'abc123def456',
  provenance: {
    schema_version: 1,
    provider: 'github_oidc',
    repository: 'test-org/mcp-server',
    sha: 'abc123def456',
    claims: {
      owner: 'test-org',
      owner_id: '12345',
      actor: 'test-user',
      actor_id: '67890',
      workflow: '.github/workflows/publish.yml',
      workflow_ref: 'ref',
      ref: 'refs/tags/v1.0.0',
      ref_type: 'tag',
      run_id: '1',
      run_number: '1',
      run_attempt: '1',
      event_name: 'release',
      job_workflow_ref: 'ref',
    },
  },
  downloadCount: BigInt(50),
};

export const mockVersionWithArtifacts = {
  ...mockVersion,
  artifacts: [mockArtifact],
};

export const mockVersionWithScans = {
  ...mockVersionWithArtifacts,
  securityScans: [] as unknown[],
};
