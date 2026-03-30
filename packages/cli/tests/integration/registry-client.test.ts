import { describe, expect, it } from 'vitest';
import { run } from './helpers.js';

/**
 * Integration tests for bundle search and show commands against the live registry.
 *
 * Run with: pnpm test -- tests/integration
 */

const TEST_BUNDLE = '@nimblebraininc/echo';

describe('bundle search', () => {
  it("finds echo bundle when searching for 'echo'", async () => {
    const { stdout, exitCode } = await run('bundle search echo --json');

    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.bundles.some((b: { name: string }) => b.name === TEST_BUNDLE)).toBe(true);
  }, 15000);

  it('returns empty results gracefully for a nonsense query', async () => {
    const { stderr, exitCode } = await run('bundle search xyznonexistent12345');

    expect(exitCode).toBe(0);
    expect(stderr).toContain('No bundles found');
  }, 15000);

  it('table output contains bundle name and version', async () => {
    const { stderr, exitCode } = await run('bundle search echo');

    expect(exitCode).toBe(0);
    expect(stderr).toContain(TEST_BUNDLE);
    expect(stderr).toMatch(/v\d+\.\d+\.\d+/);
  }, 15000);
});

describe('bundle show', () => {
  it('outputs valid JSON with expected fields', async () => {
    const { stdout, exitCode } = await run(`bundle show ${TEST_BUNDLE} --json`);

    expect(exitCode).toBe(0);
    const bundle = JSON.parse(stdout);
    expect(bundle.name).toBe(TEST_BUNDLE);
    expect(bundle.server_type).toBe('python');
    expect(Array.isArray(bundle.versions_detail)).toBe(true);
    expect(bundle.versions_detail.length).toBeGreaterThan(0);
  }, 15000);

  it('outputs human-readable details to stderr', async () => {
    const { stderr, exitCode } = await run(`bundle show ${TEST_BUNDLE}`);

    expect(exitCode).toBe(0);
    expect(stderr).toContain(TEST_BUNDLE);
    expect(stderr).toContain('Bundle Information:');
    expect(stderr).toContain('Statistics:');
  }, 15000);

  it('exits cleanly and logs an error for a nonexistent bundle', async () => {
    const { stderr } = await run('bundle show @nonexistent/bundle-xyz-abc');

    // handler catches and logs via logger.error, does not throw
    expect(stderr).toContain('[Error]');
  }, 15000);
});
