import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MpakSDK } from '../src/MpakSDK.js';
import { ConfigManager } from '../src/config-manager.js';
import { MpakClient } from '../src/client.js';
import { BundleCache } from '../src/cache.js';

describe('MpakSDK facade', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-facade-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('creates all components with defaults', () => {
    const sdk = new MpakSDK({ mpakHome: testDir });

    expect(sdk.config).toBeInstanceOf(ConfigManager);
    expect(sdk.client).toBeInstanceOf(MpakClient);
    expect(sdk.cache).toBeInstanceOf(BundleCache);
  });

  it('shares mpakHome between config and cache', () => {
    const sdk = new MpakSDK({ mpakHome: testDir });

    expect(sdk.config.mpakHome).toBe(testDir);
    expect(sdk.cache.getPackageCachePath('@scope/pkg')).toBe(join(testDir, 'cache', 'scope-pkg'));
  });

  it('uses registry URL from config by default', () => {
    const sdk = new MpakSDK({ mpakHome: testDir });

    expect(sdk.config.getRegistryUrl()).toBe('https://registry.mpak.dev');
  });

  it('persists registryUrl to config and uses it as source of truth', () => {
    const sdk = new MpakSDK({
      mpakHome: testDir,
      registryUrl: 'https://custom.registry.dev',
    });

    // registryUrl was persisted to config
    expect(sdk.config.getRegistryUrl()).toBe('https://custom.registry.dev');

    // A new SDK instance pointing to the same dir picks it up from config
    const sdk2 = new MpakSDK({ mpakHome: testDir });
    expect(sdk2.config.getRegistryUrl()).toBe('https://custom.registry.dev');
  });

  it('passes logger to cache', () => {
    const logger = () => {};
    const sdk = new MpakSDK({ mpakHome: testDir, logger });

    expect(sdk.cache).toBeInstanceOf(BundleCache);
  });

  it('cache can perform local-only operations', () => {
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

  it('config persists and reloads through facade', () => {
    const sdk = new MpakSDK({ mpakHome: testDir });
    sdk.config.setPackageConfigValue('@scope/pkg', 'api_key', 'sk-test');

    const sdk2 = new MpakSDK({ mpakHome: testDir });
    expect(sdk2.config.getPackageConfigValue('@scope/pkg', 'api_key')).toBe('sk-test');
  });
});
