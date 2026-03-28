import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MAX_UNCOMPRESSED_SIZE,
  UPDATE_CHECK_TTL_MS,
  extractZip,
  hashBundlePath,
  isSemverEqual,
  localBundleNeedsExtract,
  readJsonFromFile,
} from '../src/helpers.js';

describe('isSemverEqual', () => {
  it('treats identical versions as equal', () => {
    expect(isSemverEqual('1.0.0', '1.0.0')).toBe(true);
  });

  it('ignores leading v prefix on both sides', () => {
    expect(isSemverEqual('v1.0.0', '1.0.0')).toBe(true);
    expect(isSemverEqual('1.0.0', 'v1.0.0')).toBe(true);
    expect(isSemverEqual('v1.0.0', 'v1.0.0')).toBe(true);
  });

  it('returns false for different versions', () => {
    expect(isSemverEqual('1.0.0', '2.0.0')).toBe(false);
    expect(isSemverEqual('v1.0.0', '1.0.1')).toBe(false);
  });
});

describe('constants', () => {
  it('MAX_UNCOMPRESSED_SIZE is 500MB', () => {
    expect(MAX_UNCOMPRESSED_SIZE).toBe(500 * 1024 * 1024);
  });

  it('UPDATE_CHECK_TTL_MS is 1 hour', () => {
    expect(UPDATE_CHECK_TTL_MS).toBe(60 * 60 * 1000);
  });
});

describe('extractZip', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-helpers-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('extracts a valid zip to the destination directory', () => {
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'hello.txt'), 'hello world');

    const zipPath = join(testDir, 'test.zip');
    execFileSync('zip', ['-j', zipPath, join(srcDir, 'hello.txt')], { stdio: 'pipe' });

    const destDir = join(testDir, 'dest');
    extractZip(zipPath, destDir);

    expect(existsSync(join(destDir, 'hello.txt'))).toBe(true);
    expect(readFileSync(join(destDir, 'hello.txt'), 'utf8')).toBe('hello world');
  });

  it('creates the destination directory if it does not exist', () => {
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'file.txt'), 'content');

    const zipPath = join(testDir, 'test.zip');
    execFileSync('zip', ['-j', zipPath, join(srcDir, 'file.txt')], { stdio: 'pipe' });

    const destDir = join(testDir, 'nested', 'deep', 'dest');
    extractZip(zipPath, destDir);

    expect(existsSync(join(destDir, 'file.txt'))).toBe(true);
  });

  it('throws for an invalid zip file', () => {
    const zipPath = join(testDir, 'bad.zip');
    writeFileSync(zipPath, 'not a zip');

    expect(() => extractZip(zipPath, join(testDir, 'dest'))).toThrow(
      'Cannot verify bundle size before extraction',
    );
  });
});

describe('hashBundlePath', () => {
  it('returns a 12-character hex string', () => {
    const hash = hashBundlePath('/some/path/bundle.mcpb');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('returns the same hash for the same absolute path', () => {
    expect(hashBundlePath('/a/b/c.mcpb')).toBe(hashBundlePath('/a/b/c.mcpb'));
  });

  it('returns different hashes for different paths', () => {
    expect(hashBundlePath('/a/b/c.mcpb')).not.toBe(hashBundlePath('/a/b/d.mcpb'));
  });

  it('resolves relative paths before hashing', () => {
    // A relative path and its resolved absolute equivalent should produce the same hash
    const relative = 'bundle.mcpb';
    const absolute = resolve(relative);
    expect(hashBundlePath(relative)).toBe(hashBundlePath(absolute));
  });
});

describe('localBundleNeedsExtract', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-helpers-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns true when cache dir has no metadata file', () => {
    const bundlePath = join(testDir, 'bundle.mcpb');
    writeFileSync(bundlePath, 'fake bundle');
    const cacheDir = join(testDir, 'cache');
    mkdirSync(cacheDir);

    expect(localBundleNeedsExtract(bundlePath, cacheDir)).toBe(true);
  });

  it('returns true when bundle is newer than extraction', () => {
    const bundlePath = join(testDir, 'bundle.mcpb');
    const cacheDir = join(testDir, 'cache');
    mkdirSync(cacheDir);

    // Write metadata with an old extractedAt
    const oldTime = new Date('2020-01-01T00:00:00Z').toISOString();
    writeFileSync(join(cacheDir, '.mpak-local-meta.json'), JSON.stringify({ extractedAt: oldTime }));

    // Write bundle "now" — its mtime will be newer than 2020
    writeFileSync(bundlePath, 'fake bundle');

    expect(localBundleNeedsExtract(bundlePath, cacheDir)).toBe(true);
  });

  it('returns false when extraction is newer than bundle', () => {
    const bundlePath = join(testDir, 'bundle.mcpb');
    writeFileSync(bundlePath, 'fake bundle');

    // Set bundle mtime to the past
    const pastTime = new Date('2020-01-01T00:00:00Z');
    utimesSync(bundlePath, pastTime, pastTime);

    const cacheDir = join(testDir, 'cache');
    mkdirSync(cacheDir);

    // Write metadata with a recent extractedAt
    writeFileSync(
      join(cacheDir, '.mpak-local-meta.json'),
      JSON.stringify({ extractedAt: new Date().toISOString() }),
    );

    expect(localBundleNeedsExtract(bundlePath, cacheDir)).toBe(false);
  });

  it('returns true when metadata is corrupt JSON', () => {
    const bundlePath = join(testDir, 'bundle.mcpb');
    writeFileSync(bundlePath, 'fake bundle');
    const cacheDir = join(testDir, 'cache');
    mkdirSync(cacheDir);
    writeFileSync(join(cacheDir, '.mpak-local-meta.json'), 'not json');

    expect(localBundleNeedsExtract(bundlePath, cacheDir)).toBe(true);
  });

  it('returns true when metadata is missing extractedAt', () => {
    const bundlePath = join(testDir, 'bundle.mcpb');
    writeFileSync(bundlePath, 'fake bundle');
    const cacheDir = join(testDir, 'cache');
    mkdirSync(cacheDir);
    writeFileSync(join(cacheDir, '.mpak-local-meta.json'), JSON.stringify({ other: 'field' }));

    expect(localBundleNeedsExtract(bundlePath, cacheDir)).toBe(true);
  });
});

describe('readJsonFromFile', () => {
  let testDir: string;

  const TestSchema = z.object({
    name: z.string(),
    value: z.number(),
  });

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-helpers-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('reads and validates a valid JSON file', () => {
    const filePath = join(testDir, 'valid.json');
    writeFileSync(filePath, JSON.stringify({ name: 'test', value: 42 }));

    expect(readJsonFromFile(filePath, TestSchema)).toEqual({ name: 'test', value: 42 });
  });

  it('throws when file does not exist', () => {
    expect(() => readJsonFromFile(join(testDir, 'missing.json'), TestSchema)).toThrow(
      'File does not exist',
    );
  });

  it('throws for invalid JSON', () => {
    const filePath = join(testDir, 'bad.json');
    writeFileSync(filePath, '{not valid json');

    expect(() => readJsonFromFile(filePath, TestSchema)).toThrow('File is not valid JSON');
  });

  it('throws when JSON fails schema validation', () => {
    const filePath = join(testDir, 'wrong-shape.json');
    writeFileSync(filePath, JSON.stringify({ name: 'test', value: 'not a number' }));

    expect(() => readJsonFromFile(filePath, TestSchema)).toThrow('File failed validation');
  });
});
