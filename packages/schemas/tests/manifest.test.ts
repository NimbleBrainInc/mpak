import { describe, expect, it } from 'vitest';

import {
  CompatibilityRuntimesSchema,
  CompatibilitySchema,
  ManifestServerSchema,
  McpbManifestSchema,
  McpConfigSchema,
  SafeRelativePathSchema,
} from '../src/manifest.js';

describe('SafeRelativePathSchema', () => {
  describe('accepts safe relative paths', () => {
    it.each([
      'index.js',
      './index.js',
      'src/index.js',
      'build/server/main.js',
      'main.py',
      'mcp_echo.server',
      'bin/run',
      'deeply/nested/path/to/file.js',
      'name-with-dashes.js',
      'name_with_underscores.js',
      'file.with.many.dots.js',
      'ünicode/файл.js',
    ])('accepts %j', (path) => {
      expect(SafeRelativePathSchema.safeParse(path).success).toBe(true);
    });
  });

  describe('rejects unsafe paths', () => {
    it.each([
      ['empty string', ''],
      ['NUL byte', 'foo\0bar'],
      ['POSIX absolute', '/etc/passwd'],
      ['POSIX absolute root', '/'],
      ['dotdot at start', '../foo'],
      ['dotdot in middle', 'foo/../bar'],
      ['dotdot at end', 'foo/..'],
      ['multiple dotdot', '../../../etc/passwd'],
      ['windows drive', 'C:\\evil'],
      ['windows drive forward slash', 'C:/evil'],
      ['windows drive lowercase', 'c:\\evil'],
      ['windows drive without separator', 'C:foo'],
      ['windows drive-root-relative', '\\foo'],
      ['windows UNC', '\\\\server\\share'],
      ['dotdot via backslash', 'foo\\..\\bar'],
      ['any backslash', 'foo\\bar'],
    ])('rejects %s (%j)', (_label, path) => {
      expect(SafeRelativePathSchema.safeParse(path).success).toBe(false);
    });
  });

  it("does not reject paths that merely contain '..' as a substring", () => {
    expect(SafeRelativePathSchema.safeParse('foo..bar.js').success).toBe(true);
    expect(SafeRelativePathSchema.safeParse('..hidden/file.js').success).toBe(true);
  });
});

