import type { Package } from '../lib/api';
import { generateItemListSchema } from '../lib/schema';
import { apiUrl, SITE_URL } from '../lib/siteConfig';
import BrowsePackagesPage from '../pages/BrowsePackagesPage';
import type { Route } from './+types/browse';

/**
 * The registry index. Fetched here rather than in an effect so the listing is
 * in the server response — an effect never runs for a crawler, which is how
 * this page came to serve a skeleton to anything that could not execute JS.
 */
export async function loader() {
  const res = await fetch(apiUrl('/app/packages?limit=100&sort=downloads'), {
    headers: { accept: 'application/json' },
  });

  if (!res.ok) {
    // Render the shell and let the browser retry rather than failing the whole
    // document over a listing.
    return { packages: [] as Package[] };
  }

  const { packages = [] } = (await res.json()) as { packages?: Package[] };
  return { packages };
}

export function headers() {
  return {
    'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
  };
}

const DESCRIPTION =
  'Browse MCP server bundles on mpak. Every bundle is scanned against 25 security controls with a public trust score.';

export function meta({ loaderData }: Route.MetaArgs) {
  const packages = loaderData?.packages ?? [];
  const title = 'mpak — the secure registry for MCP servers';

  return [
    { title },
    { name: 'description', content: DESCRIPTION },
    { name: 'robots', content: 'index, follow' },
    { tagName: 'link', rel: 'canonical', href: `${SITE_URL}/` },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: `${SITE_URL}/` },
    { property: 'og:title', content: title },
    { property: 'og:description', content: DESCRIPTION },
    ...(packages.length
      ? [
          {
            'script:ld+json': generateItemListSchema(
              packages.map((pkg) => ({
                name: pkg.name,
                url: `${SITE_URL}/packages/${pkg.name}`,
              })),
              'MCP server bundles on mpak',
            ),
          },
        ]
      : []),
  ];
}

export default function BrowseRoute({ loaderData }: Route.ComponentProps) {
  return <BrowsePackagesPage initialPackages={loaderData.packages} />;
}
