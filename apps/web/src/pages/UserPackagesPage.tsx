import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { api, Package } from '../lib/api';

export default function UserPackagesPage() {
  const { isLoaded, isAuthenticated, getToken } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUserPackages();
  }, [isAuthenticated]);

  async function loadUserPackages() {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const result = await api.getMyPackages(token, {
        limit: 1000,
      });

      setPackages(result.packages);
    } catch (err) {
      console.error('Failed to load user packages:', err);
      setError(err instanceof Error ? err.message : 'Failed to load your packages');
    } finally {
      setLoading(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-raised rounded-lg border border-white/[0.08] p-6">
              <div className="h-6 bg-surface-overlay animate-pulse rounded mb-3 w-3/4"></div>
              <div className="h-4 bg-surface animate-pulse rounded mb-2 w-1/2"></div>
              <div className="h-12 bg-surface animate-pulse rounded mb-4"></div>
              <div className="flex gap-4">
                <div className="h-8 bg-surface animate-pulse rounded w-24"></div>
                <div className="h-8 bg-surface animate-pulse rounded w-24"></div>
                <div className="h-8 bg-surface animate-pulse rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <p className="text-mpak-gray-600">Please sign in to view your packages</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-mpak-gray-900 mb-2">
          My Packages
        </h1>
        <p className="text-mpak-gray-600">
          Manage and monitor your published MCP servers
        </p>
      </div>

      {/* Stats Bar */}
      <div className="bg-surface-raised rounded-lg border border-white/[0.08] p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="text-2xl font-bold text-accent-gold-400 mb-1">
              {packages.length}
            </div>
            <div className="text-sm text-mpak-gray-600">Published Packages</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-accent-gold-400 mb-1">
              {packages.reduce((sum, pkg) => sum + pkg.downloads, 0).toLocaleString()}
            </div>
            <div className="text-sm text-mpak-gray-600">Total Downloads</div>
          </div>
          <div>
            <Link
              to="/publish"
              className="inline-flex items-center justify-center px-6 py-3 bg-accent-gold-400 text-mpak-dark font-semibold rounded-lg hover:bg-accent-gold-500 transition-colors"
            >
              Publish New Package
            </Link>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="grid grid-cols-1 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-surface-raised rounded-lg border border-white/[0.08] p-6">
              <div className="h-6 bg-surface-overlay animate-pulse rounded mb-3 w-3/4"></div>
              <div className="h-4 bg-surface animate-pulse rounded mb-2 w-1/2"></div>
              <div className="h-12 bg-surface animate-pulse rounded mb-4"></div>
              <div className="flex gap-4">
                <div className="h-8 bg-surface animate-pulse rounded w-24"></div>
                <div className="h-8 bg-surface animate-pulse rounded w-24"></div>
                <div className="h-8 bg-surface animate-pulse rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-terminal-error/10 border border-terminal-error/20 rounded-lg p-6 mb-8">
          <p className="text-terminal-error">{error}</p>
        </div>
      )}

      {/* Packages List */}
      {!loading && !error && (
        <>
          {packages.length > 0 ? (
            <div className="grid grid-cols-1 gap-6">
              {packages.map((pkg) => (
                <div
                  key={pkg.name}
                  className="bg-surface-raised rounded-lg border border-white/[0.08] p-6 hover:border-accent-gold-400/50 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Link
                          to={`/packages/${pkg.name}`}
                          className="text-xl font-semibold text-mpak-gray-900 hover:text-accent-gold-400 transition-colors"
                        >
                          {pkg.display_name || pkg.name}
                        </Link>
                        {pkg.verified && (
                          <span className="text-accent-gold-400" title="Verified">
                            ✓
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-mono text-mpak-gray-500 mb-3">
                        {pkg.name}
                      </p>
                      <p className="text-mpak-gray-600 mb-4">
                        {pkg.description || 'No description provided'}
                      </p>
                    </div>
                  </div>

                  {/* Package Metadata */}
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-mpak-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-mpak-gray-600">
                        {pkg.downloads.toLocaleString()} downloads
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-mpak-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                      </svg>
                      <span className="text-mpak-gray-600">v{pkg.latest_version}</span>
                    </div>
                    <span className="px-3 py-1 bg-accent-gold-400/15 text-accent-gold-400 text-xs rounded-full">
                      {pkg.server_type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-white rounded-lg border border-mpak-gray-200">
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
              <h3 className="text-lg font-semibold text-mpak-gray-900 mb-2">
                No packages yet
              </h3>
              <p className="text-mpak-gray-600 mb-6">
                Get started by publishing your first MCP server package
              </p>
              <Link
                to="/publish"
                className="inline-flex items-center px-6 py-3 bg-accent-gold-400 text-mpak-dark font-semibold rounded-lg hover:bg-accent-gold-500 transition-colors"
              >
                Publish Your First Package
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
