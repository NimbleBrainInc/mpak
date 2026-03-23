/**
 * Integration smoke tests for MpakSDK facade
 *
 * Exercises the full facade flow against the live registry using @nimblebraininc/echo.
 * Run with:
 *   pnpm test:integration
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MpakSDK } from '../src/MpakSDK.js';

const KNOWN_BUNDLE = '@nimblebraininc/echo';
const registryUrl = process.env.MPAK_REGISTRY_URL ?? 'https://registry.mpak.dev';

describe('MpakSDK facade integration', () => {
  let testDir: string;
  let sdk: MpakSDK;
  const logs: string[] = [];

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-facade-integration-'));
    sdk = new MpakSDK({
      mpakHome: testDir,
      registryUrl,
      logger: (msg) => logs.push(msg),
    });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('constructs with config, client, and cache wired together', () => {
    expect(sdk.config.mpakHome).toBe(testDir);
    expect(sdk.config.getRegistryUrl()).toBe(registryUrl);
    expect(sdk.cache.getPackageCachePath(KNOWN_BUNDLE)).toBe(
      join(testDir, 'cache', 'nimblebraininc-echo'),
    );
  });

  it('loadBundle downloads echo from live registry', async () => {
    const result = await sdk.cache.loadBundle(KNOWN_BUNDLE);

    expect(result.pulled).toBe(true);
    expect(result.version).toBeDefined();
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(existsSync(result.cacheDir)).toBe(true);
    expect(existsSync(join(result.cacheDir, 'manifest.json'))).toBe(true);

    // Verify manifest content
    const manifest = JSON.parse(readFileSync(join(result.cacheDir, 'manifest.json'), 'utf8'));
    expect(manifest.name).toBe(KNOWN_BUNDLE);

    // Logger should have captured progress
    expect(logs.some((l) => l.includes(`Pulling ${KNOWN_BUNDLE}`))).toBe(true);
    expect(logs.some((l) => l.includes(`Cached ${KNOWN_BUNDLE}`))).toBe(true);
  });

  it('cache metadata is written after download', () => {
    const meta = sdk.cache.getCacheMetadata(KNOWN_BUNDLE);

    expect(meta).not.toBeNull();
    expect(meta!.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(meta!.pulledAt).toBeDefined();
    expect(meta!.platform).toBeDefined();
    expect(meta!.platform.os).toBeDefined();
    expect(meta!.platform.arch).toBeDefined();
    // Fresh download should NOT stamp lastCheckedAt — that's for update checks
    expect(meta!.lastCheckedAt).toBeUndefined();
  });

  it('listCachedBundles includes the downloaded bundle', () => {
    const bundles = sdk.cache.listCachedBundles();

    expect(bundles.length).toBeGreaterThanOrEqual(1);
    const echo = bundles.find((b) => b.name === KNOWN_BUNDLE);
    expect(echo).toBeDefined();
    expect(echo!.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(echo!.pulledAt).toBeDefined();
    expect(echo!.cacheDir).toContain('nimblebraininc-echo');
  });

  it('loadBundle returns from cache on second call (no re-download)', async () => {
    logs.length = 0;

    const result = await sdk.cache.loadBundle(KNOWN_BUNDLE);

    expect(result.pulled).toBe(false);
    expect(result.version).toBeDefined();
    // Should NOT have logged any pulling messages
    expect(logs.some((l) => l.includes('Pulling'))).toBe(false);
  });

  it('loadBundle with force re-downloads even when cached', async () => {
    logs.length = 0;

    const result = await sdk.cache.loadBundle(KNOWN_BUNDLE, { force: true });

    expect(result.pulled).toBe(true);
    expect(result.version).toBeDefined();
    expect(logs.some((l) => l.includes(`Pulling ${KNOWN_BUNDLE}`))).toBe(true);
  });

  it('checkForUpdateAsync runs without error', async () => {
    logs.length = 0;

    await sdk.cache.checkForUpdateAsync(KNOWN_BUNDLE);

    // Should log either "up to date" or "Update available"
    const hasStatusLog = logs.some(
      (l) => l.includes('is up to date') || l.includes('Update available'),
    );
    expect(hasStatusLog).toBe(true);

    // lastCheckedAt should be refreshed
    const meta = sdk.cache.getCacheMetadata(KNOWN_BUNDLE);
    expect(meta!.lastCheckedAt).toBeDefined();
  });

  it('checkForUpdateAsync skips when within TTL', async () => {
    logs.length = 0;

    await sdk.cache.checkForUpdateAsync(KNOWN_BUNDLE);

    expect(logs.some((l) => l.includes('Skipping update check'))).toBe(true);
    expect(logs.some((l) => l.includes('next check in'))).toBe(true);
  });

  it('config stores and retrieves package config alongside cache', () => {
    sdk.config.setPackageConfigValue(KNOWN_BUNDLE, 'api_key', 'sk-integration-test');

    expect(sdk.config.getPackageConfigValue(KNOWN_BUNDLE, 'api_key')).toBe('sk-integration-test');

    // Config file and cache coexist under the same mpakHome
    expect(existsSync(join(testDir, 'config.json'))).toBe(true);
    expect(existsSync(join(testDir, 'cache', 'nimblebraininc-echo'))).toBe(true);

    // Clean up
    sdk.config.clearPackageConfig(KNOWN_BUNDLE);
    expect(sdk.config.getPackageConfig(KNOWN_BUNDLE)).toBeUndefined();
  });

  it('readManifest returns parsed manifest for cached bundle', () => {
    const manifest = sdk.cache.readManifest(KNOWN_BUNDLE);

    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe(KNOWN_BUNDLE);
    expect(manifest!.manifest_version).toBeDefined();
    expect(manifest!.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest!.description).toBeDefined();
    expect(manifest!.server).toBeDefined();
    expect(manifest!.server.type).toMatch(/^(node|python|binary)$/);
    expect(manifest!.server.entry_point).toBeDefined();
    expect(manifest!.server.mcp_config).toBeDefined();
    expect(manifest!.server.mcp_config.command).toBeDefined();
    expect(Array.isArray(manifest!.server.mcp_config.args)).toBe(true);
  });

  it('readManifest returns null for uncached bundle', () => {
    expect(sdk.cache.readManifest('@nonexistent/bundle')).toBeNull();
  });

  it('prepareServer resolves a runnable server command', async () => {
    const result = await sdk.prepareServer(KNOWN_BUNDLE);

    expect(result.name).toBe(KNOWN_BUNDLE);
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.command).toBeDefined();
    expect(typeof result.command).toBe('string');
    expect(Array.isArray(result.args)).toBe(true);
    expect(result.args.length).toBeGreaterThan(0);
    expect(typeof result.env).toBe('object');
    expect(result.env['MPAK_WORKSPACE']).toBeDefined();
    expect(result.cwd).toContain('nimblebraininc-echo');

    // The command should be resolvable (node, python3, or an absolute path)
    expect(result.command).toMatch(/^(node|python3?|\/)/);
  });

  it('prepareServer respects workspaceDir option', async () => {
    const result = await sdk.prepareServer(KNOWN_BUNDLE, {
      workspaceDir: '/tmp/custom-workspace',
    });

    expect(result.env['MPAK_WORKSPACE']).toBe('/tmp/custom-workspace');
  });

  it('prepareServer with inline version', async () => {
    // Get the current cached version to use as a known-good version
    const meta = sdk.cache.getCacheMetadata(KNOWN_BUNDLE);
    const version = meta!.version;

    const result = await sdk.prepareServer(`${KNOWN_BUNDLE}@${version}`);

    expect(result.name).toBe(KNOWN_BUNDLE);
    expect(result.version).toBe(version);
  });

  it('a fresh facade instance picks up existing cache and config', () => {
    // Write config via first SDK
    sdk.config.setPackageConfigValue(KNOWN_BUNDLE, 'test_key', 'test_value');

    // Create a new SDK pointing at the same home
    const sdk2 = new MpakSDK({ mpakHome: testDir, registryUrl });

    // Should see the config
    expect(sdk2.config.getPackageConfigValue(KNOWN_BUNDLE, 'test_key')).toBe('test_value');

    // Should see the cached bundle
    const meta = sdk2.cache.getCacheMetadata(KNOWN_BUNDLE);
    expect(meta).not.toBeNull();
    expect(meta!.version).toBeDefined();

    const bundles = sdk2.cache.listCachedBundles();
    expect(bundles.find((b) => b.name === KNOWN_BUNDLE)).toBeDefined();

    // Clean up
    sdk.config.clearPackageConfig(KNOWN_BUNDLE);
  });
});
