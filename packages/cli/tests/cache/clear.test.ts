import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MpakBundleCache, type MpakClient } from '@nimblebrain/mpak-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCacheClear } from '../../src/commands/cache/clear.js';

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

function seedRegistryEntry(mpakHome: string, dirName: string) {
  const dir = join(mpakHome, 'cache', dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(validManifest('@scope/foo', '1.0.0')));
  writeFileSync(join(dir, '.mpak-meta.json'), JSON.stringify(validMetadata('1.0.0')));
  writeFileSync(join(dir, 'index.js'), 'x'.repeat(1024));
  return dir;
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

describe('handleCacheClear', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-cache-clear-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('reports already empty when nothing is cached', async () => {
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleCacheClear({}, vi.fn());

    expect(spy).toHaveBeenCalledWith(expect.stringContaining('already empty'));
  });

  it('prompts for confirmation when --force is not set', async () => {
    seedRegistryEntry(testDir, 'scope-foo');
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const confirm = vi.fn().mockResolvedValue(true);
    await handleCacheClear({}, confirm);

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Clear the entire cache'));
  });

  it('aborts without deleting when user declines', async () => {
    const cacheDir = seedRegistryEntry(testDir, 'scope-foo');
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleCacheClear({}, vi.fn().mockResolvedValue(false));

    expect(existsSync(cacheDir)).toBe(true);
  });

  it('deletes the cache directory when confirmed', async () => {
    seedRegistryEntry(testDir, 'scope-foo');
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleCacheClear({}, vi.fn().mockResolvedValue(true));

    expect(existsSync(join(testDir, 'cache'))).toBe(false);
  });

  it('skips confirmation prompt when --force is set', async () => {
    seedRegistryEntry(testDir, 'scope-foo');
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const confirm = vi.fn();
    await handleCacheClear({ force: true }, confirm);

    expect(confirm).not.toHaveBeenCalled();
    expect(existsSync(join(testDir, 'cache'))).toBe(false);
  });

  it('reports freed size after clearing', async () => {
    seedRegistryEntry(testDir, 'scope-foo');
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleCacheClear({ force: true }, vi.fn());

    const output = spy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Freed');
  });

  it('includes entry count and size in the confirmation prompt', async () => {
    seedRegistryEntry(testDir, 'scope-foo');
    currentCache = new MpakBundleCache(mockClient(), { mpakHome: testDir });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const confirm = vi.fn().mockResolvedValue(false);
    await handleCacheClear({}, confirm);

    const prompt = confirm.mock.calls[0]![0] as string;
    expect(prompt).toContain('1 bundle(s)');
    expect(prompt).toMatch(/\d+(\.\d+)? (B|KB|MB)/);
  });
});
