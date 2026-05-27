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
