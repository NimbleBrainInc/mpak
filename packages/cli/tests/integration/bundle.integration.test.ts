import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from './helpers.js';

/**
 * Integration smoke tests for bundle pull against the live registry.
 *
 * Run with: pnpm test -- tests/integration
 */

const TEST_BUNDLE = '@nimblebraininc/echo';

describe('bundle pull', () => {
  let outputPath: string;

  afterEach(() => {
    if (outputPath && existsSync(outputPath)) {
      rmSync(outputPath);
    }
  });

  it('downloads a .mcpb file to the specified output path', async () => {
    outputPath = join(tmpdir(), `mpak-test-${Date.now()}.mcpb`);

    const { stderr, exitCode } = await run(
      `bundle pull ${TEST_BUNDLE} --os linux --arch x64 --output ${outputPath}`,
    );

    expect(exitCode).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
    expect(stderr).toContain('Bundle downloaded successfully');
    expect(stderr).not.toContain('[Error]');
  }, 30000);

  it('populates the bundle cache after pull', async () => {
    outputPath = join(tmpdir(), `mpak-test-cache-${Date.now()}.mcpb`);
    const cacheMetaPath = join(homedir(), '.mpak', 'cache', 'nimblebraininc-echo', '.mpak-meta.json');

    // Remove any existing cache entry so we get a clean result
    const cacheDir = join(homedir(), '.mpak', 'cache', 'nimblebraininc-echo');
    if (existsSync(cacheDir)) rmSync(cacheDir, { recursive: true, force: true });

    const { exitCode } = await run(
      `bundle pull ${TEST_BUNDLE} --os linux --arch x64 --output ${outputPath}`,
    );

    expect(exitCode).toBe(0);
    expect(existsSync(cacheMetaPath)).toBe(true);
    const meta = JSON.parse(readFileSync(cacheMetaPath, 'utf8'));
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(meta.platform.os).toBe('linux');
    expect(meta.platform.arch).toBe('x64');
  }, 30000);

  it('outputs valid JSON metadata with --json flag', async () => {
    outputPath = join(tmpdir(), `mpak-test-json-${Date.now()}.mcpb`);

    const { stdout, exitCode } = await run(
      `bundle pull ${TEST_BUNDLE} --os linux --arch x64 --output ${outputPath} --json`,
    );

    expect(exitCode).toBe(0);
    const meta = JSON.parse(stdout);
    expect(meta.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(meta.platform.os).toBe('linux');
    expect(meta.platform.arch).toBe('x64');
    expect(meta.sha256).toBeTruthy();
  }, 30000);
});
