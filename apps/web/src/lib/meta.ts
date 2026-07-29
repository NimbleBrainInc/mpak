import { SITE_URL } from './siteConfig';

/**
 * Headers nginx used to add. They moved into the app when it stopped being a
 * static site behind nginx, and are spread into each route's `headers` export
 * because React Router applies headers per leaf route, not globally.
 */
export const SECURITY_HEADERS = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
} as const;

export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_ALT = 'mpak - The secure registry for MCP servers';

/** The image tags every page needs; `twitter:card` claims a large image exists. */
export function socialImageMeta() {
  return [
    { property: 'og:image', content: OG_IMAGE },
    { property: 'og:image:width', content: '2400' },
    { property: 'og:image:height', content: '1260' },
    { property: 'og:image:alt', content: OG_IMAGE_ALT },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:image', content: OG_IMAGE },
    { name: 'twitter:image:alt', content: OG_IMAGE_ALT },
  ];
}
