import { execSync, type ExecSyncOptionsWithStringEncoding } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const CLI = join(__dirname, '..', 'dist', 'index.js');

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function run(args: string, env: Record<string, string> = {}): RunResult {
  const opts: ExecSyncOptionsWithStringEncoding = {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  };
  try {
    const stdout = execSync(`node ${CLI} ${args}`, opts).trim();
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout: string; stderr: string; status: number };
    return {
      stdout: (e.stdout ?? '').trim(),
      stderr: (e.stderr ?? '').trim(),
      exitCode: e.status ?? 1,
    };
  }
}

function readConfig(mpakHome: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(mpakHome, 'config.json'), 'utf8'));
}

function getPackages(mpakHome: string): Record<string, Record<string, string>> {
  const config = readConfig(mpakHome);
  return (config.packages ?? {}) as Record<string, Record<string, string>>;
}

describe('config set', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mpak-config-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Happy path ---

  it('should set a single key=value pair', () => {
    const result = run('config set @scope/name api_key=test-value', {
      MPAK_HOME: tmpDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Set 1 config value(s) for @scope/name');
    expect(getPackages(tmpDir)['@scope/name']).toEqual({
      api_key: 'test-value',
    });
  });

  it('should set multiple key=value pairs in one call', () => {
    const result = run('config set @scope/name key1=value1 key2=value2', {
      MPAK_HOME: tmpDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('Set 2 config value(s) for @scope/name');
    expect(getPackages(tmpDir)['@scope/name']).toEqual({
      key1: 'value1',
      key2: 'value2',
    });
  });

  it('should overwrite an existing value', () => {
    run('config set @scope/name api_key=old-value', { MPAK_HOME: tmpDir });
    const result = run('config set @scope/name api_key=new-value', {
      MPAK_HOME: tmpDir,
    });
    expect(result.exitCode).toBe(0);
    expect(getPackages(tmpDir)['@scope/name']['api_key']).toBe('new-value');
  });

  it('should handle value containing equals sign', () => {
    const result = run('config set @scope/name token=abc=def=ghi', {
      MPAK_HOME: tmpDir,
    });
    expect(result.exitCode).toBe(0);
    expect(getPackages(tmpDir)['@scope/name']['token']).toBe('abc=def=ghi');
  });

  it('should handle empty value', () => {
    const result = run('config set @scope/name api_key=', {
      MPAK_HOME: tmpDir,
    });
    expect(result.exitCode).toBe(0);
    expect(getPackages(tmpDir)['@scope/name']['api_key']).toBe('');
  });

  it('should set config for multiple packages independently', () => {
    run('config set @scope/pkg1 key=value1', { MPAK_HOME: tmpDir });
    run('config set @scope/pkg2 key=value2', { MPAK_HOME: tmpDir });

    const packages = getPackages(tmpDir);
    expect(packages['@scope/pkg1']['key']).toBe('value1');
    expect(packages['@scope/pkg2']['key']).toBe('value2');
  });

  // --- Error cases ---

  it('should reject missing key=value pair (no args)', () => {
    const result = run('config set @scope/name', { MPAK_HOME: tmpDir });
    expect(result.exitCode).not.toBe(0);
  });

  it('should reject invalid format (no equals sign)', () => {
    const result = run('config set @scope/name badformat', {
      MPAK_HOME: tmpDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Invalid format');
  });

  it('should reject empty key', () => {
    const result = run('config set @scope/name =value', {
      MPAK_HOME: tmpDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Empty key');
  });

  it('should not create config file on validation error', () => {
    run('config set @scope/name badformat', { MPAK_HOME: tmpDir });
    expect(existsSync(join(tmpDir, 'config.json'))).toBe(false);
  });
});

describe('config get', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mpak-config-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Happy path ---

  it('should display config values in plain text', () => {
    run('config set @scope/name api_key=secret123', { MPAK_HOME: tmpDir });
    const result = run('config get @scope/name', { MPAK_HOME: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Config for @scope/name:');
    expect(result.stdout).toContain('api_key:');
    // Value should be masked (first 4 chars visible)
    expect(result.stdout).toContain('secr');
    expect(result.stdout).not.toContain('secret123');
  });

  it('should display config values as JSON with --json', () => {
    run('config set @scope/name api_key=secret123', { MPAK_HOME: tmpDir });
    const result = run('config get @scope/name --json', { MPAK_HOME: tmpDir });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('api_key');
    // Masked — should not contain the raw value
    expect(parsed.api_key).not.toBe('secret123');
    expect(parsed.api_key).toMatch(/^secr/);
  });

  // --- Empty / missing ---

  it("should show 'no config' message for unknown package", () => {
    const result = run('config get @scope/unknown', { MPAK_HOME: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No config stored for @scope/unknown');
  });

  it('should return empty JSON for unknown package with --json', () => {
    const result = run('config get @scope/unknown --json', { MPAK_HOME: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
  });
});

describe('config list', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mpak-config-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Happy path ---

  it('should list packages with stored config', () => {
    run('config set @scope/pkg1 key=value1', { MPAK_HOME: tmpDir });
    run('config set @scope/pkg2 key1=a key2=b', { MPAK_HOME: tmpDir });

    const result = run('config list', { MPAK_HOME: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('@scope/pkg1');
    expect(result.stdout).toContain('1 value');
    expect(result.stdout).toContain('@scope/pkg2');
    expect(result.stdout).toContain('2 values');
  });

  it('should list packages as JSON with --json', () => {
    run('config set @scope/pkg1 key=value1', { MPAK_HOME: tmpDir });
    run('config set @scope/pkg2 key=value2', { MPAK_HOME: tmpDir });

    const result = run('config list --json', { MPAK_HOME: tmpDir });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout) as string[];
    expect(parsed).toContain('@scope/pkg1');
    expect(parsed).toContain('@scope/pkg2');
    expect(parsed).toHaveLength(2);
  });

  // --- Empty ---

  it("should show 'no packages' message when empty", () => {
    const result = run('config list', { MPAK_HOME: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No packages have stored config');
  });

  it('should return empty JSON array when empty with --json', () => {
    const result = run('config list --json', { MPAK_HOME: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });
});

describe('config clear', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mpak-config-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Clear specific key ---

  it('should clear a specific key', () => {
    run('config set @scope/name key1=value1 key2=value2', { MPAK_HOME: tmpDir });
    const result = run('config clear @scope/name key1', { MPAK_HOME: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Cleared key1 for @scope/name');

    const packages = getPackages(tmpDir);
    expect(packages['@scope/name']).toEqual({ key2: 'value2' });
  });

  it('should report when clearing a non-existent key', () => {
    run('config set @scope/name key1=value1', { MPAK_HOME: tmpDir });
    const result = run('config clear @scope/name nokey', { MPAK_HOME: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No value found for nokey');
  });

  // --- Clear all config for a package ---

  it('should clear all config for a package', () => {
    run('config set @scope/name key1=value1 key2=value2', { MPAK_HOME: tmpDir });
    const result = run('config clear @scope/name', { MPAK_HOME: tmpDir });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Cleared all config for @scope/name');

    const packages = getPackages(tmpDir);
    expect(packages['@scope/name']).toBeUndefined();
  });

  it('should report when clearing a non-existent package', () => {
    const result = run('config clear @scope/unknown', { MPAK_HOME: tmpDir });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No config found for @scope/unknown');
  });

  // --- Clear then verify list ---

  it('should remove package from list after clearing all config', () => {
    run('config set @scope/pkg1 key=value1', { MPAK_HOME: tmpDir });
    run('config set @scope/pkg2 key=value2', { MPAK_HOME: tmpDir });
    run('config clear @scope/pkg1', { MPAK_HOME: tmpDir });

    const result = run('config list --json', { MPAK_HOME: tmpDir });
    const parsed = JSON.parse(result.stdout) as string[];
    expect(parsed).not.toContain('@scope/pkg1');
    expect(parsed).toContain('@scope/pkg2');
  });
});
