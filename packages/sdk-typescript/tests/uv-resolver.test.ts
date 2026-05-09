import { describe, expect, it } from 'vitest';

import { resolveUv, UvResolutionError } from '../src/uv-resolver.js';

describe('resolveUv', () => {
  function probeOk(version = '0.4.22') {
    return () => ({ version });
  }

  it('uses the spec-canonical default args when the manifest provides none', () => {
    // From upstream `examples/hello-world-uv/manifest.json`:
    //   "args": ["run", "--directory", "${__dirname}", "src/server.py"]
    // Our default has to match shape-for-shape so embedders that don't honor
    // `server.cwd` still find pyproject.toml.
    const resolved = resolveUv({
      cacheDir: '/tmp/cache/abc',
      entryPoint: 'src/server.py',
      manifestCommand: undefined,
      userArgs: [],
      probe: probeOk(),
    });
    expect(resolved.command).toBe('uv');
    expect(resolved.args).toEqual(['run', '--directory', '/tmp/cache/abc', 'src/server.py']);
  });

  it('defers to manifest-supplied args verbatim', () => {
    // The manifest's args have already been ${__dirname}-substituted by the
    // SDK before reaching the resolver — this test only pins the resolver's
    // behavior of trusting them as-is.
    const resolved = resolveUv({
      cacheDir: '/tmp/cache/abc',
      entryPoint: 'src/server.py',
      manifestCommand: 'uv',
      userArgs: ['run', '--directory', '/tmp/cache/abc', 'src/server.py'],
      probe: probeOk(),
    });
    expect(resolved.args).toEqual(['run', '--directory', '/tmp/cache/abc', 'src/server.py']);
  });

  it('honors manifest.command (e.g. an absolute uv path) verbatim', () => {
    const resolved = resolveUv({
      cacheDir: '/tmp/cache/abc',
      entryPoint: 'src/server.py',
      manifestCommand: '/opt/local/bin/uv',
      userArgs: [],
      probe: probeOk(),
    });
    expect(resolved.command).toBe('/opt/local/bin/uv');
  });

  it('throws UvResolutionError with install instructions when uv is missing', () => {
    let err: unknown;
    try {
      resolveUv({
        cacheDir: '/tmp/cache/abc',
        entryPoint: 'src/server.py',
        manifestCommand: undefined,
        userArgs: [],
        probe: () => null,
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UvResolutionError);
    const msg = (err as Error).message;
    expect(msg).toContain('not on PATH');
    expect(msg).toContain('astral.sh/uv/install.sh');
  });

  it('returns the probed uv version for diagnostic logging', () => {
    const resolved = resolveUv({
      cacheDir: '/tmp/cache/abc',
      entryPoint: 'src/server.py',
      manifestCommand: undefined,
      userArgs: [],
      probe: () => ({ version: '0.5.1' }),
    });
    expect(resolved.version).toBe('0.5.1');
  });
});