describe('McpConfigSchema', () => {
  it('accepts a fully populated mcp_config', () => {
    const result = McpConfigSchema.safeParse({
      command: 'uv',
      args: ['run', 'src/server.py'],
      env: { FOO: 'bar' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts mcp_config with no command (MCPB v0.4 — host-managed)', () => {
    const result = McpConfigSchema.safeParse({
      args: ['run', 'src/server.py'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts mcp_config with no args', () => {
    // Some uv bundles supply only `command` and rely on resolver defaults for args.
    const result = McpConfigSchema.safeParse({ command: 'uv' });
    expect(result.success).toBe(true);
  });

  it('accepts an empty mcp_config object', () => {
    const result = McpConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('ManifestServerSchema', () => {
  const validServer = {
    type: 'node' as const,
    entry_point: 'src/index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/src/index.js'],
    },
  };

  it('accepts a clean relative entry_point', () => {
    expect(ManifestServerSchema.safeParse(validServer).success).toBe(true);
  });

  it('rejects an entry_point with .. traversal', () => {
    const result = ManifestServerSchema.safeParse({
      ...validServer,
      entry_point: '../../etc/passwd',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toMatch(/relative path/i);
    }
  });

  it('rejects an absolute entry_point', () => {
    expect(
      ManifestServerSchema.safeParse({
        ...validServer,
        entry_point: '/etc/passwd',
      }).success,
    ).toBe(false);
  });

  it('rejects an empty entry_point', () => {
    expect(
      ManifestServerSchema.safeParse({
        ...validServer,
        entry_point: '',
      }).success,
    ).toBe(false);
  });

  it('accepts type:uv server with no mcp_config (host-managed execution)', () => {
    const result = ManifestServerSchema.safeParse({
      type: 'uv',
      entry_point: 'src/server.py',
    });
    expect(result.success).toBe(true);
  });

  it('accepts type:python server with full mcp_config', () => {
    const result = ManifestServerSchema.safeParse({
      type: 'python',
      entry_point: 'src/server.py',
      mcp_config: {
        command: 'python',
        args: ['-m', 'my_pkg.server'],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects servers missing entry_point', () => {
    const result = ManifestServerSchema.safeParse({ type: 'node' });
    expect(result.success).toBe(false);
  });
});

describe('CompatibilityRuntimesSchema', () => {
  it('accepts python and node version constraints', () => {
    const result = CompatibilityRuntimesSchema.safeParse({
      python: '>=3.13,<4.0',
      node: '>=20.0.0',
    });
    expect(result.success).toBe(true);
  });

  it('accepts only python (bundle authors declare what they use)', () => {
    const result = CompatibilityRuntimesSchema.safeParse({
      python: '>=3.10',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an empty runtimes block', () => {
    const result = CompatibilityRuntimesSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('CompatibilitySchema', () => {
  it("accepts the spec's full example shape", () => {
    const result = CompatibilitySchema.safeParse({
      claude_desktop: '>=1.0.0',
      my_client: '>1.0.0',
      other_client: '>=2.0.0 <3.0.0',
      platforms: ['darwin', 'win32', 'linux'],
      runtimes: {
        python: '>=3.8',
        node: '>=16.0.0',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Unknown client constraints pass through via catchall.
      expect(result.data.claude_desktop).toBe('>=1.0.0');
      expect(result.data.runtimes?.python).toBe('>=3.8');
    }
  });

  it('rejects invalid platform values', () => {
    const result = CompatibilitySchema.safeParse({
      platforms: ['beos'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string client version constraints (catchall enforces string)', () => {
    const result = CompatibilitySchema.safeParse({
      claude_desktop: 123,
    });
    expect(result.success).toBe(false);
  });
});

describe('McpbManifestSchema', () => {
  const baseManifest = {
    manifest_version: '0.4',
    name: '@test/bundle',
    version: '1.0.0',
    description: 'test',
    server: {
      type: 'node',
      entry_point: 'build/index.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/build/index.js'],
      },
    },
  };

  it('accepts a well-formed manifest', () => {
    expect(McpbManifestSchema.safeParse(baseManifest).success).toBe(true);
  });

  it('rejects a manifest whose entry_point traverses out of the bundle', () => {
    const result = McpbManifestSchema.safeParse({
      ...baseManifest,
      server: { ...baseManifest.server, entry_point: '../../../../etc/passwd' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a v0.3 type:python manifest (backward compatibility)', () => {
    const result = McpbManifestSchema.safeParse({
      manifest_version: '0.3',
      name: 'legacy-bundle',
      version: '1.0.0',
      description: 'v0.3 bundle with vendored deps',
      server: {
        type: 'python',
        entry_point: 'src/server.py',
        mcp_config: {
          command: 'python',
          args: ['-m', 'legacy.server'],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts the canonical hello-world-uv manifest from the MCPB spec', () => {
    // Verbatim from anthropics/mcpb examples/hello-world-uv/manifest.json.
    // If this stops parsing, mpak has drifted from the upstream spec.
    const result = McpbManifestSchema.safeParse({
      manifest_version: '0.4',
      name: 'hello-world-uv',
      display_name: 'Hello World (UV Runtime)',
      version: '1.0.0',
      description: 'Simple MCP server using UV runtime',
      author: { name: 'Anthropic' },
      icon: 'icon.png',
      server: {
        type: 'uv',
        entry_point: 'src/server.py',
        mcp_config: {
          command: 'uv',
          args: ['run', '--directory', '${__dirname}', 'src/server.py'],
        },
      },
      compatibility: {
        platforms: ['darwin', 'linux', 'win32'],
        runtimes: { python: '>=3.10' },
      },
      keywords: ['example', 'hello-world', 'uv'],
      license: 'MIT',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.compatibility?.runtimes?.python).toBe('>=3.10');
      expect(result.data.compatibility?.platforms).toEqual(['darwin', 'linux', 'win32']);
    }
  });

  it('accepts a host-managed type:uv bundle that omits mcp_config entirely', () => {
    const result = McpbManifestSchema.safeParse({
      manifest_version: '0.4',
      name: 'minimal-uv',
      version: '0.1.0',
      description: 'uv bundle delegating execution to the host',
      server: {
        type: 'uv',
        entry_point: 'src/server.py',
      },
      compatibility: { runtimes: { python: '>=3.13' } },
    });
    expect(result.success).toBe(true);
  });
});
