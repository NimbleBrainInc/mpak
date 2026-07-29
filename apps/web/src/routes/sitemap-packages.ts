import { apiUrl, SITE_URL } from '../lib/siteConfig';

interface SitemapPackage {
  name: string;
  updated_at?: string;
}

/**
 * The package half of the sitemap, generated per request from the registry.
 *
 * This used to be a build step that fetched the API and wrote a file, which
 * meant the published sitemap reflected whatever the registry held at image
 * build time — and silently emitted nothing at all when the build host could
 * not reach it. Serving it from the app removes both failure modes: it cannot
 * drift from what the registry actually holds, and it cannot be stale.
 *
 * The marketing and docs URLs live in mpak-web's own sitemap.
 */
export async function loader() {
  const res = await fetch(apiUrl('/app/packages?limit=1000'), {
    headers: { accept: 'application/json' },
  });

  if (!res.ok) {
    // A sitemap that 200s with no URLs tells a crawler the registry is empty
    // and is worse than admitting the lookup failed.
    return new Response('Could not reach the registry', { status: 503 });
  }

  const { packages = [] } = (await res.json()) as { packages?: SitemapPackage[] };
  const today = new Date().toISOString().slice(0, 10);

  const urls = packages
    .map((pkg) => {
      const lastmod = pkg.updated_at ? pkg.updated_at.slice(0, 10) : today;
      return `  <url>
    <loc>${SITE_URL}/packages/${escapeXml(pkg.name)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    })
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
    {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
