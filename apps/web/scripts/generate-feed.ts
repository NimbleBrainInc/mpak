/**
 * RSS Feed Generator Script
 *
 * Generates an RSS feed (feed.xml) for recently published packages and skills.
 * Runs automatically via `npm run prebuild` before each build.
 *
 * Usage:
 *   npm run feed      # Run manually
 *   npm run build     # Runs automatically via prebuild hook
 *
 * Environment:
 *   VITE_API_URL - API endpoint (defaults to https://registry.mpak.dev)
 *   SKIP_FEED - Set to "true" to skip generation (useful in CI)
 */

// Skip if explicitly disabled
if (process.env.SKIP_FEED === 'true') {
  console.log('Feed generation skipped (SKIP_FEED=true)');
  process.exit(0);
}

const API_URL = process.env.VITE_API_URL || 'https://registry.mpak.dev';
const BASE_URL = 'https://www.mpak.dev';

interface Package {
  name: string;
  display_name?: string;
  description?: string;
  latest_version: string;
  updated_at?: string;
  published_at?: string;
}

interface PackageApiResponse {
  packages: Package[];
  total: number;
}

interface Skill {
  name: string;
  description?: string;
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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateFeed(packages: Package[], skills: Skill[]): string {
  const now = new Date().toUTCString();

  // Combine and sort by date, most recent first
  const items: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    category: string;
  }> = [];

  for (const pkg of packages) {
    items.push({
      title: `${pkg.display_name || pkg.name} v${pkg.latest_version}`,
      link: `${BASE_URL}/packages/${pkg.name}`,
      description: pkg.description || `${pkg.name} MCP server bundle`,
      pubDate: new Date(pkg.updated_at || pkg.published_at || Date.now()).toUTCString(),
      category: 'Bundles',
    });
  }

  for (const skill of skills) {
    items.push({
      title: skill.name,
      link: `${BASE_URL}/skills/${skill.name}`,
      description: skill.description || `${skill.name} agent skill`,
      pubDate: new Date(skill.updated_at || Date.now()).toUTCString(),
      category: 'Skills',
    });
  }

  // Sort by date descending, limit to 50 most recent
  items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  const recentItems = items.slice(0, 50);

  const itemEntries = recentItems
    .map(
      (item) => `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${item.link}</link>
      <description>${escapeXml(item.description)}</description>
      <pubDate>${item.pubDate}</pubDate>
      <category>${item.category}</category>
      <guid>${item.link}</guid>
    </item>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>mpak - New Packages</title>
    <link>${BASE_URL}</link>
    <description>Recently published MCP server bundles and agent skills on mpak.</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${itemEntries}
  </channel>
</rss>`;
}

async function main() {
  console.log('Generating RSS feed...');

  const [pkgData, skillData] = await Promise.all([
    fetchWithTimeout<PackageApiResponse>(`${API_URL}/app/packages?limit=50`, 'packages'),
    fetchWithTimeout<SkillApiResponse>(`${API_URL}/v1/skills/search?limit=50`, 'skills'),
  ]);

  const packages = pkgData?.packages ?? [];
  const skills = skillData?.skills ?? [];
  console.log(`Found ${packages.length} packages, ${skills.length} skills`);

  const feed = generateFeed(packages, skills);

  const fs = await import('fs');
  const path = await import('path');
  const outputPath = path.join(process.cwd(), 'public', 'feed.xml');

  fs.writeFileSync(outputPath, feed, { encoding: 'utf-8', mode: 0o644 });
  console.log(`RSS feed written to ${outputPath}`);
  console.log(`Total items: ${Math.min(packages.length + skills.length, 50)}`);
}

main().catch(console.error);
