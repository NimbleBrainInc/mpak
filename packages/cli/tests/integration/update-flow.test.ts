import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mpak } from '../../src/utils/config.js';
import { run } from './helpers.js';

/**
 * Integration test for the outdated → update command flow.
 *
 * Setup uses mpak.bundleCache directly to seed and manipulate the local cache.
 * Assertions run the actual CLI commands as subprocesses.
 *
 * Run with: pnpm test -- tests/integration
 */

const TEST_BUNDLE = '@nimblebraininc/echo';

describe('outdated + update flow', () => {
  let originalMeta: string | null = null;
  let metaPath: string;

  afterEach(() => {
    if (originalMeta && metaPath) {
      writeFileSync(metaPath, originalMeta);
    }
    originalMeta = null;
  });

  it('detects an outdated bundle and updates it to latest', async () => {
    // 1. Seed the cache via SDK (setup, not what we're testing)
    await mpak.bundleCache.loadBundle(TEST_BUNDLE);

    // 2. Save real metadata for restoration
    const meta = mpak.bundleCache.getBundleMetadata(TEST_BUNDLE);
    expect(meta).not.toBeNull();
    if (!meta) return;

    const cacheDir = mpak.bundleCache.getBundleCacheDirName(TEST_BUNDLE);
    metaPath = join(cacheDir, '.mpak-meta.json');
    originalMeta = readFileSync(metaPath, 'utf8');
    const realVersion = meta.version;

    // 3. Downgrade version to simulate a stale cache entry
    writeFileSync(metaPath, JSON.stringify({ ...meta, version: '0.0.1' }));

    // 4. `mpak outdated --json` should detect the entry
    const outdatedRun = await run('outdated --json');
    expect(outdatedRun.exitCode).toBe(0);
    const outdated = JSON.parse(outdatedRun.stdout);
    const entry = outdated.find((e: { name: string }) => e.name === TEST_BUNDLE);
    expect(entry).toBeDefined();
    expect(entry.current).toBe('0.0.1');
    expect(entry.latest).toBe(realVersion);

    // 5. `mpak update @nimblebraininc/echo --json` should bring it current
    const updateRun = await run(`update ${TEST_BUNDLE} --json`);
    expect(updateRun.exitCode).toBe(0);
    const updated = JSON.parse(updateRun.stdout);
    expect(updated.name).toBe(TEST_BUNDLE);
    expect(updated.version).toBe(realVersion);
  }, 60000);
});
