import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPackage, fetchRegistry, isPackageName } from './registry';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => Promise<Response> | never) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('isPackageName', () => {
  it('accepts scoped names', () => {
    expect(isPackageName('@nimblebraininc/echo')).toBe(true);
    expect(isPackageName('@scope-1/pkg_name.v2')).toBe(true);
  });

  // The route captures a splat, so anything that walks out of /app/packages/
  // would reach a different registry endpoint that answers 200 with a shape the
  // page cannot render.
  it('rejects traversal and unscoped input', () => {
    for (const bad of [
      '../../app/packages',
      '..%2f..%2fapp%2fpackages',
      'echo',
      '@scope/name/extra',
      '@scope/',
      '',
      '@UPPER/case',
    ]) {
      expect(isPackageName(bad), bad).toBe(false);
    }
  });
});

describe('fetchRegistry', () => {
  it('returns the parsed body on success', async () => {
    stubFetch(async () => Response.json({ packages: [{ name: '@a/b' }] }));
    await expect(fetchRegistry('/app/packages')).resolves.toEqual({
      packages: [{ name: '@a/b' }],
    });
  });

  it('returns null on an error status', async () => {
    stubFetch(async () => new Response('nope', { status: 500 }));
    await expect(fetchRegistry('/app/packages')).resolves.toBeNull();
  });

  // fetch rejects rather than resolving when the connection fails, which is
  // what turned a registry restart into a 500 on every server-rendered route.
  it('returns null when the registry is unreachable', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(fetchRegistry('/app/packages')).resolves.toBeNull();
  });
});

describe('fetchPackage', () => {
  it('reports found with the body', async () => {
    stubFetch(async () => Response.json({ name: '@a/b' }));
    await expect(fetchPackage('@a/b')).resolves.toEqual({
      status: 'found',
      value: { name: '@a/b' },
    });
  });

  it('separates a missing package from an unreachable registry', async () => {
    stubFetch(async () => new Response('', { status: 404 }));
    await expect(fetchPackage('@a/b')).resolves.toEqual({ status: 'missing' });

    stubFetch(() => {
      throw new TypeError('fetch failed');
    });
    await expect(fetchPackage('@a/b')).resolves.toEqual({ status: 'unavailable' });
  });
});
