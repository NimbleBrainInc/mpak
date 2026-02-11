import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, Package } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import RuntimeIcon from '../components/RuntimeIcon';
import Breadcrumbs from '../components/Breadcrumbs';

// Category metadata for SEO
const categoryMeta: Record<string, { title: string; description: string; keywords: string[] }> = {
  python: {
    title: 'Python MCP Servers',
    description:
      'Browse Python-based MCP servers. FastMCP, Flask, and pure Python implementations for Claude and AI assistants.',
    keywords: ['python mcp', 'fastmcp', 'python ai tools', 'python claude server'],
  },
  node: {
    title: 'Node.js MCP Servers',
    description:
      'Discover Node.js MCP servers for Claude. TypeScript and JavaScript implementations with npm package support.',
    keywords: ['nodejs mcp', 'typescript mcp', 'javascript mcp server', 'npm mcp'],
  },
  binary: {
    title: 'Binary MCP Servers',
    description:
      'Pre-compiled binary MCP servers. Native executables for maximum performance with no runtime dependencies.',
    keywords: ['binary mcp', 'native mcp server', 'compiled mcp', 'go mcp', 'rust mcp'],
  },
};

// Normalize server type to category slug
function getCategory(serverType: string): string {
  const type = serverType.toLowerCase();
  if (type.includes('python') || type === 'python') return 'python';
  if (type.includes('node') || type === 'nodejs' || type === 'typescript') return 'node';
  if (type === 'binary' || type === 'go' || type === 'rust') return 'binary';
  return type;
}

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const meta = category && categoryMeta[category]
    ? categoryMeta[category]
    : {
        title: `${category} MCP Servers`,
        description: `Browse ${category} MCP servers on mpak. Find and install packages for Claude and AI assistants.`,
        keywords: [`${category} mcp`, 'mcp server', 'model context protocol'],
      };

  useSEO({
    title: meta.title,
    description: meta.description,
    canonical: `https://www.mpak.dev/category/${category}`,
    keywords: meta.keywords,
  });

  useEffect(() => {
    loadPackages();
  }, [category]);

  async function loadPackages() {
    try {
      setLoading(true);
      setError(null);
      const result = await api.searchPackages({
        limit: 100,
        sort: 'downloads',
      });
      // Filter packages by category
      const filtered = result.packages.filter(
        (pkg) => getCategory(pkg.server_type) === category
      );
      setPackages(filtered);
    } catch (err) {
      console.error('Failed to load packages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-mpak-gray-900 mb-2">{meta.title}</h1>
          <p className="text-mpak-gray-600">Loading packages...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-surface-raised rounded-lg p-6 border border-white/[0.08]">
              <div className="h-6 workshop-skeleton rounded mb-3"></div>
              <div className="h-12 workshop-skeleton rounded mb-4"></div>
              <div className="h-8 workshop-skeleton rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-terminal-error/10 border border-terminal-error/20 rounded-lg p-6">
          <p className="text-terminal-error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Bundles', href: '/bundles' },
          { label: meta.title },
        ]}
      />

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-mpak-gray-900 mb-2">{meta.title}</h1>
        <p className="text-mpak-gray-600">{meta.description}</p>
        <p className="text-sm text-mpak-gray-500 mt-2">
          {packages.length} {packages.length === 1 ? 'package' : 'packages'} available
        </p>
      </div>

      {/* Category navigation */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {Object.entries(categoryMeta).map(([slug, catMeta]) => (
          <Link
            key={slug}
            to={`/category/${slug}`}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              category === slug
                ? 'bg-accent-gold-400 text-mpak-dark'
                : 'bg-surface-raised text-mpak-gray-600 hover:bg-surface-overlay border border-white/[0.08]'
            }`}
          >
            {catMeta.title.replace(' MCP Servers', '')}
          </Link>
        ))}
        <Link
          to="/bundles"
          className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-raised text-mpak-gray-600 hover:bg-surface-overlay border border-white/[0.08]"
        >
          All Packages
        </Link>
      </div>

      {/* Packages Grid */}
      {packages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {packages.map((pkg) => (
            <Link
              key={pkg.name}
              to={`/packages/${pkg.name}`}
              className="workshop-card workshop-card-gold block p-6"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-semibold text-mpak-gray-900 line-clamp-1">
                  {pkg.display_name || pkg.name}
                </h3>
                {pkg.verified && (
                  <span className="text-accent-gold-400 flex-shrink-0 ml-2" title="Verified">
                    ✓
                  </span>
                )}
              </div>

              {pkg.author?.name && (
                <div className="text-xs text-mpak-gray-500 mb-3">by {pkg.author.name}</div>
              )}

              <p className="text-sm text-mpak-gray-600 mb-4 line-clamp-2 min-h-[2.5rem]">
                {pkg.description || 'No description'}
              </p>

              <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-white/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="workshop-badge workshop-badge-gold inline-flex items-center gap-1.5">
                    <RuntimeIcon runtime={pkg.server_type} className="w-4 h-4" />
                    {pkg.server_type}
                  </span>
                  <span className="text-xs text-mpak-gray-500 font-medium">v{pkg.latest_version}</span>
                </div>
                {pkg.github?.stars != null && (
                  <span className="text-mpak-gray-600 flex items-center gap-1 text-xs font-medium">
                    <svg className="w-4 h-4 text-accent-gold-400 fill-current" viewBox="0 0 24 24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    {pkg.github.stars.toLocaleString()}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 workshop-card">
          <svg
            className="w-16 h-16 text-mpak-gray-400 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
          <h3 className="text-lg font-semibold text-mpak-gray-900 mb-2">No packages found</h3>
          <p className="text-mpak-gray-600 mb-4">No {category} packages are available yet.</p>
          <Link to="/bundles" className="text-accent-gold-400 hover:text-accent-gold-300 font-medium">
            Browse all packages
          </Link>
        </div>
      )}
    </div>
  );
}
