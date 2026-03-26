import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MpakBundleCache } from '../src/cache.js';
import type { MpakClient } from '../src/client.js';
import { MpakCacheCorruptedError } from '../src/errors.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const validManifest = {
  manifest_version: '0.3',
  name: '@scope/name',
  version: '1.0.0',
  description: 'Test bundle',
  server: {
    type: 'node' as const,
    entry_point: 'index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/index.js'],
    },
  },
};

const validMetadata = {
  version: '1.0.0',
  pulledAt: '2026-03-21T00:00:00.000Z',
  platform: { os: 'darwin', arch: 'arm64' },
};

function mockClient(overrides: Partial<MpakClient> = {}): MpakClient {
  return {
    getBundleDownload: vi.fn(),
    getBundle: vi.fn(),
    downloadContent: vi.fn(),
    ...overrides,
  } as unknown as MpakClient;
}

// ---------------------------------------------------------------------------
// Helpers — seed a cache entry on disk
// ---------------------------------------------------------------------------

function seedCacheEntry(
  cacheHome: string,
  dirName: string,
  opts: { manifest?: object; metadata?: object } = {},
) {
  const dir = join(cacheHome, 'cache', dirName);
  mkdirSync(dir, { recursive: true });
  if (opts.manifest) {
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(opts.manifest));
  }
  if (opts.metadata) {
    writeFileSync(join(dir, '.mpak-meta.json'), JSON.stringify(opts.metadata));
  }
  return dir;
}

// ===========================================================================
// Tests
// ===========================================================================

