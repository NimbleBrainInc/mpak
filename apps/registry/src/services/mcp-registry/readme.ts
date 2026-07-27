/**
 * Second source for a mirrored package's README.
 *
 * The bundle itself is the first source and the better one: it is the exact
 * archive whose digest was verified, so its README describes the bytes mpak
 * stored. But only some MCPB bundles ship a root README, and a package page
 * with an empty body reads as an empty package. For the rest, the repository
 * upstream declares is the only description that exists.
 *
 * This deliberately uses `raw.githubusercontent.com` rather than the GitHub
 * API. The API is rate-limited to 60 requests/hour for unauthenticated callers,
 * and the registry holds no token — that budget is shared with repo-stat
 * fetches and, more importantly, with claim verification, which is a
 * user-facing flow. A nightly run over the whole upstream catalog would consume
 * it in the first minute and starve them. The raw host is a CDN and is not
 * charged against it.
 */

/**
 * Same order of preference as the in-bundle lookup. Kept short on purpose: a
 * repository with no README costs one 404 per name per ref, and every name past
 * these is rare enough that finding it is not worth charging every miss for.
 */
const README_PATHS = ['README.md', 'README.rst', 'README.txt', 'README'];

/** Matches the in-bundle cap; the destination column and page are the same. */
const MAX_README_BYTES = 512 * 1024;

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Recover the git ref an MCPB artifact was published at.
 *
 * Upstream MCPB identifiers are overwhelmingly GitHub release-asset URLs, which
 * carry the tag. Reading the README at that tag rather than at the default
 * branch keeps it describing the version being mirrored, which is the same
 * property the publish path gets from its release tag.
 */
export function releaseTagFromAssetUrl(assetUrl: string | undefined): string | undefined {
  if (!assetUrl) return undefined;
  const m = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/([^/]+)\//.exec(assetUrl);
  return m?.[1] ? decodeURIComponent(m[1]) : undefined;
}

async function fetchOne(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'mpak-registry' },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    // Content-Length is advisory here, so the body is still bounded below. This
    // just avoids reading a large one at all when the host is honest about it.
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_README_BYTES) return null;

    const text = await res.text();
    if (text.length > MAX_README_BYTES) return null;
    return text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a README for `owner/repo`, preferring the ref the artifact shipped at.
 *
 * Best-effort by construction: every failure returns null. A mirrored bundle
 * with no description is worse than one with a description, but far better than
 * a nightly run that abandons a server because someone's repository 404s.
 */
export async function fetchGithubReadme(options: {
  githubRepo: string;
  ref?: string;
  timeoutMs?: number;
}): Promise<string | null> {
  const { githubRepo, ref } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // `githubRepo` reaches here from the mapper's `githubSlug`, which is already
  // anchored to github.com and rejects path segments. Re-checking the shape
  // keeps that guarantee local to the function that builds a URL from it.
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(githubRepo)) return null;

  // `HEAD` resolves to the default branch whatever it is named. It is the
  // fallback rather than the first choice because it drifts away from the
  // mirrored version over time.
  const refs = ref ? [ref, 'HEAD'] : ['HEAD'];

  for (const r of refs) {
    // A ref goes into the URL path unescaped, because a branch ref legitimately
    // contains `/` and percent-encoding it would not resolve. `..` is therefore
    // excluded explicitly rather than relied on to be absent: the ref is
    // derived from an upstream-controlled artifact URL.
    if (!/^[A-Za-z0-9._/-]+$/.test(r) || r.split('/').includes('..')) continue;
    for (const p of README_PATHS) {
      const text = await fetchOne(
        `https://raw.githubusercontent.com/${githubRepo}/${r}/${p}`,
        timeoutMs,
      );
      if (text) return text;
    }
  }
  return null;
}
