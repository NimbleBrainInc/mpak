/**
 * Upstream takedowns must actually stop a package being served.
 *
 * The predicate existed for two review rounds while roughly half the public
 * read paths never applied it — including the one that streams bytes. Nothing
 * caught that because nothing asserted the behaviour, only its plumbing. These
 * tests assert the outcome at both layers: the SQL the repository builds, and
 * the status a caller gets from each public surface.
 */

import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/errors/middleware.js';
import {
  createMockPackageRepo,
  createMockStorage,
  mockArtifact,
  mockPackage,
  mockVersion,
} from './helpers.js';

describe('SERVABLE predicate', () => {
  it('lets a natively published package through and excludes a taken-down one', async () => {
    // `not: 'deleted'` alone compiles to `<> 'deleted'`, which is null-unsafe in
    // SQL — it would drop every package published to mpak directly, since their
    // upstreamStatus is null. The explicit OR is what keeps them visible.
    const findFirst = vi.fn().mockResolvedValue(null);
    vi.doMock('../src/db/client.js', () => ({
      getPrismaClient: () => ({ package: { findFirst } }),
    }));

    const { PackageRepository } = await import('../src/db/repositories/package.repository.js');
    await new PackageRepository().findByName('@test/mcp-server');

    const where = findFirst.mock.calls[0]?.[0]?.where;
    expect(where.OR).toEqual([{ upstreamStatus: null }, { upstreamStatus: { not: 'deleted' } }]);
    vi.doUnmock('../src/db/client.js');
  });
});

describe('public read surfaces honour a takedown', () => {
  let app: FastifyInstance;
  let packageRepo: ReturnType<typeof createMockPackageRepo>;

  beforeEach(async () => {
    packageRepo = createMockPackageRepo();
    app = Fastify({ logger: false });
    app.setReplySerializer((payload) => JSON.stringify(payload));
    await app.register(sensible);
    app.setErrorHandler(errorHandler);
    app.decorate('repositories', { packages: packageRepo, users: {} });
    app.decorate('storage', createMockStorage());
    app.decorate('prisma', {} as never);

    const { bundleRoutes } = await import('../src/routes/v1/bundles.js');
    await app.register(bundleRoutes, { prefix: '/v1/bundles' });
    await app.ready();
  });

  // A taken-down package is absent from the serving lookup, so every route
  // built on it must 404 rather than serve. The download route is the one that
  // matters most: it hands over bytes and increments the counters.
  it.each([
    ['detail', '/v1/bundles/@test/mcp-server'],
    ['index.json', '/v1/bundles/@test/mcp-server/index.json'],
    ['versions', '/v1/bundles/@test/mcp-server/versions'],
    ['version detail', '/v1/bundles/@test/mcp-server/versions/1.0.0'],
    ['download', '/v1/bundles/@test/mcp-server/versions/1.0.0/download'],
  ])('%s resolves through the serving lookup, not the unfiltered one', async (_label, url) => {
    packageRepo.findByName.mockResolvedValue(null); // excluded by SERVABLE
    packageRepo.findByNameIncludingTakenDown.mockResolvedValue(mockPackage);

    const res = await app.inject({ method: 'GET', url });

    // Asserting the *lookup*, not just the status: with a mocked repository a
    // 404 proves nothing on its own, since a route using the unfiltered lookup
    // would 404 too if that mock returned null. What distinguishes a correct
    // route from the bug this file exists for is which method it reaches for.
    expect(packageRepo.findByName).toHaveBeenCalledWith('@test/mcp-server');
    expect(packageRepo.findByNameIncludingTakenDown).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('still serves a package that was not taken down', async () => {
    packageRepo.findByName.mockResolvedValue(mockPackage);
    packageRepo.findVersionWithArtifacts.mockResolvedValue({
      ...mockVersion,
      artifacts: [mockArtifact],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/v1/bundles/@test/mcp-server/versions/1.0.0',
    });

    expect(res.statusCode).toBe(200);
  });

  it('routes deciding name ownership do NOT use the serving lookup', async () => {
    // Publish and claim ask "is this name taken", and a taken-down package
    // still occupies its name. If they used the filtered lookup, a second
    // package could quietly claim a name that is still held.
    const { packageRoutes } = await import('../src/routes/packages.js');
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/routes/packages.ts', 'utf8'),
    );

    expect(packageRoutes).toBeTypeOf('function');
    // The publish pre-check and both claim routes.
    expect(src.match(/findByNameIncludingTakenDown\(/g)?.length).toBe(3);
  });
});
