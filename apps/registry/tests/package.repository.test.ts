/**
 * PackageRepository.upsertPackage tests.
 *
 * Guards the announce metadata-refresh contract: an upsert must refresh
 * manifest-derived metadata on the UPDATE path (the bug this fixes was an
 * empty `update: {}`), while never letting an announce overwrite
 * ownership/trust or version-ordering fields. Runs against a mocked
 * transaction client — no database needed.
 */

import { describe, expect, it, vi } from 'vitest';
import type { TransactionClient } from '../src/db/client.js';
import {
  type CreatePackageData,
  PackageRepository,
} from '../src/db/repositories/package.repository.js';

// Fields an announce must never touch on an existing package — owned by the
// claim flow (verified/claimedBy/claimedAt), creation (createdBy), and
// updateLatestVersion (latestVersion).
const CREATE_ONLY_FIELDS = [
  'verified',
  'latestVersion',
  'createdBy',
  'claimedBy',
  'claimedAt',
] as const;

function makeData(overrides: Partial<CreatePackageData> = {}): CreatePackageData {
  return {
    name: '@scope/example',
    displayName: 'Example',
    description: 'An example bundle',
    authorName: 'Author',
    authorEmail: 'author@example.com',
    authorUrl: 'https://example.com',
    homepage: 'https://example.com/home',
    license: 'MIT',
    iconUrl: 'https://example.com/icon.png',
    serverType: 'python',
    verified: true,
    latestVersion: '1.2.3',
    createdBy: 'user-1',
    githubRepo: 'scope/example',
    claimedBy: 'user-1',
    claimedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeTx() {
  const upsert = vi.fn().mockResolvedValue({ id: 'pkg-1', name: '@scope/example' });
  const findUnique = vi.fn().mockResolvedValue(null);
  const tx = { package: { upsert, findUnique } } as unknown as TransactionClient;
  return { tx, upsert, findUnique };
}

describe('PackageRepository.upsertPackage', () => {
  const repo = new PackageRepository();

  it('refreshes manifest-derived metadata on the update path', async () => {
    const { tx, upsert } = makeTx();
    await repo.upsertPackage(makeData(), tx);

    const { update } = upsert.mock.calls[0][0];
    expect(update).toMatchObject({
      displayName: 'Example',
      description: 'An example bundle',
      authorName: 'Author',
      authorEmail: 'author@example.com',
      authorUrl: 'https://example.com',
      homepage: 'https://example.com/home',
      license: 'MIT',
      iconUrl: 'https://example.com/icon.png',
      serverType: 'python',
      githubRepo: 'scope/example',
    });
  });

  it('never overwrites ownership/trust or version fields on update', async () => {
    const { tx, upsert } = makeTx();
    await repo.upsertPackage(makeData(), tx);

    const { update } = upsert.mock.calls[0][0];
    for (const field of CREATE_ONLY_FIELDS) {
      expect(update, `update must not carry "${field}"`).not.toHaveProperty(field);
    }
  });

  it('still sets ownership/trust and version fields on create', async () => {
    const { tx, upsert } = makeTx();
    await repo.upsertPackage(makeData(), tx);

    const { create } = upsert.mock.calls[0][0];
    expect(create).toMatchObject({
      name: '@scope/example',
      displayName: 'Example',
      verified: true,
      latestVersion: '1.2.3',
      createdBy: 'user-1',
      claimedBy: 'user-1',
    });
  });

  it('reports created=false when the package already exists', async () => {
    const { tx, findUnique } = makeTx();
    findUnique.mockResolvedValueOnce({ id: 'pkg-1', name: '@scope/example' });

    const { created } = await repo.upsertPackage(makeData(), tx);
    expect(created).toBe(false);
  });
});

/**
 * Scan status and certification answer different questions, so they are read
 * from different rows: the newest attempt says whether a scan is running or
 * failed, the newest completed scan is the only honest source for a level.
 * Reading both from one row means either a running scan is invisible or a
 * failed one blanks a level the bundle earned.
 */
describe('PackageRepository.getVersionsWithArtifactsAndScans', () => {
  const version = { id: 'ver-1', packageId: 'pkg-1', version: '1.0.0' };

  const makeClient = (attempt: unknown, completed: unknown[]) =>
    ({
      packageVersion: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ ...version, artifacts: [], securityScans: [attempt] }]),
      },
      securityScan: { findMany: vi.fn().mockResolvedValue(completed) },
    }) as unknown as TransactionClient;

  it('reports the running attempt while preserving the last certified level', async () => {
    const client = makeClient({ status: 'scanning', certificationLevel: null }, [
      { versionId: 'ver-1', status: 'completed', certificationLevel: 2 },
    ]);

    const [result] = await new PackageRepository().getVersionsWithArtifactsAndScans(
      'pkg-1',
      client,
    );

    expect(result.securityScans[0]).toMatchObject({ status: 'scanning' });
    expect(result.latestCompletedScan).toMatchObject({ certificationLevel: 2 });
  });

  it('reports a failed attempt without blanking the level', async () => {
    const client = makeClient({ status: 'failed', certificationLevel: null }, [
      { versionId: 'ver-1', status: 'completed', certificationLevel: 2 },
    ]);

    const [result] = await new PackageRepository().getVersionsWithArtifactsAndScans(
      'pkg-1',
      client,
    );

    expect(result.securityScans[0]).toMatchObject({ status: 'failed' });
    expect(result.latestCompletedScan).toMatchObject({ certificationLevel: 2 });
  });

  it('takes the newest completed scan when several exist', async () => {
    const client = makeClient({ status: 'completed', certificationLevel: 1 }, [
      { versionId: 'ver-1', status: 'completed', certificationLevel: 1 },
      { versionId: 'ver-1', status: 'completed', certificationLevel: 2 },
    ]);

    const [result] = await new PackageRepository().getVersionsWithArtifactsAndScans(
      'pkg-1',
      client,
    );

    // The query orders newest first, so the first row seen per version wins.
    expect(result.latestCompletedScan).toMatchObject({ certificationLevel: 1 });
  });

  it('leaves certification null when no scan has ever completed', async () => {
    const client = makeClient({ status: 'failed', certificationLevel: null }, []);

    const [result] = await new PackageRepository().getVersionsWithArtifactsAndScans(
      'pkg-1',
      client,
    );

    expect(result.latestCompletedScan).toBeNull();
  });
});
