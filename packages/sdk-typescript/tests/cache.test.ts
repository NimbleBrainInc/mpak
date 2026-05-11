import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MpakBundleCache } from '../src/cache.js';
import { MpakClient } from '../src/client.js';
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
    vi.restoreAllMocks();
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

      expect(cache.listCachedBundles()).toEqual([
        {
          name: '@scope/name',
          version: '1.0.0',
          pulledAt: '2026-03-21T00:00:00.000Z',
          cacheDir: dir,
        },
      ]);
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
    it('returns up-to-date when bundle is not cached', async () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      expect((await cache.checkForUpdate('@scope/name')).status).toBe('up-to-date');
    });

    it('returns update-available with latest version when update exists', async () => {
      const client = mockClient({
        getBundle: vi.fn().mockResolvedValue({ latest_version: '2.0.0' }),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      const result = await cache.checkForUpdate('@scope/name');
      expect(result).toEqual({ status: 'update-available', latestVersion: '2.0.0' });
    });

    it('returns up-to-date when already on latest version', async () => {
      const client = mockClient({
        getBundle: vi.fn().mockResolvedValue({ latest_version: '1.0.0' }),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      expect((await cache.checkForUpdate('@scope/name')).status).toBe('up-to-date');
    });

    it('returns up-to-date within TTL window without calling registry', async () => {
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

      expect((await cache.checkForUpdate('@scope/name')).status).toBe('up-to-date');
      expect(client.getBundle).not.toHaveBeenCalled();
    });

    it('returns check-failed with reason on network error', async () => {
      const client = mockClient({
        getBundle: vi.fn().mockRejectedValue(new Error('network down')),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });

      const result = await cache.checkForUpdate('@scope/name');
      expect(result).toEqual({ status: 'check-failed', reason: 'network down' });
    });

    it('bypasses TTL when force is true', async () => {
      const client = mockClient({
        getBundle: vi.fn().mockResolvedValue({ latest_version: '2.0.0' }),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: {
          ...validMetadata,
          lastCheckedAt: new Date().toISOString(), // just checked
        },
      });

      const result = await cache.checkForUpdate('@scope/name', { force: true });
      expect(result).toEqual({ status: 'update-available', latestVersion: '2.0.0' });
      expect(client.getBundle).toHaveBeenCalledWith('@scope/name');
    });

    it('returns up-to-date when force is true but already on latest version', async () => {
      const client = mockClient({
        getBundle: vi.fn().mockResolvedValue({ latest_version: '1.0.0' }),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });
      seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: {
          ...validMetadata,
          lastCheckedAt: new Date().toISOString(),
        },
      });

      expect((await cache.checkForUpdate('@scope/name', { force: true })).status).toBe(
        'up-to-date',
      );
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

  // -------------------------------------------------------------------------
  // loadBundle — platform guard fixes (#78)
  // -------------------------------------------------------------------------

  describe('loadBundle', () => {
    const fakeDownloadInfo = {
      url: 'https://example.com/bundle.mcpb',
      bundle: {
        name: '@scope/name',
        version: '1.0.0',
        platform: { os: 'linux', arch: 'x64' },
        sha256: 'deadbeef',
        size: 1000,
      },
    };

    it('re-downloads when cached platform does not match current platform', async () => {
      const client = mockClient({
        getBundleDownload: vi.fn().mockResolvedValue(fakeDownloadInfo),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });

      // Cache has darwin/arm64
      seedCacheEntry(testDir, 'scope-name', { manifest: validManifest, metadata: validMetadata });

      // Host is linux/x64
      vi.spyOn(MpakClient, 'detectPlatform').mockReturnValue({ os: 'linux', arch: 'x64' });
      vi.spyOn(cache as any, 'downloadAndExtract').mockResolvedValue(undefined);

      await cache.loadBundle('@scope/name');

      expect(client.getBundleDownload).toHaveBeenCalled();
    });

    it('uses cache and skips registry when platform and version match', async () => {
      const client = mockClient({
        getBundleDownload: vi.fn(),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });

      // Cache has darwin/arm64
      seedCacheEntry(testDir, 'scope-name', { manifest: validManifest, metadata: validMetadata });

      // Host is also darwin/arm64
      vi.spyOn(MpakClient, 'detectPlatform').mockReturnValue({ os: 'darwin', arch: 'arm64' });

      await cache.loadBundle('@scope/name');

      expect(client.getBundleDownload).not.toHaveBeenCalled();
    });

    it('re-downloads when force is true even if platform and version match', async () => {
      const client = mockClient({
        getBundleDownload: vi.fn().mockResolvedValue(fakeDownloadInfo),
      });
      const cache = new MpakBundleCache(client, { mpakHome: testDir });

      // Cache has darwin/arm64
      seedCacheEntry(testDir, 'scope-name', { manifest: validManifest, metadata: validMetadata });

      // Host matches cache platform
      vi.spyOn(MpakClient, 'detectPlatform').mockReturnValue({ os: 'darwin', arch: 'arm64' });
      vi.spyOn(cache as any, 'downloadAndExtract').mockResolvedValue(undefined);

      await cache.loadBundle('@scope/name', { force: true });

      expect(client.getBundleDownload).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getCacheInfo
  // -------------------------------------------------------------------------

  describe('getCacheInfo', () => {
    it('returns empty lists when cache does not exist', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const info = cache.getCacheInfo();
      expect(info.registryBundles).toEqual([]);
      expect(info.localBundles).toEqual([]);
      expect(info.totalBytes).toBe(0);
    });

    it('reports registry bundles with size', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const dir = seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });
      writeFileSync(join(dir, 'index.js'), 'x'.repeat(100));

      const info = cache.getCacheInfo();

      expect(info.registryBundles).toHaveLength(1);
      expect(info.registryBundles[0].name).toBe('@scope/name');
      expect(info.registryBundles[0].version).toBe('1.0.0');
      expect(info.registryBundles[0].bytes).toBeGreaterThan(0);
    });

    it('reports local bundles with size', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const localDir = join(testDir, 'cache', '_local', 'abc123');
      mkdirSync(localDir, { recursive: true });
      writeFileSync(
        join(localDir, '.mpak-local-meta.json'),
        JSON.stringify({ localPath: '/some/bundle.mcpb', extractedAt: '2026-05-10T00:00:00.000Z' }),
      );
      writeFileSync(join(localDir, 'index.js'), 'x'.repeat(200));

      const info = cache.getCacheInfo();

      expect(info.localBundles).toHaveLength(1);
      expect(info.localBundles[0].hash).toBe('abc123');
      expect(info.localBundles[0].localPath).toBe('/some/bundle.mcpb');
      expect(info.localBundles[0].bytes).toBeGreaterThan(0);
    });

    it('totalBytes is the sum of all entries', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });

      const registryDir = seedCacheEntry(testDir, 'scope-name', {
        manifest: validManifest,
        metadata: validMetadata,
      });
      writeFileSync(join(registryDir, 'data.bin'), Buffer.alloc(500));

      const localDir = join(testDir, 'cache', '_local', 'def456');
      mkdirSync(localDir, { recursive: true });
      writeFileSync(
        join(localDir, '.mpak-local-meta.json'),
        JSON.stringify({ localPath: '/some/bundle.mcpb', extractedAt: '2026-05-10T00:00:00.000Z' }),
      );
      writeFileSync(join(localDir, 'data.bin'), Buffer.alloc(300));

      const info = cache.getCacheInfo();
      expect(info.totalBytes).toBe(info.registryBundles[0].bytes + info.localBundles[0].bytes);
    });

    it('skips local entries with missing or corrupt meta', () => {
      const cache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
      const localDir = join(testDir, 'cache', '_local', 'corrupt');
      mkdirSync(localDir, { recursive: true });
      writeFileSync(join(localDir, '.mpak-local-meta.json'), 'not json');

      const info = cache.getCacheInfo();
      expect(info.localBundles).toHaveLength(0);
    });
  });
});
