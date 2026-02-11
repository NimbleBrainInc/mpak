import Fastify, { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';

/**
 * Create a test Fastify instance with common configuration.
 * Use this for testing routes and response serialization.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // Disable logging in tests
  });

  // Use plain JSON.stringify for response serialization (matches production)
  app.setReplySerializer((payload) => JSON.stringify(payload));

  await app.register(sensible);

  return app;
}

/**
 * Mock repository data for testing
 */
export const mockPackage = {
  id: 'test-id',
  name: '@test/package',
  displayName: 'Test Package',
  description: 'A test package',
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
  claimedBy: null,
  claimedAt: null,
  githubRepo: 'test/package',
  githubStars: 10,
  githubForks: 2,
  githubWatchers: 5,
  githubUpdatedAt: null,
};

export const mockVersion = {
  id: 'version-id',
  packageId: 'test-id',
  version: '1.0.0',
  manifest: { name: '@test/package', version: '1.0.0' },
  readme: '# Test Package',
  prerelease: false,
  releaseTag: 'v1.0.0',
  releaseUrl: 'https://github.com/test/package/releases/tag/v1.0.0',
  sourceIndex: null,
  publishedBy: 'user-id',
  publishedByEmail: 'user@test.com',
  publishedAt: new Date('2024-01-01'),
  publishMethod: 'oidc',
  provenanceRepository: 'test/package',
  provenanceSha: 'abc123',
  provenance: {
    schema_version: '1.0',
    provider: 'github',
    repository: 'test/package',
    sha: 'abc123',
  },
  downloadCount: BigInt(50),
  artifacts: [
    {
      id: 'artifact-id',
      versionId: 'version-id',
      os: 'linux',
      arch: 'x64',
      digest: 'sha256:abc123',
      mimeType: 'application/octet-stream',
      sizeBytes: BigInt(1024),
      storagePath: '/test/path',
      sourceUrl: 'https://github.com/test/package/releases/download/v1.0.0/package.mcpb',
      downloadCount: BigInt(50),
      createdAt: new Date('2024-01-01'),
    },
  ],
};
