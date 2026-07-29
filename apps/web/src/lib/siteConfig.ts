/**
 * The UI and the registry API share a host — registry.mpak.dev serves the
 * browser routes and `/app`, `/v1`, `/v0.1` alike — so the browser talks to the
 * API same-origin with no CORS preflight and no second hostname to provision.
 *
 * Server-side loaders have no origin to be relative to, so they need an
 * absolute address. In the cluster that is the registry Service; in dev it is
 * the local API.
 */
export const API_BASE =
  typeof document === 'undefined'
    ? // Read at request time, not build time: import.meta.env is baked in by
      // Vite, so a value set on the running container would never be seen.
      (globalThis.process?.env?.MPAK_API_URL ?? 'http://localhost:3200')
    : '';

/** Absolute on the server, same-origin relative in the browser. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** @deprecated use apiUrl() — kept until the axios client is migrated. */
export const API_URL = API_BASE || '';

/**
 * Canonical origin for this application. Marketing and docs are a different
 * site (mpak.dev); this is where package pages live and canonicalize to.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://registry.mpak.dev').replace(
  /\/$/,
  '',
);

/** Where the marketing site and documentation live. */
export const MARKETING_URL = (import.meta.env.VITE_MARKETING_URL ?? 'https://mpak.dev').replace(
  /\/$/,
  '',
);

export const siteConfig = {
  siteUrl: SITE_URL,
  marketingUrl: MARKETING_URL,
  docsUrl: `${MARKETING_URL}/docs`,
  operator: {
    name: import.meta.env.VITE_OPERATOR_NAME || 'NimbleBrain Inc.',
    shortName: import.meta.env.VITE_OPERATOR_SHORT_NAME || 'NimbleBrain',
    url: import.meta.env.VITE_OPERATOR_URL || 'https://nimblebrain.ai',
  },
  contact: {
    general: import.meta.env.VITE_CONTACT_EMAIL || 'hello@mpak.dev',
    legal: import.meta.env.VITE_LEGAL_EMAIL || 'legal@mpak.dev',
    privacy: import.meta.env.VITE_PRIVACY_EMAIL || 'privacy@mpak.dev',
  },
  github: {
    org: import.meta.env.VITE_GITHUB_ORG_URL || 'https://github.com/NimbleBrainInc',
    repo: import.meta.env.VITE_GITHUB_REPO_URL || 'https://github.com/NimbleBrainInc/mpak',
    issues:
      import.meta.env.VITE_GITHUB_ISSUES_URL || 'https://github.com/NimbleBrainInc/mpak/issues',
  },
};