describe('MpakBundleCache', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-cache-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // getBundleCacheDirName
  // -------------------------------------------------------------------------

  describe('getBundleCacheDirName', () => {
    it('maps @scope/name to scope-name under cache home', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      expect(cache.getBundleCacheDirName('@scope/name')).toBe(join(testDir, 'cache', 'scope-name'));
    });

    it('handles unscoped names', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      expect(cache.getBundleCacheDirName('simple')).toBe(join(testDir, 'cache', 'simple'));
    });
  });

  // -------------------------------------------------------------------------
  // getBundleMetadata
  // -------------------------------------------------------------------------

  describe('getBundleMetadata', () => {
    it('returns null when package directory does not exist', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      expect(cache.getBundleMetadata('@scope/name')).toBeNull();
    });

    it('returns validated metadata when file is valid', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', { metadata: validMetadata });

      expect(cache.getBundleMetadata('@scope/name')).toEqual(validMetadata);
    });

    it('preserves optional lastCheckedAt field', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const meta = { ...validMetadata, lastCheckedAt: '2026-03-21T01:00:00.000Z' };
      seedCacheEntry(testDir, 'scope-name', { metadata: meta });

      expect(cache.getBundleMetadata('@scope/name')).toEqual(meta);
    });

    it('throws MpakCacheCorruptedError for invalid JSON', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const dir = join(testDir, 'cache', 'scope-name');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, '.mpak-meta.json'), 'not json');

      expect(() => cache.getBundleMetadata('@scope/name')).toThrow(MpakCacheCorruptedError);
    });

    it('throws MpakCacheCorruptedError when schema validation fails', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', { metadata: { bad: true } });

      expect(() => cache.getBundleMetadata('@scope/name')).toThrow(MpakCacheCorruptedError);
    });
  });

  // -------------------------------------------------------------------------
  // getBundleManifest
  // -------------------------------------------------------------------------

  describe('getBundleManifest', () => {
    it('returns null when package is not cached', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      expect(cache.getBundleManifest('@scope/name')).toBeNull();
    });

    it('returns validated manifest when file is valid', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', { manifest: validManifest });

      expect(cache.getBundleManifest('@scope/name')).toEqual(validManifest);
    });

    it('throws MpakCacheCorruptedError when manifest.json is missing but dir exists', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name');

      expect(() => cache.getBundleManifest('@scope/name')).toThrow(MpakCacheCorruptedError);
    });

    it('throws MpakCacheCorruptedError for corrupt JSON', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const dir = join(testDir, 'cache', 'scope-name');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'manifest.json'), '{not valid');

      expect(() => cache.getBundleManifest('@scope/name')).toThrow(MpakCacheCorruptedError);
    });

    it('throws MpakCacheCorruptedError when schema validation fails', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', { manifest: { name: 'test' } });

      expect(() => cache.getBundleManifest('@scope/name')).toThrow(MpakCacheCorruptedError);
    });
  });

  // -------------------------------------------------------------------------
  // listCachedBundles
  // -------------------------------------------------------------------------

  describe('listCachedBundles', () => {
    it('returns empty array when cache directory does not exist', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: join(testDir, 'nonexistent') });
      expect(cache.listCachedBundles()).toEqual([]);
    });

    it('returns bundles with valid metadata and manifest', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const dir = seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      expect(cache.listCachedBundles()).toEqual([{
        name: '@scope/name',
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        cacheDir: dir,
      }]);
    });

    it('skips _local directory', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      seedCacheEntry(testDir, '_local', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      expect(cache.listCachedBundles()).toEqual([]);
    });

    it('skips entries with missing manifest', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', { metadata: validMetadata });

      expect(cache.listCachedBundles()).toEqual([]);
    });

    it('skips entries with corrupt manifest', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const dir = join(testDir, 'cache', 'scope-name');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'manifest.json'), 'not json');
      writeFileSync(join(dir, '.mpak-meta.json'), JSON.stringify(validMetadata));

      expect(cache.listCachedBundles()).toEqual([]);
    });

    it('skips entries with missing metadata', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', { manifest: validManifest });

      expect(cache.listCachedBundles()).toEqual([]);
    });

    it('returns multiple valid bundles and skips corrupt ones', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });

      const manifest2 = { ...validManifest, name: '@scope/other', version: '2.0.0' };
      const meta2 = { ...validMetadata, version: '2.0.0' };

      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });
      seedCacheEntry(testDir, 'scope-other', {
        manifest: manifest2,
        metadata: meta2,
      });
      // Corrupt entry — should be skipped
      const corruptDir = join(testDir, 'cache', 'scope-bad');
      mkdirSync(corruptDir, { recursive: true });
      writeFileSync(join(corruptDir, 'manifest.json'), 'bad');

      const bundles = cache.listCachedBundles();
      expect(bundles).toHaveLength(2);
      expect(bundles.map((b) => b.name).sort()).toEqual(['@scope/name', '@scope/other']);
    });
  });

  // -------------------------------------------------------------------------
  // removeCachedBundle
  // -------------------------------------------------------------------------

  describe('removeCachedBundle', () => {
    it('returns false when bundle is not cached', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      expect(cache.removeCachedBundle('@scope/name')).toBe(false);
    });

    it('removes the cache directory and returns true', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const dir = seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      expect(cache.removeCachedBundle('@scope/name')).toBe(true);
      expect(existsSync(dir)).toBe(false);
    });

    it('bundle no longer appears in listCachedBundles after removal', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      expect(cache.listCachedBundles()).toHaveLength(1);
      cache.removeCachedBundle('@scope/name');
      expect(cache.listCachedBundles()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // checkForUpdate
  // -------------------------------------------------------------------------

  describe('checkForUpdate', () => {
    it('returns null when bundle is not cached', async () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      expect(await cache.checkForUpdate('@scope/name')).toBeNull();
    });

    it('returns latest version when update is available', async () => {
      const client = mockClient({
        getBundle: vi.fn().mockResolvedValue({ latest_version: '2.0.0' }),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      expect(await cache.checkForUpdate('@scope/name')).toBe('2.0.0');
    });

    it('returns null when already up to date', async () => {
      const client = mockClient({
        getBundle: vi.fn().mockResolvedValue({ latest_version: '1.0.0' }),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      expect(await cache.checkForUpdate('@scope/name')).toBeNull();
    });

    it('returns null when within TTL window', async () => {
      const client = mockClient({
        getBundle: vi.fn(),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: {
          ...validMetadata,
          lastCheckedAt: new Date().toISOString(), // just checked
        },
      });

      expect(await cache.checkForUpdate('@scope/name')).toBeNull();
      // Should not have called the API
      expect(client.getBundle).not.toHaveBeenCalled();
    });

    it('returns null on network error', async () => {
      const client = mockClient({
        getBundle: vi.fn().mockRejectedValue(new Error('network down')),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      expect(await cache.checkForUpdate('@scope/name')).toBeNull();
    });

    it('updates lastCheckedAt after successful check', async () => {
      const client = mockClient({
        getBundle: vi.fn().mockResolvedValue({ latest_version: '1.0.0' }),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      await cache.checkForUpdate('@scope/name');

      const meta = cache.getBundleMetadata('@scope/name');
      expect(meta?.lastCheckedAt).toBeDefined();
    });
  });
});
