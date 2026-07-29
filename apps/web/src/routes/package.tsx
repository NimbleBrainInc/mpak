import { data, useLoaderData } from 'react-router';
import type { PackageDetail } from '../lib/api';
import { SECURITY_HEADERS, socialImageMeta } from '../lib/meta';
import { fetchPackage, isPackageName } from '../lib/registry';
import { generateBreadcrumbSchema, generatePackageSchema } from '../lib/schema';
import { SITE_URL } from '../lib/siteConfig';
import PackageDetailPage from '../pages/PackageDetailPage';
import type { Route } from './+types/package';

/**
 * Package pages are the registry's indexable surface, so they render on the
 * server: a crawler gets the name, description, tools, and trust score in the
 * first response rather than an empty root div.
 */
export async function loader({ params }: Route.LoaderArgs) {
  const name = params['*'];

  // The splat captures whatever follows /packages/, so an encoded traversal
  // would otherwise reach a different registry endpoint, which answers 200 with
  // a shape this page cannot render.
  if (!name || !isPackageName(name)) {
    throw data(`No package named ${name ?? ''}`, { status: 404 });
  }

  const result = await fetchPackage<PackageDetail>(name);
  if (result.status === 'missing') throw data(`No package named ${name}`, { status: 404 });
  if (result.status === 'unavailable') {
    throw data('The registry could not be reached', { status: 503 });
  }

  return { pkg: result.value };
}

export function headers() {
  return {
    ...SECURITY_HEADERS,
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
    ...socialImageMeta(),
    ...(pkg
      ? [
          { 'script:ld+json': generatePackageSchema(pkg) },
          {
            'script:ld+json': generateBreadcrumbSchema([
              { name: 'Registry', url: `${SITE_URL}/` },
              { name, url: canonical },
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
