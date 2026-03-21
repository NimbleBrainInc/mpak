import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MpakSDK } from '../src/MpakSDK.js';
import { BundleCache } from '../src/cache.js';
import { MpakClient } from '../src/client.js';
import { ConfigManager } from '../src/config-manager.js';

describe('MpakSDK facade', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-facade-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Construction & component wiring
  // ===========================================================================

  describe('construction', () => {
    it('creates all components with defaults', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      expect(sdk.config).toBeInstanceOf(ConfigManager);
      expect(sdk.client).toBeInstanceOf(MpakClient);
      expect(sdk.cache).toBeInstanceOf(BundleCache);
    });

    it('components are readonly', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      const config = sdk.config;
      const client = sdk.client;
      const cache = sdk.cache;

      expect(sdk.config).toBe(config);
      expect(sdk.client).toBe(client);
      expect(sdk.cache).toBe(cache);
    });

    it('works with no options at all', () => {
      const noOptsSdk = new MpakSDK();

      expect(noOptsSdk.config).toBeInstanceOf(ConfigManager);
      expect(noOptsSdk.client).toBeInstanceOf(MpakClient);
      expect(noOptsSdk.cache).toBeInstanceOf(BundleCache);
    });

    it('creates the mpakHome directory', () => {
      const nestedDir = join(testDir, 'nested', 'deep', '.mpak');
      const sdk = new MpakSDK({ mpakHome: nestedDir });

      expect(existsSync(nestedDir)).toBe(true);
      expect(sdk.config.mpakHome).toBe(nestedDir);
    });
  });

  // ===========================================================================
  // Option propagation
  // ===========================================================================

  describe('option propagation', () => {
    it('shares mpakHome between config and cache', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      expect(sdk.config.mpakHome).toBe(testDir);
      expect(sdk.cache.getPackageCachePath('@scope/pkg')).toBe(
        join(testDir, 'cache', 'scope-pkg'),
      );
    });

    it('propagates registryUrl to config and client', () => {
      const sdk = new MpakSDK({
        mpakHome: testDir,
        registryUrl: 'https://custom.registry.dev',
      });

      expect(sdk.config.getRegistryUrl()).toBe('https://custom.registry.dev');
    });

    it('uses config registryUrl as source of truth for client', () => {
      new MpakSDK({
        mpakHome: testDir,
        registryUrl: 'https://custom.registry.dev',
      });

      const sdk2 = new MpakSDK({ mpakHome: testDir });
      expect(sdk2.config.getRegistryUrl()).toBe('https://custom.registry.dev');
    });

    it('uses default registry URL when not specified', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      expect(sdk.config.getRegistryUrl()).toBe('https://registry.mpak.dev');
    });

    it('passes logger to cache', () => {
      const logs: string[] = [];
      const logger = (msg: string) => { logs.push(msg); };
      const sdk = new MpakSDK({ mpakHome: testDir, logger });

      const bundleDir = join(testDir, 'cache', 'scope-pkg');
      mkdirSync(bundleDir, { recursive: true });
      writeFileSync(
        join(bundleDir, '.mpak-meta.json'),
        JSON.stringify({
          version: '1.0.0',
          pulledAt: '2026-03-21T00:00:00.000Z',
          platform: { os: 'darwin', arch: 'arm64' },
        }),
      );

      sdk.cache.listCachedBundles();

      expect(logs.some((l) => l.includes('missing manifest.json'))).toBe(true);
    });

    it('passes timeout and userAgent to client', async () => {
      const sdk = new MpakSDK({
        mpakHome: testDir,
        timeout: 5000,
        userAgent: 'test-agent/1.0',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ bundles: [], pagination: { total: 0, limit: 20, offset: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await sdk.client.searchBundles({ q: 'test' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callArgs = fetchSpy.mock.calls[0];
      const init = callArgs?.[1] as RequestInit;
      expect((init.headers as Record<string, string>)['User-Agent']).toBe('test-agent/1.0');

      fetchSpy.mockRestore();
    });
  });

  // ===========================================================================
  // Cross-component integration
  // ===========================================================================

  describe('cross-component integration', () => {
    it('config and cache share the same mpakHome directory', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      sdk.config.setPackageConfigValue('@scope/pkg', 'key', 'value');
      expect(existsSync(join(testDir, 'config.json'))).toBe(true);

      mkdirSync(sdk.cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      sdk.cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });
      expect(existsSync(join(testDir, 'cache', 'scope-pkg', '.mpak-meta.json'))).toBe(true);
    });

    it('two SDK instances with different homes are independent', () => {
      const homeA = join(testDir, 'home-a');
      const homeB = join(testDir, 'home-b');

      const sdkA = new MpakSDK({ mpakHome: homeA });
      const sdkB = new MpakSDK({ mpakHome: homeB });

      sdkA.config.setPackageConfigValue('@scope/pkg', 'key', 'a-value');
      sdkB.config.setPackageConfigValue('@scope/pkg', 'key', 'b-value');

      expect(sdkA.config.getPackageConfigValue('@scope/pkg', 'key')).toBe('a-value');
      expect(sdkB.config.getPackageConfigValue('@scope/pkg', 'key')).toBe('b-value');
    });

    it('registryUrl override flows through to client requests', async () => {
      const customUrl = 'https://my-registry.example.com';
      const sdk = new MpakSDK({
        mpakHome: testDir,
        registryUrl: customUrl,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ bundles: [], pagination: { total: 0, limit: 20, offset: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await sdk.client.searchBundles({ q: 'test' });

      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain(customUrl);

      fetchSpy.mockRestore();
    });
  });

  // ===========================================================================
  // MpakClient standalone usage (only component usable standalone)
  // ===========================================================================

  describe('MpakClient standalone', () => {
    it('MpakClient works without the facade', async () => {
      const client = new MpakClient({
        registryUrl: 'https://standalone.registry.dev',
        timeout: 5000,
        userAgent: 'standalone/1.0',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ bundles: [], pagination: { total: 0, limit: 20, offset: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await client.searchBundles({ q: 'test' });

      expect(result.bundles).toEqual([]);
      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('https://standalone.registry.dev');

      fetchSpy.mockRestore();
    });

    it('MpakClient can be shared across cache instances', () => {
      const client = new MpakClient({ registryUrl: 'https://shared.registry.dev' });

      const cache1 = new BundleCache({ mpakHome: join(testDir, 'cache1'), client });
      const cache2 = new BundleCache({ mpakHome: join(testDir, 'cache2'), client });

      expect(cache1.getPackageCachePath('@scope/pkg')).toContain('cache1');
      expect(cache2.getPackageCachePath('@scope/pkg')).toContain('cache2');
    });
  });
});
