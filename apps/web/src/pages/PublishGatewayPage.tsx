import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useSEO } from '../hooks/useSEO';

export default function PublishGatewayPage() {
  useSEO({
    title: 'Publish to mpak',
    description:
      'Publish MCP server bundles to the mpak registry. Automatic security scanning, verified provenance, one-command installs.',
    canonical: 'https://www.mpak.dev/publish',
    keywords: ['publish mcp server', 'mcp package publishing', 'mcpb bundle', 'mcp distribution'],
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Publish' }]} />

      <h1 className="text-4xl font-bold text-mpak-gray-900 mb-4">Publish to mpak</h1>
      <p className="text-mpak-gray-600 mb-10 text-lg">
        Get your MCP server in front of developers.
      </p>

      <div className="max-w-xl">
        {/* Publish a Bundle */}
        <Link to="/publish/bundles" className="workshop-card workshop-card-gold p-6 block group">
          <div className="w-10 h-10 bg-accent-gold-glow rounded-lg flex items-center justify-center border border-accent-gold-border mb-4">
            <svg
              aria-hidden="true"
              className="w-5 h-5 text-accent-gold-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-2">Publish a Bundle</h2>
          <p className="text-sm text-mpak-gray-600 mb-4">
            Package your MCP server as an MCPB bundle. Automatic security scanning with 25 controls,
            trust scores, verified provenance, and one-command installs for your users.
          </p>
          <span className="text-sm text-accent-gold-400 group-hover:text-accent-gold-300 font-medium inline-flex items-center gap-1">
            Get started
            <span aria-hidden="true">→</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
