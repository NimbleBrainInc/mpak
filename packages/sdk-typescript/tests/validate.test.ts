/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: intentional mpak manifest placeholders (${var} substituted at install time) */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateMcpb } from '../src/validate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// Helpers — create .mcpb test fixtures (zip archives)
// ---------------------------------------------------------------------------

function createMcpb(
  dir: string,
  name: string,
  manifest: Record<string, unknown>,
  files?: Record<string, string>,
): string {
  const srcDir = join(dir, `${name}-src`);
  mkdirSync(srcDir, { recursive: true });

  writeFileSync(join(srcDir, 'manifest.json'), JSON.stringify(manifest));

  if (files) {
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(srcDir, path);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content);
    }
  }

  const mcpbPath = join(dir, `${name}.mcpb`);
  execFileSync('zip', ['-r', mcpbPath, '.'], { cwd: srcDir, stdio: 'pipe' });
  return mcpbPath;
}

const validManifest = {
  manifest_version: '0.4',
  name: '@test/my-bundle',
  version: '1.0.0',
  description: 'A test bundle',
  server: {
    type: 'node',
    entry_point: 'src/index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/src/index.js'],
    },
  },
};

// ===========================================================================
// Tests
// ===========================================================================

describe('validateMcpb', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-validate-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Valid bundles
  // -------------------------------------------------------------------------

  it('returns valid for a well-formed .mcpb with existing entry point', async () => {
    const mcpbPath = createMcpb(testDir, 'good', validManifest, {
      'src/index.js': 'console.log("hello");',
    });

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(true);
    expect(result.manifest).toMatchObject({
      name: '@test/my-bundle',
      version: '1.0.0',
    });
    expect(result.errors).toBeUndefined();
  });

  it('returns manifest fields on success', async () => {
    const manifest = {
      ...validManifest,
      display_name: 'My Bundle',
      author: { name: 'Test Author' },
      tools: [{ name: 'do_stuff', description: 'Does stuff' }],
    };
    const mcpbPath = createMcpb(testDir, 'detailed', manifest, {
      'src/index.js': '',
    });

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(true);
    expect(result.manifest!.display_name).toBe('My Bundle');
    expect(result.manifest!.tools).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Invalid bundles — file-level
  // -------------------------------------------------------------------------

  it('returns invalid when file does not exist', async () => {
    const result = await validateMcpb(join(testDir, 'nonexistent.mcpb'));

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('returns invalid for a non-zip file', async () => {
    const fakePath = join(testDir, 'fake.mcpb');
    writeFileSync(fakePath, 'not a zip file');

    const result = await validateMcpb(fakePath);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /zip|archive|open/i.test(e))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Invalid bundles — missing manifest
  // -------------------------------------------------------------------------

  it('returns invalid when manifest.json is missing from archive', async () => {
    const srcDir = join(testDir, 'no-manifest-src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'index.js'), 'console.log("hi")');

    const mcpbPath = join(testDir, 'no-manifest.mcpb');
    execFileSync('zip', ['-r', mcpbPath, '.'], { cwd: srcDir, stdio: 'pipe' });

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /manifest/i.test(e))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Invalid bundles — schema violations
  // -------------------------------------------------------------------------

  it('returns invalid when manifest is missing required fields', async () => {
    const badManifest = {
      manifest_version: '0.4',
      name: '@test/bad',
      // missing: version, description, server
    };
    // biome-ignore lint/suspicious/noExplicitAny: deliberate test of malformed manifest
    const mcpbPath = createMcpb(testDir, 'missing-fields', badManifest as any);

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('returns invalid when server type is not recognized', async () => {
    const badManifest = {
      ...validManifest,
      server: {
        ...validManifest.server,
        type: 'perl',
      },
    };
    const mcpbPath = createMcpb(testDir, 'bad-type', badManifest, {
      'src/index.js': '',
    });

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(false);
  });

  it('returns invalid when manifest.json is not valid JSON', async () => {
    const srcDir = join(testDir, 'bad-json-src');
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, 'manifest.json'), '{not valid json}');

    const mcpbPath = join(testDir, 'bad-json.mcpb');
    execFileSync('zip', ['-r', mcpbPath, '.'], { cwd: srcDir, stdio: 'pipe' });

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /json/i.test(e))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Invalid bundles — entry point
  // -------------------------------------------------------------------------

  it('returns invalid when entry_point file does not exist in archive', async () => {
    const mcpbPath = createMcpb(testDir, 'no-entry', validManifest);
    // manifest references src/index.js but we didn't create it

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /entry.point/i.test(e))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Path-safety: schema rejects unsafe entry_point values end-to-end
  //
  // Hardening lives in `SafeRelativePathSchema` (packages/schemas) so every
  // manifest consumer (validator, runtime launcher, registry, scanner)
  // inherits the guarantee. These tests confirm the end-to-end behavior at
  // the validateMcpb layer.
  // -------------------------------------------------------------------------

  it('returns invalid when entry_point uses .. to escape the bundle', async () => {
    const evilManifest = {
      ...validManifest,
      server: { ...validManifest.server, entry_point: '../../../../etc/passwd' },
    };
    const mcpbPath = createMcpb(testDir, 'traversal', evilManifest);

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => /relative path|manifest/i.test(e))).toBe(true);
  });

  it('returns invalid when entry_point is an absolute path', async () => {
    const evilManifest = {
      ...validManifest,
      server: { ...validManifest.server, entry_point: '/etc/passwd' },
    };
    const mcpbPath = createMcpb(testDir, 'absolute', evilManifest);

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(false);
  });

  it('returns invalid when entry_point is empty', async () => {
    const evilManifest = {
      ...validManifest,
      server: { ...validManifest.server, entry_point: '' },
    };
    const mcpbPath = createMcpb(testDir, 'empty-entry', evilManifest);

    const result = await validateMcpb(mcpbPath);

    expect(result.valid).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Real-world bundle fixtures
  // -------------------------------------------------------------------------

  it('returns valid for a real .mcpb bundle (mcp-obsidian-cli manifest)', async () => {
    const result = await validateMcpb(join(FIXTURES_DIR, 'valid.mcpb'));

    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(result.manifest).toMatchObject({
      manifest_version: '0.4',
      name: '@ovaculos/obsidian-cli',
      version: '0.1.5',
    });
    expect(result.manifest!.server.entry_point).toBe('build/index.js');
  });

  it('returns invalid for a real .mcpb bundle with corrupted manifest', async () => {
    const result = await validateMcpb(join(FIXTURES_DIR, 'broken.mcpb'));

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => /manifest|json/i.test(e))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it('does not leave temp files on success', async () => {
    const mcpbPath = createMcpb(testDir, 'cleanup-pass', validManifest, {
      'src/index.js': '',
    });

    const before = tmpDirEntryCount();
    await validateMcpb(mcpbPath);
    const after = tmpDirEntryCount();

    // Should not accumulate temp dirs (allow ±1 for OS jitter)
    expect(after).toBeLessThanOrEqual(before + 1);
  });

  it('does not leave temp files on failure', async () => {
    const fakePath = join(testDir, 'fail-cleanup.mcpb');
    writeFileSync(fakePath, 'not a zip');

    const before = tmpDirEntryCount();
    await validateMcpb(fakePath);
    const after = tmpDirEntryCount();

    expect(after).toBeLessThanOrEqual(before + 1);
  });
});

// Rough check that temp dirs are cleaned up
function tmpDirEntryCount(): number {
  try {
    return execFileSync('ls', [tmpdir()], { stdio: 'pipe' })
      .toString()
      .split('\n')
      .filter((l) => l.includes('mpak-validate')).length;
  } catch {
    return 0;
  }
}
