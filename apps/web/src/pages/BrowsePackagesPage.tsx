import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, Package } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import { generateBreadcrumbSchema, generateItemListSchema } from '../lib/schema';
import RuntimeIcon from '../components/RuntimeIcon';
import Breadcrumbs from '../components/Breadcrumbs';

const CERT_LEVELS: Record<number, { grade: string; name: string; bg: string }> = {
  1: { grade: 'L1', name: 'Basic', bg: 'bg-surface text-mpak-gray-600' },
  2: { grade: 'L2', name: 'Standard', bg: 'bg-accent-gold-400/15 text-accent-gold-400' },
  3: { grade: 'L3', name: 'Verified', bg: 'bg-terminal-success/15 text-terminal-success' },
  4: { grade: 'L4', name: 'Attested', bg: 'bg-accent-gold-400/15 text-accent-gold-400' },
};

export default function BrowsePackagesPage() {
  const queryClient = useQueryClient();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverType, setServerType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Dynamic description based on package count
  const packageCount = packages.length;
  const description = packageCount > 0
    ? `Browse ${packageCount}+ bundles that extend your AI. Filter by type, search by name. Install with mpak bundle pull.`
    : 'Explore bundles for database access, APIs, file systems, and more. Install any bundle instantly with mpak.';

  const schemas = [
    generateBreadcrumbSchema([
      { name: 'Home', url: 'https://www.mpak.dev/' },
      { name: 'Bundles', url: 'https://www.mpak.dev/bundles' },
    ]),
    ...(packages.length > 0
      ? [generateItemListSchema(
          packages.map((pkg) => ({
            name: pkg.display_name || pkg.name,
            url: `https://www.mpak.dev/packages/${pkg.name}`,
          })),
          'MCP Server Bundles',
        )]
      : []),
  ];

  useSEO({
    title: 'Browse Bundles',
    description,
    canonical: 'https://www.mpak.dev/bundles',
    keywords: [
      'mcp bundles',
      'ai packages',
      'model context protocol',
      'mcp servers',
      'ai tools',
    ],
    schema: schemas,
  });

  useEffect(() => {
    loadPackages();
  }, []);

  // Cache packages in React Query for instant navigation to detail pages
  useEffect(() => {
    if (packages.length > 0) {
      packages.forEach(pkg => {
        queryClient.setQueryData(['package', pkg.name], pkg);
      });
    }
  }, [packages, queryClient]);

  async function loadPackages() {
    try {
      setLoading(true);
      setError(null);
      const result = await api.searchPackages({
        limit: 100,
        sort: 'downloads',
      });
      setPackages(result.packages);
    } catch (err) {
      console.error('Failed to load packages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }

  // Filter packages based on selected filters
  const filteredPackages = packages.filter((pkg) => {
    // Filter by server type
    if (serverType !== 'all' && pkg.server_type !== serverType) {
      return false;
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesName = pkg.name.toLowerCase().includes(query);
      const matchesDisplayName = pkg.display_name?.toLowerCase().includes(query);
      const matchesDescription = pkg.description?.toLowerCase().includes(query);

      if (!matchesName && !matchesDisplayName && !matchesDescription) {
        return false;
      }
    }

    return true;
  });

  // Get unique server types for filter
  const serverTypes = Array.from(new Set(packages.map((pkg) => pkg.server_type)));

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="animate-pulse">
          <div className="h-4 workshop-skeleton rounded w-48 mb-6"></div>
          <div className="h-8 workshop-skeleton rounded w-64 mb-4"></div>
          <div className="h-4 workshop-skeleton rounded w-96 mb-8"></div>
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-terminal-error/10 border border-terminal-error/20 rounded-lg p-6">
          <p className="text-terminal-error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Breadcrumbs */}
      <div className="border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 [&>nav]:mb-0">
          <Breadcrumbs
            items={[
              { label: 'Explore', href: '/' },
              { label: 'Bundles' },
            ]}
          />
        </div>
      </div>

      {/* Header */}
      <div className="border-b border-white/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-accent-gold-glow rounded-lg flex items-center justify-center border border-accent-gold-border">
              <svg className="w-5 h-5 text-accent-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-mpak-gray-900">Browse Bundles</h1>
          </div>
          <p className="text-mpak-gray-600">
            MCP server bundles, scanned and scored for security
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

      {/* Filters */}
      <div className="bg-surface-raised rounded-lg border border-white/[0.08] p-6 mb-8">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <label htmlFor="search" className="block text-sm font-medium text-mpak-gray-600 mb-2">
              Search
            </label>
            <div className="relative">
              <input
                id="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bundles..."
                className="workshop-input w-full px-4 py-2 pl-10"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mpak-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Server Type Filter */}
          <div className="flex-1">
            <label htmlFor="serverType" className="block text-sm font-medium text-mpak-gray-600 mb-2">
              Server Type
            </label>
            <select
              id="serverType"
              value={serverType}
              onChange={(e) => setServerType(e.target.value)}
              className="workshop-select w-full px-4 py-2"
            >
              <option value="all">All Types</option>
              {serverTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Results count */}
          <div className="flex items-end">
            <div className="text-sm text-mpak-gray-500">
              {filteredPackages.length} {filteredPackages.length === 1 ? 'package' : 'packages'}
            </div>
          </div>
        </div>
      </div>

      {/* Packages Grid */}
      {filteredPackages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPackages.map((pkg) => {
            const cert = pkg.certification_level ? CERT_LEVELS[pkg.certification_level] : null;
            return (
            <Link
              key={pkg.name}
              to={`/packages/${pkg.name}`}
              className="workshop-card workshop-card-gold block p-5 flex flex-col"
            >
              {/* Header: name + trust badge */}
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <h3 className="text-[1.05rem] font-semibold text-mpak-gray-900 leading-snug">
                  {pkg.display_name || pkg.name.split('/')[1] || pkg.name}
                </h3>
                {cert && (
                  <span className={`shrink-0 inline-flex items-center gap-1 text-[0.65rem] font-bold px-1.5 py-0.5 rounded ${cert.bg}`} title={`MTF ${cert.grade} ${cert.name}`}>
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                    </svg>
                    {cert.grade}
                  </span>
                )}
              </div>

              {/* Scope */}
              <p className="text-[0.7rem] text-mpak-gray-400 font-mono mb-3">{pkg.name}</p>

              {/* Description */}
              <p className="text-sm text-mpak-gray-600 leading-relaxed line-clamp-2 min-h-[2.5rem] mb-4">
                {pkg.description || 'No description'}
              </p>

              {/* Footer: runtime + version + downloads in one line */}
              <div className="mt-auto flex items-center gap-2 text-[0.7rem] text-mpak-gray-500 pt-3 border-t border-white/[0.06]">
                <span className="inline-flex items-center gap-1">
                  <RuntimeIcon runtime={pkg.server_type} className="w-3.5 h-3.5" />
                  {pkg.server_type}
                </span>
                <span className="text-mpak-gray-300/30">|</span>
                <span>v{pkg.latest_version}</span>
                <span className="ml-auto inline-flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  {(pkg.downloads ?? 0).toLocaleString()}
                </span>
              </div>
            </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-16 workshop-card">
          <svg
            className="w-16 h-16 text-mpak-gray-300 mx-auto mb-4"
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
          <p className="text-mpak-gray-600">Try adjusting your filters</p>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
