import { Link } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';
import Breadcrumbs from '../components/Breadcrumbs';

export default function PublishGatewayPage() {
  useSEO({
    title: 'Publish to mpak',
    description:
      'Publish MCP server bundles and agent skills to the mpak registry. Automatic security scanning, verified provenance, one-command installs.',
    canonical: 'https://www.mpak.dev/publish',
    keywords: [
      'publish mcp server',
      'mcp package publishing',
      'mcpb bundle',
      'agent skills',
      'mcp distribution',
    ],
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Publish' },
        ]}
      />

      <h1 className="text-4xl font-bold text-mpak-gray-900 mb-4">Publish to mpak</h1>
      <p className="text-mpak-gray-600 mb-10 text-lg">
        Get your work in front of developers. Choose what you want to publish.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Publish a Bundle */}
        <Link
          to="/publish/bundles"
          className="workshop-card workshop-card-gold p-6 block group"
        >
          <div className="w-10 h-10 bg-accent-gold-glow rounded-lg flex items-center justify-center border border-accent-gold-border mb-4">
            <svg className="w-5 h-5 text-accent-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-2">Publish a Bundle</h2>
          <p className="text-sm text-mpak-gray-600 mb-4">
            Package your MCP server as an MCPB bundle. Automatic security scanning with 25 controls, trust scores, verified provenance, and one-command installs for your users.
          </p>
          <span className="text-sm text-accent-gold-400 group-hover:text-accent-gold-300 font-medium inline-flex items-center gap-1">
            Get started
            <span aria-hidden="true">→</span>
          </span>
        </Link>

        {/* Publish a Skill */}
        <Link
          to="/publish/skills"
          className="workshop-card workshop-card-purple p-6 block group"
        >
          <div className="w-10 h-10 bg-accent-purple-glow rounded-lg flex items-center justify-center border border-accent-purple-border mb-4">
            <svg className="w-5 h-5 text-accent-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-mpak-gray-900 mb-2">Publish a Skill</h2>
          <p className="text-sm text-mpak-gray-600 mb-4">
            Share agent skills that teach AI new behaviors. Write a SKILL.md, add the GitHub Action, and your skill is discoverable and installable across platforms.
          </p>
          <span className="text-sm text-accent-purple-400 group-hover:text-accent-purple-300 font-medium inline-flex items-center gap-1">
            Get started
            <span aria-hidden="true">→</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
