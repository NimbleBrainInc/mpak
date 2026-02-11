/**
 * Derive the API URL from the current hostname.
 * - localhost → http://localhost:3200
 * - preview.mpak.dev → https://registry.preview.mpak.dev
 * - mpak.dev → https://registry.mpak.dev
 */
function getApiUrl(): string {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_URL || 'http://localhost:3200';
  }
  const { hostname, protocol } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3200';
  }
  return `${protocol}//registry.${hostname}`;
}

export const API_URL = getApiUrl();

/**
 * Operator identity config. Self-hosted instances can override these
 * via VITE_ environment variables to brand the site for their org.
 */
/**
 * Derive the site URL from the current hostname.
 * Self-hosted instances can override via VITE_SITE_URL.
 */
function getSiteUrl(): string {
  if (import.meta.env.VITE_SITE_URL) {
    return import.meta.env.VITE_SITE_URL.replace(/\/$/, '');
  }
  if (typeof window === 'undefined') {
    return 'https://www.mpak.dev';
  }
  return window.location.origin;
}

export const SITE_URL = getSiteUrl();

export const siteConfig = {
  siteUrl: SITE_URL,
  docsUrl: import.meta.env.VITE_DOCS_URL || 'https://docs.mpak.dev',
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
    issues: import.meta.env.VITE_GITHUB_ISSUES_URL || 'https://github.com/NimbleBrainInc/mpak/issues',
  },
};
