import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MpakSDK } from '../src/MpakSDK.js';
import { BundleCache } from '../src/cache.js';
import type { MpakClient } from '../src/client.js';

function mockDownloadClient(downloadInfo: { url: string; bundle: { name: string; version: string; platform: { os: string; arch: string }; sha256: string; size: number } }) {
  return {
    getBundleDownload: vi.fn().mockResolvedValue(downloadInfo),
  } as unknown as MpakClient;
}

function mockBundleClient(latestVersion: string) {
  return {
    getBundle: vi.fn().mockResolvedValue({ latest_version: latestVersion }),
  } as unknown as MpakClient;
}

describe('BundleCache', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-cache-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('getPackageCachePath', () => {
    it('maps @scope/name to scope-name under cache base', () => {
      const cache = new BundleCache({ mpakHome: testDir });

      expect(cache.getPackageCachePath('@scope/name')).toBe(join(testDir, 'cache', 'scope-name'));
    });

    it('handles unscoped names', () => {
      const cache = new BundleCache({ mpakHome: testDir });

      expect(cache.getPackageCachePath('simple')).toBe(join(testDir, 'cache', 'simple'));
    });
  });

  describe('getCacheMetadata / writeCacheMetadata', () => {
    const pkg = '@scope/name';

    it('returns null when no metadata file exists', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      mkdirSync(cache.getPackageCachePath(pkg), { recursive: true });

      expect(cache.getCacheMetadata(pkg)).toBeNull();
    });

    it('round-trips metadata through write and read', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      mkdirSync(cache.getPackageCachePath(pkg), { recursive: true });

      const metadata = {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      };

      cache.writeCacheMetadata(pkg, metadata);

      expect(cache.getCacheMetadata(pkg)).toEqual(metadata);
    });

    it('returns null for invalid JSON', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      const cacheDir = cache.getPackageCachePath(pkg);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, '.mpak-meta.json'), 'not json');

      expect(cache.getCacheMetadata(pkg)).toBeNull();
    });

    it('returns null for JSON that fails schema validation', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      const cacheDir = cache.getPackageCachePath(pkg);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, '.mpak-meta.json'), JSON.stringify({ bad: true }));

      expect(cache.getCacheMetadata(pkg)).toBeNull();
    });

    it('rejects unknown fields via strict schema', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      const cacheDir = cache.getPackageCachePath(pkg);
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(join(cacheDir, '.mpak-meta.json'), JSON.stringify({
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
        extra: 'field',
      }));

      expect(cache.getCacheMetadata(pkg)).toBeNull();
    });

    it('throws when writing invalid metadata', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      mkdirSync(cache.getPackageCachePath(pkg), { recursive: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => cache.writeCacheMetadata(pkg, { bad: true } as any)).toThrow('Invalid cache metadata');
    });

    it('preserves optional lastCheckedAt field', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      mkdirSync(cache.getPackageCachePath(pkg), { recursive: true });

      const metadata = {
        version: '2.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        lastCheckedAt: '2026-03-21T01:00:00.000Z',
        platform: { os: 'linux', arch: 'x64' },
      };

      cache.writeCacheMetadata(pkg, metadata);

      expect(cache.getCacheMetadata(pkg)).toEqual(metadata);
    });
  });

  describe('listCachedBundles', () => {
    it('returns empty array when cache directory does not exist', () => {
      const cache = new BundleCache({ mpakHome: join(testDir, 'nonexistent') });

      expect(cache.listCachedBundles()).toEqual([]);
    });

    it('returns bundles with valid metadata and manifest', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      const bundleDir = join(testDir, 'cache', 'scope-name');
      mkdirSync(bundleDir, { recursive: true });

      writeFileSync(join(bundleDir, '.mpak-meta.json'), JSON.stringify({
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      }));
      writeFileSync(join(bundleDir, 'manifest.json'), JSON.stringify({
        name: '@scope/name',
      }));

      const bundles = cache.listCachedBundles();

      expect(bundles).toHaveLength(1);
      expect(bundles[0]).toEqual({
        name: '@scope/name',
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        cacheDir: bundleDir,
      });
    });

    it('skips _local directory', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      const localDir = join(testDir, 'cache', '_local');
      mkdirSync(localDir, { recursive: true });
      writeFileSync(join(localDir, '.mpak-meta.json'), JSON.stringify({
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      }));
      writeFileSync(join(localDir, 'manifest.json'), JSON.stringify({ name: 'local' }));

      expect(cache.listCachedBundles()).toEqual([]);
    });

    it('skips entries without metadata', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      const bundleDir = join(testDir, 'cache', 'scope-name');
      mkdirSync(bundleDir, { recursive: true });
      writeFileSync(join(bundleDir, 'manifest.json'), JSON.stringify({ name: '@scope/name' }));

      expect(cache.listCachedBundles()).toEqual([]);
    });

    it('skips entries without manifest and logs', () => {
      const logger = vi.fn();
      const cache = new BundleCache({ mpakHome: testDir, logger });
      const bundleDir = join(testDir, 'cache', 'scope-name');
      mkdirSync(bundleDir, { recursive: true });
      writeFileSync(join(bundleDir, '.mpak-meta.json'), JSON.stringify({
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      }));

      expect(cache.listCachedBundles()).toEqual([]);
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('missing manifest.json'));
    });

    it('skips corrupt manifest and logs', () => {
      const logger = vi.fn();
      const cache = new BundleCache({ mpakHome: testDir, logger });
      const bundleDir = join(testDir, 'cache', 'scope-name');
      mkdirSync(bundleDir, { recursive: true });
      writeFileSync(join(bundleDir, '.mpak-meta.json'), JSON.stringify({
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      }));
      writeFileSync(join(bundleDir, 'manifest.json'), 'not json');

      expect(cache.listCachedBundles()).toEqual([]);
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('corrupt manifest.json'));
    });
  });

  describe('extractZip', () => {
    it('extracts a valid zip to the destination directory', () => {
      const srcDir = join(testDir, 'src');
      mkdirSync(srcDir);
      writeFileSync(join(srcDir, 'hello.txt'), 'hello world');

      const zipPath = join(testDir, 'test.zip');
      execFileSync('zip', ['-j', zipPath, join(srcDir, 'hello.txt')], { stdio: 'pipe' });

      const destDir = join(testDir, 'dest');
      BundleCache.extractZip(zipPath, destDir);

      expect(existsSync(join(destDir, 'hello.txt'))).toBe(true);
      expect(readFileSync(join(destDir, 'hello.txt'), 'utf8')).toBe('hello world');
    });

    it('creates the destination directory if it does not exist', () => {
      const srcDir = join(testDir, 'src');
      mkdirSync(srcDir);
      writeFileSync(join(srcDir, 'file.txt'), 'content');

      const zipPath = join(testDir, 'test.zip');
      execFileSync('zip', ['-j', zipPath, join(srcDir, 'file.txt')], { stdio: 'pipe' });

      const destDir = join(testDir, 'nested', 'deep', 'dest');
      BundleCache.extractZip(zipPath, destDir);

      expect(existsSync(join(destDir, 'file.txt'))).toBe(true);
    });

    it('throws for an invalid zip file', () => {
      const zipPath = join(testDir, 'bad.zip');
      writeFileSync(zipPath, 'not a zip');

      expect(() => BundleCache.extractZip(zipPath, join(testDir, 'dest')))
        .toThrow('Cannot verify bundle size before extraction');
    });
  });

  describe('constructor injection', () => {
    it('throws when calling loadBundle without a client', async () => {
      const cache = new BundleCache({ mpakHome: testDir });

      await expect(cache.loadBundle('@scope/pkg')).rejects.toThrow('MpakClient required');
    });

    it('throws when calling checkForUpdateAsync without a client', async () => {
      const cache = new BundleCache({ mpakHome: testDir });
      mkdirSync(cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      await expect(cache.checkForUpdateAsync('@scope/pkg')).rejects.toThrow('MpakClient required');
    });

    it('works for local-only operations without a client', () => {
      const cache = new BundleCache({ mpakHome: testDir });
      mkdirSync(cache.getPackageCachePath('@scope/pkg'), { recursive: true });

      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      expect(cache.getCacheMetadata('@scope/pkg')).toEqual({
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });
      expect(cache.listCachedBundles()).toEqual([]);
    });
  });

  describe('loadBundle', () => {
    function createTestZip(dir: string): string {
      const srcDir = join(dir, 'zip-src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'manifest.json'), JSON.stringify({ name: '@scope/pkg' }));
      const zipPath = join(dir, 'bundle.zip');
      execFileSync('zip', ['-j', zipPath, join(srcDir, 'manifest.json')], { stdio: 'pipe' });
      return zipPath;
    }

    it('downloads and extracts when no cache exists', async () => {
      const zipPath = createTestZip(testDir);
      const zipData = readFileSync(zipPath);

      const client = mockDownloadClient({
        url: 'https://example.com/bundle.zip',
        bundle: { name: '@scope/pkg', version: '1.0.0', platform: { os: 'darwin', arch: 'arm64' }, sha256: 'abc', size: 100 },
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(zipData, { status: 200 }),
      );

      const cache = new BundleCache({ mpakHome: testDir, client });
      const result = await cache.loadBundle('@scope/pkg');

      expect(result.pulled).toBe(true);
      expect(result.version).toBe('1.0.0');
      expect(existsSync(join(result.cacheDir, 'manifest.json'))).toBe(true);

      const meta = cache.getCacheMetadata('@scope/pkg');
      expect(meta).not.toBeNull();
      // Fresh downloads should NOT stamp lastCheckedAt — that's for update checks
      expect(meta?.lastCheckedAt).toBeUndefined();

      fetchSpy.mockRestore();
    });

    it('uses cache when version matches and force is false', async () => {
      const client = mockDownloadClient({
        url: 'https://example.com/bundle.zip',
        bundle: { name: '@scope/pkg', version: '1.0.0', platform: { os: 'darwin', arch: 'arm64' }, sha256: 'abc', size: 100 },
      });

      const cache = new BundleCache({ mpakHome: testDir, client });
      const cacheDir = cache.getPackageCachePath('@scope/pkg');
      mkdirSync(cacheDir, { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      const result = await cache.loadBundle('@scope/pkg');

      expect(result.pulled).toBe(false);
      expect(result.version).toBe('1.0.0');
      expect(client.getBundleDownload).not.toHaveBeenCalled();
    });

    it('downloads when cached version differs from requested', async () => {
      const zipPath = createTestZip(testDir);
      const zipData = readFileSync(zipPath);

      const client = mockDownloadClient({
        url: 'https://example.com/bundle.zip',
        bundle: { name: '@scope/pkg', version: '2.0.0', platform: { os: 'darwin', arch: 'arm64' }, sha256: 'abc', size: 100 },
      });

      const cache = new BundleCache({ mpakHome: testDir, client });
      const cacheDir = cache.getPackageCachePath('@scope/pkg');
      mkdirSync(cacheDir, { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(zipData, { status: 200 }),
      );

      const result = await cache.loadBundle('@scope/pkg', { version: '2.0.0' });

      expect(result.pulled).toBe(true);
      expect(result.version).toBe('2.0.0');

      fetchSpy.mockRestore();
    });

    it('skips download when resolved version matches cache', async () => {
      const client = mockDownloadClient({
        url: 'https://example.com/bundle.zip',
        bundle: { name: '@scope/pkg', version: '1.0.0', platform: { os: 'darwin', arch: 'arm64' }, sha256: 'abc', size: 100 },
      });

      const cache = new BundleCache({ mpakHome: testDir, client });
      const cacheDir = cache.getPackageCachePath('@scope/pkg');
      mkdirSync(cacheDir, { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      // Request version 2.0.0 (cache miss) but registry resolves to 1.0.0 (cache hit)
      const result = await cache.loadBundle('@scope/pkg', { version: '2.0.0' });

      expect(result.pulled).toBe(false);
      expect(client.getBundleDownload).toHaveBeenCalled();

      const meta = cache.getCacheMetadata('@scope/pkg');
      expect(meta?.lastCheckedAt).toBeDefined();
    });

    it('forces download when force is true even if cached', async () => {
      const zipPath = createTestZip(testDir);
      const zipData = readFileSync(zipPath);

      const client = mockDownloadClient({
        url: 'https://example.com/bundle.zip',
        bundle: { name: '@scope/pkg', version: '1.0.0', platform: { os: 'darwin', arch: 'arm64' }, sha256: 'abc', size: 100 },
      });

      const cache = new BundleCache({ mpakHome: testDir, client });
      const cacheDir = cache.getPackageCachePath('@scope/pkg');
      mkdirSync(cacheDir, { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(zipData, { status: 200 }),
      );

      const result = await cache.loadBundle('@scope/pkg', { force: true });

      expect(result.pulled).toBe(true);
      expect(client.getBundleDownload).toHaveBeenCalled();

      fetchSpy.mockRestore();
    });

    it('logs progress messages when logger is provided', async () => {
      const logger = vi.fn();
      const zipPath = createTestZip(testDir);
      const zipData = readFileSync(zipPath);

      const client = mockDownloadClient({
        url: 'https://example.com/bundle.zip',
        bundle: { name: '@scope/pkg', version: '1.0.0', platform: { os: 'darwin', arch: 'arm64' }, sha256: 'abc', size: 100 },
      });

      const cache = new BundleCache({ mpakHome: testDir, client, logger });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(zipData, { status: 200 }),
      );

      await cache.loadBundle('@scope/pkg');

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Pulling @scope/pkg@1.0.0'));
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Cached @scope/pkg@1.0.0'));

      fetchSpy.mockRestore();
    });
  });

  describe('checkForUpdateAsync', () => {
    it('logs when a newer version is available', async () => {
      const logger = vi.fn();
      const client = mockBundleClient('2.0.0');
      const cache = new BundleCache({ mpakHome: testDir, client, logger });
      mkdirSync(cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      await cache.checkForUpdateAsync('@scope/pkg');

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Update available'));
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('1.0.0 -> 2.0.0'));
    });

    it('logs up to date when version is current', async () => {
      const logger = vi.fn();
      const client = mockBundleClient('1.0.0');
      const cache = new BundleCache({ mpakHome: testDir, client, logger });
      mkdirSync(cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      await cache.checkForUpdateAsync('@scope/pkg');

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('is up to date'));
    });

    it('updates lastCheckedAt after checking', async () => {
      const client = mockBundleClient('1.0.0');
      const cache = new BundleCache({ mpakHome: testDir, client });
      mkdirSync(cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      await cache.checkForUpdateAsync('@scope/pkg');

      const meta = cache.getCacheMetadata('@scope/pkg');
      expect(meta?.lastCheckedAt).toBeDefined();
    });

    it('skips check if within TTL and logs remaining time', async () => {
      const logger = vi.fn();
      const client = mockBundleClient('2.0.0');
      const cache = new BundleCache({ mpakHome: testDir, client, logger });
      mkdirSync(cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        lastCheckedAt: new Date().toISOString(), // just checked
        platform: { os: 'darwin', arch: 'arm64' },
      });

      await cache.checkForUpdateAsync('@scope/pkg');

      expect(client.getBundle).not.toHaveBeenCalled();
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Skipping update check'));
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('next check in'));
    });

    it('does nothing when no cache exists', async () => {
      const logger = vi.fn();
      const client = mockBundleClient('1.0.0');
      const cache = new BundleCache({ mpakHome: testDir, client, logger });

      await cache.checkForUpdateAsync('@scope/pkg');

      expect(client.getBundle).not.toHaveBeenCalled();
      expect(logger).not.toHaveBeenCalled();
    });

    it('logs error message on failure without throwing', async () => {
      const logger = vi.fn();
      const client = {
        getBundle: vi.fn().mockRejectedValue(new Error('network down')),
      } as unknown as MpakClient;
      const cache = new BundleCache({ mpakHome: testDir, client, logger });
      mkdirSync(cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      await expect(cache.checkForUpdateAsync('@scope/pkg')).resolves.toBeUndefined();
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Cannot check for updates'));
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('network down'));
    });
  });

  describe('isSemverEqual', () => {
    it('returns true for identical versions', () => {
      expect(BundleCache.isSemverEqual('1.0.0', '1.0.0')).toBe(true);
    });

    it('returns true when one has v prefix and the other does not', () => {
      expect(BundleCache.isSemverEqual('v1.0.0', '1.0.0')).toBe(true);
      expect(BundleCache.isSemverEqual('1.0.0', 'v1.0.0')).toBe(true);
    });

    it('returns true when both have v prefix', () => {
      expect(BundleCache.isSemverEqual('v2.3.1', 'v2.3.1')).toBe(true);
    });

    it('returns false for different versions', () => {
      expect(BundleCache.isSemverEqual('1.0.0', '1.0.1')).toBe(false);
    });

    it('returns false for different versions with v prefix', () => {
      expect(BundleCache.isSemverEqual('v1.0.0', 'v2.0.0')).toBe(false);
    });
  });

  // ===========================================================================
  // Via MpakSDK facade
  // ===========================================================================

  describe('via MpakSDK facade', () => {
    function createTestZip(dir: string): string {
      const srcDir = join(dir, 'zip-src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'manifest.json'), JSON.stringify({ name: '@scope/pkg' }));
      const zipPath = join(dir, 'bundle.zip');
      execFileSync('zip', ['-j', zipPath, join(srcDir, 'manifest.json')], { stdio: 'pipe' });
      return zipPath;
    }

    it('local-only metadata operations work through facade', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      mkdirSync(sdk.cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      sdk.cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      const meta = sdk.cache.getCacheMetadata('@scope/pkg');
      expect(meta).toEqual({
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });
    });

    it('listCachedBundles works with multiple bundles through facade', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      for (const name of ['@scope/alpha', '@scope/beta']) {
        const dir = sdk.cache.getPackageCachePath(name);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, '.mpak-meta.json'), JSON.stringify({
          version: '1.0.0',
          pulledAt: '2026-03-21T00:00:00.000Z',
          platform: { os: 'darwin', arch: 'arm64' },
        }));
        writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ name }));
      }

      const bundles = sdk.cache.listCachedBundles();
      expect(bundles).toHaveLength(2);
      const names = bundles.map((b) => b.name).sort();
      expect(names).toEqual(['@scope/alpha', '@scope/beta']);
    });

    it('loadBundle downloads through the wired client', async () => {
      const zipPath = createTestZip(testDir);
      const zipData = readFileSync(zipPath);

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: 'https://example.com/bundle.zip',
            bundle: {
              name: '@scope/pkg',
              version: '1.0.0',
              platform: { os: 'darwin', arch: 'arm64' },
              sha256: 'abc',
              size: 100,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      fetchSpy.mockResolvedValueOnce(
        new Response(zipData, { status: 200 }),
      );

      const logs: string[] = [];
      const sdk = new MpakSDK({
        mpakHome: testDir,
        registryUrl: 'https://test.registry.dev',
        logger: (msg) => logs.push(msg),
      });

      const result = await sdk.cache.loadBundle('@scope/pkg');

      expect(result.pulled).toBe(true);
      expect(result.version).toBe('1.0.0');
      expect(existsSync(join(result.cacheDir, 'manifest.json'))).toBe(true);
      expect(logs.some((l) => l.includes('Pulling @scope/pkg@1.0.0'))).toBe(true);
      expect(logs.some((l) => l.includes('Cached @scope/pkg@1.0.0'))).toBe(true);

      fetchSpy.mockRestore();
    });

    it('loadBundle returns from cache on second call', async () => {
      const zipPath = createTestZip(testDir);
      const zipData = readFileSync(zipPath);

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: 'https://example.com/bundle.zip',
            bundle: {
              name: '@scope/pkg',
              version: '1.0.0',
              platform: { os: 'darwin', arch: 'arm64' },
              sha256: 'abc',
              size: 100,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(zipData, { status: 200 }),
      );

      const sdk = new MpakSDK({ mpakHome: testDir, registryUrl: 'https://test.registry.dev' });

      const first = await sdk.cache.loadBundle('@scope/pkg');
      expect(first.pulled).toBe(true);

      const second = await sdk.cache.loadBundle('@scope/pkg');
      expect(second.pulled).toBe(false);
      expect(second.version).toBe('1.0.0');

      // Only 2 fetch calls total (download info + zip), not 4
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
    });

    it('checkForUpdateAsync works through facade', async () => {
      const logs: string[] = [];
      const sdk = new MpakSDK({
        mpakHome: testDir,
        registryUrl: 'https://test.registry.dev',
        logger: (msg) => logs.push(msg),
      });

      mkdirSync(sdk.cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      sdk.cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ latest_version: '2.0.0', name: '@scope/pkg' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      await sdk.cache.checkForUpdateAsync('@scope/pkg');

      expect(logs.some((l) => l.includes('Update available'))).toBe(true);
      expect(logs.some((l) => l.includes('1.0.0 -> 2.0.0'))).toBe(true);

      const meta = sdk.cache.getCacheMetadata('@scope/pkg');
      expect(meta?.lastCheckedAt).toBeDefined();

      fetchSpy.mockRestore();
    });

    it('loadBundle uses the same registry URL as config', async () => {
      const zipPath = createTestZip(testDir);
      const zipData = readFileSync(zipPath);

      const customUrl = 'https://my-custom.registry.dev';
      const sdk = new MpakSDK({
        mpakHome: testDir,
        registryUrl: customUrl,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            url: 'https://example.com/bundle.zip',
            bundle: {
              name: '@scope/pkg',
              version: '1.0.0',
              platform: { os: 'darwin', arch: 'arm64' },
              sha256: 'abc',
              size: 100,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      fetchSpy.mockResolvedValueOnce(
        new Response(zipData, { status: 200 }),
      );

      await sdk.cache.loadBundle('@scope/pkg');

      const downloadInfoUrl = fetchSpy.mock.calls[0]?.[0] as string;
      expect(downloadInfoUrl).toContain(customUrl);

      fetchSpy.mockRestore();
    });
  });
});
