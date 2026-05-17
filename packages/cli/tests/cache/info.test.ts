import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MpakBundleCache, type MpakClient } from '@nimblebrain/mpak-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCacheInfo } from '../../src/commands/cache/info.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validManifest = (name: string, version: string) => ({
  manifest_version: '0.3',
  name,
  version,
  description: 'Test bundle',
  server: {
    type: 'node' as const,
    entry_point: 'index.js',
    mcp_config: { command: 'node', args: ['${__dirname}/index.js'] },
  },
});

const validMetadata = (version: string) => ({
  version,
  pulledAt: '2026-05-10T00:00:00.000Z',
  platform: { os: 'darwin', arch: 'arm64' },
});

function seedRegistryEntry(
  mpakHome: string,
  dirName: string,
  opts: { manifest?: object; metadata?: object },
) {
  const dir = join(mpakHome, 'cache', dirName);
  mkdirSync(dir, { recursive: true });
  if (opts.manifest) writeFileSync(join(dir, 'manifest.json'), JSON.stringify(opts.manifest));
  if (opts.metadata) writeFileSync(join(dir, '.mpak-meta.json'), JSON.stringify(opts.metadata));
  writeFileSync(join(dir, 'index.js'), 'x'.repeat(1024));
}

function seedLocalEntry(mpakHome: string, hash: string, localPath: string) {
  const dir = join(mpakHome, 'cache', '_local', hash);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, '.mpak-local-meta.json'),
    JSON.stringify({ localPath, extractedAt: '2026-05-10T00:00:00.000Z' }),
  );
  writeFileSync(join(dir, 'index.js'), 'x'.repeat(512));
}

function mockClient(): MpakClient {
  return {} as unknown as MpakClient;
}

// ---------------------------------------------------------------------------
// Mock the mpak singleton
// ---------------------------------------------------------------------------

let currentCache: MpakBundleCache;

vi.mock('../../src/utils/config.js', () => ({
  get mpak() {
    return { bundleCache: currentCache };
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleCacheInfo', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-cache-info-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('prints "Cache is empty" when nothing is cached', async () => {
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleCacheInfo();

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Cache is empty'));
  });

  it('lists registry bundles with name, version, and size', async () => {
    seedRegistryEntry(testDir, 'scope-foo', {
      manifest: validManifest('@scope/foo', '1.2.0'),
      metadata: validMetadata('1.2.0'),
    });
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleCacheInfo();

    const output = spy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('@scope/foo');
    expect(output).toContain('1.2.0');
    expect(output).toContain('2026-05-10');
  });

  it('lists local bundles with path and size', async () => {
    seedLocalEntry(testDir, 'abc123', '/project/dist/mcp-foo-v0.1.1.mcpb');
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleCacheInfo();

    const output = spy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('/project/dist/mcp-foo-v0.1.1.mcpb');
    expect(output).toContain('2026-05-10');
  });

  it('prints total size', async () => {
    seedRegistryEntry(testDir, 'scope-foo', {
      manifest: validManifest('@scope/foo', '1.0.0'),
      metadata: validMetadata('1.0.0'),
    });
    seedLocalEntry(testDir, 'abc123', '/project/dist/mcp-foo.mcpb');
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleCacheInfo();

    const output = spy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Total:');
  });

  it('outputs JSON when --json is set', async () => {
    seedRegistryEntry(testDir, 'scope-foo', {
      manifest: validManifest('@scope/foo', '2.0.0'),
      metadata: validMetadata('2.0.0'),
    });
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await handleCacheInfo({ json: true });

    const raw = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(raw.registryBundles[0].name).toBe('@scope/foo');
    expect(raw.registryBundles[0].bytes).toBeGreaterThan(0);
    expect(raw.totalBytes).toBeGreaterThan(0);
  });
});
