/**
 * Integration smoke tests for Mpak facade
 *
 * Exercises the full facade flow against the live registry using @nimblebraininc/echo.
 * Run with:
 *   pnpm test:integration
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Mpak } from '../src/mpakSDK.js';

const KNOWN_BUNDLE = '@nimblebraininc/echo';
const registryUrl = process.env.MPAK_REGISTRY_URL ?? 'https://registry.mpak.dev';

describe('Mpak facade integration', () => {
  let testDir: string;
  let sdk: Mpak;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-facade-integration-'));
    sdk = new Mpak({
      mpakHome: testDir,
      registryUrl,
    });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('constructs with configManager, client, and bundleCache wired together', () => {
    expect(sdk.configManager.mpakHome).toBe(testDir);
    expect(sdk.configManager.getRegistryUrl()).toBe(registryUrl);
    expect(sdk.bundleCache.getBundleCacheDirName(KNOWN_BUNDLE)).toBe(
      join(testDir, 'cache', 'nimblebraininc-echo'),
    );
  });

  it('loadBundle downloads echo from live registry', async () => {
    const result = await sdk.bundleCache.loadBundle(KNOWN_BUNDLE);

    expect(result.pulled).toBe(true);
    expect(result.version).toBeDefined();
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(existsSync(result.cacheDir)).toBe(true);
    expect(existsSync(join(result.cacheDir, 'manifest.json'))).toBe(true);

    // Verify manifest content
    const manifest = JSON.parse(readFileSync(join(result.cacheDir, 'manifest.json'), 'utf8'));
    expect(manifest.name).toBe(KNOWN_BUNDLE);
  });

  it('cache metadata is written after download', () => {
    const meta = sdk.bundleCache.getBundleMetadata(KNOWN_BUNDLE);

    expect(meta).not.toBeNull();
    expect(meta!.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(meta!.pulledAt).toBeDefined();
    expect(meta!.platform).toBeDefined();
    expect(meta!.platform.os).toBeDefined();
    expect(meta!.platform.arch).toBeDefined();
  });

  it('listCachedBundles includes the downloaded bundle', () => {
    const bundles = sdk.bundleCache.listCachedBundles();

    expect(bundles.length).toBeGreaterThanOrEqual(1);
    const echo = bundles.find((b) => b.name === KNOWN_BUNDLE);
    expect(echo).toBeDefined();
    expect(echo!.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(echo!.pulledAt).toBeDefined();
    expect(echo!.cacheDir).toContain('nimblebraininc-echo');
  });

  it('loadBundle returns from cache on second call (no re-download)', async () => {
    const result = await sdk.bundleCache.loadBundle(KNOWN_BUNDLE);

    expect(result.pulled).toBe(false);
    expect(result.version).toBeDefined();
  });

  it('loadBundle with force re-downloads even when cached', async () => {
    const result = await sdk.bundleCache.loadBundle(KNOWN_BUNDLE, { force: true });

    expect(result.pulled).toBe(true);
    expect(result.version).toBeDefined();
  });

  it('config stores and retrieves package config alongside cache', () => {
    sdk.configManager.setPackageConfigValue(KNOWN_BUNDLE, 'api_key', 'sk-integration-test');

    expect(sdk.configManager.getPackageConfig(KNOWN_BUNDLE)?.['api_key']).toBe(
      'sk-integration-test',
    );

    // Config file and cache coexist under the same mpakHome
    expect(existsSync(join(testDir, 'config.json'))).toBe(true);
    expect(existsSync(join(testDir, 'cache', 'nimblebraininc-echo'))).toBe(true);

    // Clean up
    sdk.configManager.clearPackageConfig(KNOWN_BUNDLE);
    expect(sdk.configManager.getPackageConfig(KNOWN_BUNDLE)).toBeUndefined();
  });

  it('getBundleManifest returns parsed manifest for cached bundle', () => {
    const manifest = sdk.bundleCache.getBundleManifest(KNOWN_BUNDLE);

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

  it('getBundleManifest returns null for uncached bundle', () => {
    expect(sdk.bundleCache.getBundleManifest('@nonexistent/bundle')).toBeNull();
  });

  it('prepareServer resolves a runnable server command', async () => {
    const result = await sdk.prepareServer({ name: KNOWN_BUNDLE });

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
    const result = await sdk.prepareServer({ name: KNOWN_BUNDLE }, {
      workspaceDir: '/tmp/custom-workspace',
    });

    expect(result.env['MPAK_WORKSPACE']).toBe('/tmp/custom-workspace');
  });

  it('prepareServer with explicit version', async () => {
    // Get the current cached version to use as a known-good version
    const meta = sdk.bundleCache.getBundleMetadata(KNOWN_BUNDLE);
    const version = meta!.version;

    const result = await sdk.prepareServer({ name: KNOWN_BUNDLE, version });

    expect(result.name).toBe(KNOWN_BUNDLE);
    expect(result.version).toBe(version);
  });

  it('a fresh facade instance picks up existing cache and config', () => {
    // Write config via first SDK
    sdk.configManager.setPackageConfigValue(KNOWN_BUNDLE, 'test_key', 'test_value');

    // Create a new Mpak pointing at the same home
    const sdk2 = new Mpak({ mpakHome: testDir, registryUrl });

    // Should see the config
    expect(sdk2.configManager.getPackageConfig(KNOWN_BUNDLE)?.['test_key']).toBe('test_value');

    // Should see the cached bundle
    const meta = sdk2.bundleCache.getBundleMetadata(KNOWN_BUNDLE);
    expect(meta).not.toBeNull();
    expect(meta!.version).toBeDefined();

    const bundles = sdk2.bundleCache.listCachedBundles();
    expect(bundles.find((b) => b.name === KNOWN_BUNDLE)).toBeDefined();

    // Clean up
    sdk.configManager.clearPackageConfig(KNOWN_BUNDLE);
  });
});
