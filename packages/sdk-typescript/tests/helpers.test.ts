import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  extractZip,
  hashBundlePath,
  isSemverEqual,
  localBundleNeedsExtract,
  MAX_UNCOMPRESSED_SIZE,
  readJsonFromFile,
  UPDATE_CHECK_TTL_MS,
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
  it('MAX_UNCOMPRESSED_SIZE has a sensible default (>=1GB)', () => {
    expect(MAX_UNCOMPRESSED_SIZE).toBeGreaterThanOrEqual(1024 * 1024 * 1024);
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

  it('extracts a valid zip to the destination directory', async () => {
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'hello.txt'), 'hello world');

    const zipPath = join(testDir, 'test.zip');
    execFileSync('zip', ['-j', zipPath, join(srcDir, 'hello.txt')], { stdio: 'pipe' });

    const destDir = join(testDir, 'dest');
    await extractZip(zipPath, destDir);

    expect(existsSync(join(destDir, 'hello.txt'))).toBe(true);
    expect(readFileSync(join(destDir, 'hello.txt'), 'utf8')).toBe('hello world');
  });

  it('creates the destination directory if it does not exist', async () => {
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'file.txt'), 'content');

    const zipPath = join(testDir, 'test.zip');
    execFileSync('zip', ['-j', zipPath, join(srcDir, 'file.txt')], { stdio: 'pipe' });

    const destDir = join(testDir, 'nested', 'deep', 'dest');
    await extractZip(zipPath, destDir);

    expect(existsSync(join(destDir, 'file.txt'))).toBe(true);
  });

  it('preserves nested directory structure', async () => {
    const srcDir = join(testDir, 'src');
    mkdirSync(join(srcDir, 'a', 'b', 'c'), { recursive: true });
    writeFileSync(join(srcDir, 'top.txt'), 'top');
    writeFileSync(join(srcDir, 'a', 'b', 'c', 'deep.txt'), 'deep');

    const zipPath = join(testDir, 'test.zip');
    execFileSync('zip', ['-r', zipPath, '.'], { cwd: srcDir, stdio: 'pipe' });

    const destDir = join(testDir, 'dest');
    await extractZip(zipPath, destDir);

    expect(readFileSync(join(destDir, 'top.txt'), 'utf8')).toBe('top');
    expect(readFileSync(join(destDir, 'a', 'b', 'c', 'deep.txt'), 'utf8')).toBe('deep');
  });

  it('preserves executable bit on scripts', async () => {
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);
    const scriptPath = join(srcDir, 'run.sh');
    writeFileSync(scriptPath, '#!/bin/sh\necho hi\n');
    chmodSync(scriptPath, 0o755);

    const zipPath = join(testDir, 'test.zip');
    execFileSync('zip', ['-j', zipPath, scriptPath], { stdio: 'pipe' });

    const destDir = join(testDir, 'dest');
    await extractZip(zipPath, destDir);

    const mode = statSync(join(destDir, 'run.sh')).mode & 0o777;
    expect(mode & 0o100).toBe(0o100); // owner-executable
  });

  it('throws for an invalid zip file', async () => {
    const zipPath = join(testDir, 'bad.zip');
    writeFileSync(zipPath, 'not a zip');

    await expect(extractZip(zipPath, join(testDir, 'dest'))).rejects.toThrow(
      'Cannot open bundle archive',
    );
  });

  it('handles archives with many entries (no buffer limit regression)', async () => {
    // The previous implementation shelled out to `unzip -l` with Node's
    // default 1 MB maxBuffer, which blew up on archives with ~15K+ files.
    // This test creates enough entries to have exceeded that limit.
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);
    const count = 20000;
    for (let i = 0; i < count; i++) {
      writeFileSync(join(srcDir, `f${i}.txt`), String(i));
    }

    const zipPath = join(testDir, 'many.zip');
    execFileSync('zip', ['-r', '-0', zipPath, '.'], { cwd: srcDir, stdio: 'pipe' });

    const destDir = join(testDir, 'dest');
    await extractZip(zipPath, destDir);

    expect(existsSync(join(destDir, 'f0.txt'))).toBe(true);
    expect(existsSync(join(destDir, `f${count - 1}.txt`))).toBe(true);
  }, 60_000);

  it('rejects when total declared size exceeds the configured cap', async () => {
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);
    // 4 files × 1KB = 4KB declared total; cap at 2KB
    const payload = 'x'.repeat(1024);
    for (let i = 0; i < 4; i++) writeFileSync(join(srcDir, `f${i}.txt`), payload);

    const zipPath = join(testDir, 'oversize.zip');
    execFileSync('zip', ['-r', zipPath, '.'], { cwd: srcDir, stdio: 'pipe' });

    await expect(
      extractZip(zipPath, join(testDir, 'dest'), { maxUncompressedSize: 2048 }),
    ).rejects.toThrow(/exceeds maximum allowed/);
  });

  it('accepts when total declared size is under the configured cap', async () => {
    const srcDir = join(testDir, 'src');
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, 'small.txt'), 'hi');

    const zipPath = join(testDir, 'small.zip');
    execFileSync('zip', ['-r', zipPath, '.'], { cwd: srcDir, stdio: 'pipe' });

    await expect(
      extractZip(zipPath, join(testDir, 'dest'), { maxUncompressedSize: 1024 * 1024 }),
    ).resolves.toBeUndefined();
  });

  it('rejects entries that escape the destination directory', async () => {
    // Craft a zip containing a path-traversal entry. `zip` normalizes `..`
    // out of relative paths, so we use Python to write the raw entry name.
    const zipPath = join(testDir, 'traversal.zip');
    execFileSync(
      'python3',
      [
        '-c',
        `import zipfile, sys\nwith zipfile.ZipFile(sys.argv[1], 'w') as z:\n  z.writestr('../escaped.txt', 'pwned')\n`,
        zipPath,
      ],
      { stdio: 'pipe' },
    );

    // Rejection may come from yauzl's own `..` guard (wrapped as
    // "Invalid bundle entry") or from our resolve-based check
    // ("escapes destination directory"). Either proves traversal is blocked.
    await expect(extractZip(zipPath, join(testDir, 'dest'))).rejects.toThrow(
      /(escapes destination directory|Invalid bundle entry.*invalid relative path)/,
    );
  });

  it('rejects archives containing symlink entries', async () => {
    const zipPath = join(testDir, 'symlink.zip');
    // Create a symlink entry via Python: external_attr encodes mode 0o120777.
    execFileSync(
      'python3',
      [
        '-c',
        `import zipfile, sys\nzi = zipfile.ZipInfo('link')\nzi.create_system = 3\nzi.external_attr = (0o120777 << 16)\nwith zipfile.ZipFile(sys.argv[1], 'w') as z:\n  z.writestr(zi, 'target.txt')\n`,
        zipPath,
      ],
      { stdio: 'pipe' },
    );

    await expect(extractZip(zipPath, join(testDir, 'dest'))).rejects.toThrow(
      /symlinks are not permitted/,
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
    writeFileSync(
      join(cacheDir, '.mpak-local-meta.json'),
      JSON.stringify({ extractedAt: oldTime }),
    );

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
