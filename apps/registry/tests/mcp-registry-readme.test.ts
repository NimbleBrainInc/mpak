/**
 * The second README source, used only when a mirrored bundle ships none.
 *
 * The assertions that matter here are about restraint: it must prefer the ref
 * the artifact was published at, must never fail an ingest, and must not build
 * a URL out of an upstream-controlled string without checking its shape.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGithubReadme, releaseTagFromAssetUrl } from '../src/services/mcp-registry/readme.js';

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  const spy = vi.fn((input: string | URL) => Promise.resolve(handler(String(input))));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function ok(body: string): Response {
  return new Response(body, { status: 200 });
}

function notFound(): Response {
  return new Response('404: Not Found', { status: 404 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('releaseTagFromAssetUrl', () => {
  it('recovers the tag from a GitHub release asset URL', () => {
    expect(
      releaseTagFromAssetUrl(
        'https://github.com/acme/widget/releases/download/v1.1.8/widget-1.1.8.mcpb',
      ),
    ).toBe('v1.1.8');
  });

  it('decodes a percent-encoded tag', () => {
    expect(
      releaseTagFromAssetUrl('https://github.com/acme/widget/releases/download/v1%2F2/w.mcpb'),
    ).toBe('v1/2');
  });

  it('returns undefined for a URL that is not a release asset', () => {
    expect(releaseTagFromAssetUrl('https://example.com/downloads/widget.mcpb')).toBeUndefined();
    expect(releaseTagFromAssetUrl(undefined)).toBeUndefined();
  });
});

describe('fetchGithubReadme', () => {
  it('reads from the raw CDN, not the rate-limited API', async () => {
    // The registry holds no GitHub token, so the API's 60/hour budget is shared
    // with claim verification — a user-facing flow. A nightly run over the whole
    // upstream catalog would consume it in the first minute.
    const spy = mockFetch(() => ok('# Widget'));
    await fetchGithubReadme({ githubRepo: 'acme/widget' });

    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) {
      expect(String(call[0])).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
      expect(String(call[0])).not.toMatch(/api\.github\.com/);
    }
  });

  it('prefers the release tag over the default branch', async () => {
    const spy = mockFetch((url) =>
      url.includes('/v1.1.8/') ? ok('# At the tag') : ok('# At HEAD'),
    );

    const readme = await fetchGithubReadme({ githubRepo: 'acme/widget', ref: 'v1.1.8' });

    expect(readme).toBe('# At the tag');
    expect(String(spy.mock.calls[0]?.[0])).toBe(
      'https://raw.githubusercontent.com/acme/widget/v1.1.8/README.md',
    );
  });

  it('falls back to HEAD when the tag has no README', async () => {
    mockFetch((url) => (url.includes('/HEAD/') ? ok('# At HEAD') : notFound()));
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget', ref: 'v1.1.8' })).toBe('# At HEAD');
  });

  it('tries other README spellings', async () => {
    mockFetch((url) => (url.endsWith('README.rst') ? ok('rst body') : notFound()));
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget' })).toBe('rst body');
  });

  it('returns null when the repository has no README', async () => {
    mockFetch(() => notFound());
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget' })).toBeNull();
  });

  it('returns null rather than throwing when the network fails', async () => {
    // A nightly run must not abandon a server because someone's repo is
    // unreachable. Every failure here is best-effort by construction.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNRESET'))),
    );
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget' })).toBeNull();
  });

  it('drops a response larger than the cap', async () => {
    mockFetch(() => ok('a'.repeat(600 * 1024)));
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget' })).toBeNull();
  });

  it('measures the cap in bytes, not UTF-16 code units', async () => {
    // 200k multibyte characters is well under the cap by `.length` and well
    // over it in bytes. Counting code units would admit several times the
    // stated bound for any non-ASCII prose.
    const multibyte = '日'.repeat(200 * 1024);
    expect(multibyte.length).toBeLessThan(512 * 1024);
    expect(Buffer.byteLength(multibyte)).toBeGreaterThan(512 * 1024);

    mockFetch(() => ok(multibyte));
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget' })).toBeNull();
  });

  it('honours a Content-Length over the cap without reading the body', async () => {
    const spy = mockFetch(
      () =>
        new Response('short', {
          status: 200,
          headers: { 'content-length': String(10 * 1024 * 1024) },
        }),
    );
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget' })).toBeNull();
    expect(spy).toHaveBeenCalled();
  });

  it('treats a whitespace-only README as absent', async () => {
    mockFetch(() => ok('   \n\n  '));
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget' })).toBeNull();
  });

  it('tries the lowercase spelling, which the CDN treats as a different path', async () => {
    // Unlike the in-bundle lookup, which compares case-insensitively, this is a
    // URL path on a case-sensitive host: `README.md` 404s for a repo whose file
    // is `readme.md`.
    mockFetch((url) => (url.endsWith('/readme.md') ? ok('lowercase body') : notFound()));
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget' })).toBe('lowercase body');
  });

  it('refuses a repo slug that is not owner/repo', async () => {
    const spy = mockFetch(() => ok('# nope'));
    expect(await fetchGithubReadme({ githubRepo: '../../etc/passwd' })).toBeNull();
    expect(await fetchGithubReadme({ githubRepo: 'acme/widget/extra' })).toBeNull();
    // Two dot segments are a legal *shape* — both sides match the character
    // class — so the shape check alone lets this through. `githubSlug` builds
    // the slug by regex-matching an upstream URL rather than parsing it, so
    // `https://github.com/../..` really does arrive here.
    expect(await fetchGithubReadme({ githubRepo: '../..' })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('refuses a ref that could climb out of the repository path', async () => {
    // The ref comes from an upstream-controlled artifact URL and is placed in
    // the URL path unescaped, because a branch ref legitimately contains `/`.
    const spy = mockFetch(() => ok('# nope'));
    await fetchGithubReadme({ githubRepo: 'acme/widget', ref: '../../other/repo' });

    for (const call of spy.mock.calls) {
      expect(String(call[0])).not.toContain('..');
    }
  });
});
