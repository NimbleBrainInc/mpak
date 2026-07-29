import { data, useLoaderData } from 'react-router';
import PackageDetailPage from '../pages/PackageDetailPage';
import type { PackageDetail } from '../lib/api';
import { generateBreadcrumbSchema, generatePackageSchema } from '../lib/schema';
import { apiUrl, SITE_URL } from '../lib/siteConfig';
import type { Route } from './+types/package';

/**
 * Package pages are the registry's indexable surface, so they render on the
 * server: a crawler gets the name, description, tools, and trust score in the
 * first response rather than an empty root div.
 *
 * The response is cacheable at the edge and served stale while revalidating, so
 * a publish shows up within the window without the page ever depending on the
 * API being reachable at request time.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const name = params['*'];
  if (!name) throw data('Package name is required', { status: 404 });

  const res = await fetch(apiUrl(`/app/packages/${name}`), {
    headers: { accept: 'application/json' },
  });

  if (res.status === 404) {
    throw data(`No package named ${name}`, { status: 404 });
  }
  if (!res.ok) {
    throw data('The registry could not be reached', { status: 502 });
  }

  return { pkg: (await res.json()) as PackageDetail };
}

export function headers() {
  return {
    'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
  };
}

export function meta({ loaderData: loaded, params }: Route.MetaArgs) {
  const pkg = loaded?.pkg;
  const name = pkg?.name ?? params['*'] ?? 'Package';
  const canonical = `${SITE_URL}/packages/${name}`;
  const title = `${pkg?.display_name || name} | mpak`;
  const description =
    pkg?.description ||
    `${name} — an MCP server bundle on mpak, scanned against 25 security controls.`;

  return [
    { title },
    { name: 'description', content: description },
    { name: 'robots', content: 'index, follow' },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:card', content: 'summary_large_image' },
    ...(pkg
      ? [
          {
            'script:ld+json': generatePackageSchema(pkg),
          },
          {
            'script:ld+json': generateBreadcrumbSchema([
              { name: 'Registry', url: `${SITE_URL}/` },
              { name: name, url: canonical },
            ]),
          },
        ]
      : []),
  ];
}

export default function PackageRoute() {
  const { pkg } = useLoaderData<typeof loader>();
  return <PackageDetailPage initialPackage={pkg} />;
}
