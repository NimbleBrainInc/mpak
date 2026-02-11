/**
 * Sitemap Generator Script
 *
 * Generates a complete sitemap.xml including all packages from the API.
 * Runs automatically via `npm run prebuild` before each build.
 *
 * Usage:
 *   npm run sitemap     # Run manually
 *   npm run build       # Runs automatically via prebuild hook
 *
 * Environment:
 *   VITE_API_URL - API endpoint (defaults to https://registry.mpak.dev)
 *   SKIP_SITEMAP - Set to "true" to skip generation (useful in CI)
 */

// Skip if explicitly disabled
if (process.env.SKIP_SITEMAP === 'true') {
  console.log('Sitemap generation skipped (SKIP_SITEMAP=true)');
  process.exit(0);
}

const API_URL = process.env.VITE_API_URL || 'https://registry.mpak.dev';
const BASE_URL = 'https://www.mpak.dev';

interface Package {
  name: string;
  latest_version: string;
  updated_at?: string;
}

interface PackageApiResponse {
  packages: Package[];
  total: number;
}

interface Skill {
  name: string;
  updated_at?: string;
}

interface SkillApiResponse {
  skills: Skill[];
  total: number;
}

async function fetchWithTimeout<T>(url: string, label: string): Promise<T | null> {
  try {
    console.log(`Fetching ${label} from ${url}...`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn(`Could not fetch ${label}:`, (error as Error).message);
    return null;
  }
}

async function fetchAllPackages(): Promise<Package[]> {
  const data = await fetchWithTimeout<PackageApiResponse>(
    `${API_URL}/app/packages?limit=1000`,
    'packages'
  );
  return data?.packages ?? [];
}

async function fetchAllSkills(): Promise<Skill[]> {
  const data = await fetchWithTimeout<SkillApiResponse>(
    `${API_URL}/v1/skills/search?limit=1000`,
    'skills'
  );
  return data?.skills ?? [];
}

function generateSitemap(packages: Package[], skills: Skill[]): string {
  const today = new Date().toISOString().split('T')[0];

  // Static pages - must match actual routes in App.tsx
  const staticUrls = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/bundles', changefreq: 'daily', priority: '0.9' },
    { loc: '/skills', changefreq: 'daily', priority: '0.9' },
    { loc: '/security', changefreq: 'monthly', priority: '0.8' },
    { loc: '/security/controls', changefreq: 'monthly', priority: '0.7' },
    { loc: '/publish', changefreq: 'monthly', priority: '0.7' },
    { loc: '/publish/bundles', changefreq: 'monthly', priority: '0.7' },
    { loc: '/publish/skills', changefreq: 'monthly', priority: '0.7' },
    { loc: '/about', changefreq: 'monthly', priority: '0.6' },
    { loc: '/contact', changefreq: 'monthly', priority: '0.5' },
  ];

  // Package detail pages
  const packageUrls = packages.map((pkg) => ({
    loc: `/packages/${pkg.name}`,
    changefreq: 'weekly',
    priority: '0.7',
    lastmod: pkg.updated_at ? pkg.updated_at.split('T')[0] : today,
  }));

  // Skill detail pages
  const skillUrls = skills.map((skill) => ({
    loc: `/skills/${skill.name}`,
    changefreq: 'weekly',
    priority: '0.7',
    lastmod: skill.updated_at ? skill.updated_at.split('T')[0] : today,
  }));

  const allUrls = [...staticUrls, ...packageUrls, ...skillUrls];

  const urlEntries = allUrls
    .map(
      (url) => `  <url>
    <loc>${BASE_URL}${url.loc}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>${
        'lastmod' in url ? `\n    <lastmod>${url.lastmod}</lastmod>` : ''
      }
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

async function main() {
  console.log('Fetching data from API...');
  const [packages, skills] = await Promise.all([
    fetchAllPackages(),
    fetchAllSkills(),
  ]);
  console.log(`Found ${packages.length} packages, ${skills.length} skills`);

  console.log('Generating sitemap...');
  const sitemap = generateSitemap(packages, skills);

  // Write to file
  const fs = await import('fs');
  const path = await import('path');
  const outputPath = path.join(process.cwd(), 'public', 'sitemap.xml');

  const staticPageCount = 10;
  fs.writeFileSync(outputPath, sitemap, { encoding: 'utf-8', mode: 0o644 });
  console.log(`Sitemap written to ${outputPath}`);
  console.log(`Total URLs: ${staticPageCount + packages.length + skills.length}`);
}

main().catch(console.error);
