/**
 * Pure mapping between an upstream MCP Registry server and mpak's catalog
 * shape. No I/O, so every rule here is directly testable and the ingest
 * pipeline stays a thin orchestration layer over it.
 */

import type { UpstreamPackage, UpstreamServerEntry } from './types.js';

export const VALID_OS = ['darwin', 'linux', 'win32', 'any'] as const;
export const VALID_ARCH = ['x64', 'arm64', 'any'] as const;

export type ArtifactOs = (typeof VALID_OS)[number];
export type ArtifactArch = (typeof VALID_ARCH)[number];

export interface MappedArtifact {
  /** Absolute upstream URL to the bundle file. */
  sourceUrl: string;
  /** Hex sha256 declared upstream; the only integrity anchor available. */
  sha256: string;
  os: ArtifactOs;
  arch: ArtifactArch;
}

export interface MappedServer {
  /** Canonical upstream identity, verbatim. */
  upstreamName: string;
  /** Preferred npm-style handle; may collide and need the qualified form. */
  preferredName: string;
  /** Collision-free fallback handle, unique by construction. */
  qualifiedName: string;
  version: string;
  description?: string;
  title?: string;
  websiteUrl?: string;
  githubRepo?: string;
  artifacts: MappedArtifact[];
}

/** Reasons a server is catalogued as rejected rather than ingested. */
export type RejectReason =
  | 'no-mcpb-package'
  | 'missing-sha256'
  | 'bad-identifier'
  | 'duplicate-platform'
  | 'no-version'
  | 'unmappable-name';

export interface MapResult {
  server?: MappedServer;
  reason?: RejectReason;
}

/**
 * Strip an npm name segment to what npm actually permits: lowercase, and only
 * the unreserved punctuation. Upstream names are already constrained but not to
 * npm's rules, and mpak addresses packages as `@scope/name` in URLs.
 */
function sanitizeSegment(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '');
}

/**
 * Derive mpak's npm-style handles for an upstream reverse-DNS name.
 *
 * Two handles, because one is pretty and the other is safe:
 *
 *   `io.github.acme/widget` → preferred `@acme/widget`
 *                           → qualified `@io.github.acme/widget`
 *
 * The preferred form is what the existing reverse-DNS lookup heuristic already
 * guesses, so ingested packages resolve through it for free. But last-segment
 * is lossy — `io.github.acme/x` and `com.acme/x` both reduce to `@acme/x` — so
 * when the preferred handle is already taken by a different upstream server the
 * caller falls back to the qualified form, which keeps the whole namespace and
 * is therefore unique whenever the upstream name is.
 */
export function deriveNames(upstreamName: string): { preferred: string; qualified: string } | null {
  const match = /^([a-zA-Z0-9.-]+)\/([a-zA-Z0-9._-]+)$/.exec(upstreamName);
  if (!match) return null;

  const namespace = (match[1] ?? '').toLowerCase();
  const name = sanitizeSegment(match[2] ?? '');
  if (!name) return null;

  const lastSegment = sanitizeSegment(namespace.split('.').pop() ?? '');
  const fullNamespace = sanitizeSegment(namespace);
  if (!fullNamespace) return null;

  return {
    preferred: `@${lastSegment || fullNamespace}/${name}`,
    qualified: `@${fullNamespace}/${name}`,
  };
}

/**
 * Infer target platform from an artifact filename.
 *
 * Upstream has no platform field on a package, so the filename is the only
 * signal for which of a server's several bundles is which. A bundle with no
 * platform token is treated as universal (`any`/`any`) — that is the common
 * case for interpreted servers, which ship one bundle for everything.
 */
export function inferPlatform(filename: string): { os: ArtifactOs; arch: ArtifactArch } {
  const f = filename.toLowerCase();

  const os: ArtifactOs = /(darwin|macos|osx|apple)/.test(f)
    ? 'darwin'
    : /(win32|windows|\bwin\b|-win|_win|\.exe)/.test(f)
      ? 'win32'
      : /linux/.test(f)
        ? 'linux'
        : 'any';

  const arch: ArtifactArch = /(arm64|aarch64|apple-?silicon)/.test(f)
    ? 'arm64'
    : /(x86_64|x64|amd64|x86-64)/.test(f)
      ? 'x64'
      : 'any';

  // "universal" is an explicit claim of portability; honour it over a stray
  // token that happened to match above.
  if (/universal/.test(f)) return { os, arch: 'any' };

  return { os, arch };
}

/** Filename component of a URL, ignoring query and fragment. */
export function filenameFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const last = url.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

/** MCPB packages only. Everything else upstream points at npm/PyPI/OCI. */
export function mcpbPackages(entry: UpstreamServerEntry): UpstreamPackage[] {
  return (entry.server.packages ?? []).filter((p) => p?.registryType === 'mcpb');
}

/**
 * Extract the `owner/repo` slug from a repository URL, for the GitHub-ownership
 * check that lets a publisher later claim an ingested package.
 */
export function githubSlug(repositoryUrl: string | undefined): string | undefined {
  if (!repositoryUrl) return undefined;
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/i.exec(repositoryUrl);
  if (!m) return undefined;
  return `${m[1]}/${(m[2] ?? '').replace(/\.git$/, '')}`;
}

/**
 * Map one upstream entry to mpak's shape, or explain why it cannot be.
 *
 * Rejections are values rather than throws: a nightly run over the whole
 * upstream catalog expects a steady rate of unusable entries, and the reason
 * breakdown is the most useful thing the run produces.
 */
export function mapServer(entry: UpstreamServerEntry): MapResult {
  const packages = mcpbPackages(entry);
  if (packages.length === 0) return { reason: 'no-mcpb-package' };

  const names = deriveNames(entry.server.name);
  if (!names) return { reason: 'unmappable-name' };

  const version = entry.server.version?.trim();
  if (!version) return { reason: 'no-version' };

  const artifacts: MappedArtifact[] = [];
  const seen = new Set<string>();

  for (const pkg of packages) {
    const filename = filenameFromUrl(pkg.identifier);
    if (!filename) return { reason: 'bad-identifier' };

    // No declared hash means nothing to verify the download against. Upstream
    // is a metaregistry: it never holds the bytes, so an unverifiable pointer
    // is the one case where mirroring would launder unknown content into a
    // registry whose whole claim is that it checked.
    if (!pkg.fileSha256 || !/^[a-f0-9]{64}$/i.test(pkg.fileSha256)) {
      return { reason: 'missing-sha256' };
    }

    const { os, arch } = inferPlatform(filename);
    const key = `${os}/${arch}`;
    // Artifacts are keyed by platform. Two bundles claiming the same platform
    // cannot both be stored, and picking one arbitrarily would make the catalog
    // depend on upstream array order.
    if (seen.has(key)) return { reason: 'duplicate-platform' };
    seen.add(key);

    artifacts.push({
      sourceUrl: pkg.identifier,
      sha256: pkg.fileSha256.toLowerCase(),
      os,
      arch,
    });
  }

  // Status and the upstream timestamp are deliberately not carried here. Both
  // are read straight off `_meta` by the pipeline, which needs them for entries
  // this function *rejects* — a takedown commonly arrives with the packages
  // array emptied, and mapping it would be the one event worth acting on that
  // never gets acted on.
  return {
    server: {
      upstreamName: entry.server.name,
      preferredName: names.preferred,
      qualifiedName: names.qualified,
      version,
      description: entry.server.description,
      title: entry.server.title,
      websiteUrl: entry.server.websiteUrl,
      githubRepo: githubSlug(entry.server.repository?.url),
      artifacts,
    },
  };
}
