import { afterEach, describe, expect, it, vi } from 'vitest';
import { loader as browseLoader } from './browse';
import { loader as healthLoader } from './health';
import { loader as packageLoader } from './package';
import { loader as sitemapLoader } from './sitemap-packages';

afterEach(() => {
  vi.unstubAllGlobals();
});

const unreachable = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new TypeError('fetch failed');
    }),
  );

const responds = (body: unknown, init?: ResponseInit) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body, init)),
  );

// Loaders are called directly; the args they don't read are not worth faking.
const args = (splat?: string) => ({ params: { '*': splat } }) as never;

describe('package loader', () => {
  it('404s a name that is not a package name, without asking the registry', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(packageLoader(args('../../app/packages'))).rejects.toMatchObject({
      init: { status: 404 },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('404s a package the registry does not have', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    await expect(packageLoader(args('@a/missing'))).rejects.toMatchObject({
      init: { status: 404 },
    });
  });

  // 503 rather than 500: the package may well exist, we just could not ask.
  it('503s when the registry is unreachable', async () => {
    unreachable();
    await expect(packageLoader(args('@a/b'))).rejects.toMatchObject({ init: { status: 503 } });
  });

  it('returns the package on success', async () => {
    responds({ name: '@a/b' });
    await expect(packageLoader(args('@a/b'))).resolves.toEqual({ pkg: { name: '@a/b' } });
  });
});

describe('browse loader', () => {
  it('returns the listing', async () => {
    responds({ packages: [{ name: '@a/b' }] });
    await expect(browseLoader()).resolves.toEqual({ packages: [{ name: '@a/b' }] });
  });

  // Undefined, not []. An empty array reads as "the registry is empty" and
  // leaves the client with nothing to retry.
  it('leaves packages undefined when the registry is unreachable', async () => {
    unreachable();
    await expect(browseLoader()).resolves.toEqual({ packages: undefined });
  });
});

describe('sitemap loader', () => {
  it('emits one url per package and escapes the name', async () => {
    responds({ packages: [{ name: '@a/b', updated_at: '2026-01-02T03:04:05Z' }] });
    const body = await (await sitemapLoader()).text();
    expect(body).toContain('<loc>https://registry.mpak.dev/packages/@a/b</loc>');
    expect(body).toContain('<lastmod>2026-01-02</lastmod>');
  });

  it('escapes XML-significant characters in a name', async () => {
    responds({ packages: [{ name: '@a/b&c' }] });
    const body = await (await sitemapLoader()).text();
    expect(body).toContain('@a/b&amp;c');
  });

  // A 200 with no urls tells a crawler the registry is empty.
  it('503s rather than emitting an empty sitemap', async () => {
    unreachable();
    expect((await sitemapLoader()).status).toBe(503);
  });
});

describe('health loader', () => {
  it('reports ok without touching the registry', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = healthLoader();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'ok', service: 'mpak-web' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
