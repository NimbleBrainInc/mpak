import { Link } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';
import { generateOrganizationSchema, generateBreadcrumbSchema } from '../lib/schema';
import Breadcrumbs from '../components/Breadcrumbs';
import { siteConfig } from '../lib/siteConfig';

export default function AboutPage() {
  useSEO({
    title: 'About mpak',
    description:
      'mpak is the secure, open-source package registry for MCP servers and agent skills.',
    canonical: 'https://www.mpak.dev/about',
    keywords: [
      'about mpak',
      'ai package manager',
      'mcp bundles',
      'agent skills',
      'nimblebrain',
    ],
    schema: [
      generateOrganizationSchema(),
      generateBreadcrumbSchema([
        { name: 'Home', url: 'https://www.mpak.dev/' },
        { name: 'About', url: 'https://www.mpak.dev/about' },
      ]),
    ],
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'About' },
        ]}
      />

      <h1 className="text-4xl font-bold text-mpak-gray-900 mb-8">About mpak</h1>

      {/* The Problem */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-mpak-gray-900 mb-4">The Problem</h2>
        <p className="text-mpak-gray-600 mb-4">
          MCP servers have privileged access to AI agent execution environments. They can read files, execute code, call APIs, and access databases. Yet today, installing an MCP server means downloading unvetted code from scattered sources with no security scanning, no trust signals, and no standardized packaging.
        </p>
        <p className="text-mpak-gray-600 mb-4">
          General-purpose registries like npm and PyPI were not designed for this threat model. They don't scan for MCP-specific risks, don't surface trust scores, and don't provide the governance controls that enterprises need.
        </p>
        <p className="text-mpak-gray-600">
          The MCP ecosystem needs a purpose-built registry with security at its core.
        </p>
      </section>

      {/* Two Package Types */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-mpak-gray-900 mb-4">Two Package Types</h2>
        <div className="grid gap-4 sm:grid-cols-2 mb-4">
          <div className="bg-mpak-gray-50 border border-mpak-gray-200 rounded-xl p-5">
            <h3 className="font-semibold text-mpak-gray-900 mb-2">Bundles</h3>
            <p className="text-sm text-mpak-gray-600 mb-3">
              Pre-built MCP servers that give your AI new capabilities.
            </p>
            <ul className="text-sm text-mpak-gray-500 space-y-1">
              <li>• Database access, API integrations, file operations</li>
              <li>• Cross-platform: macOS, Linux, Windows</li>
              <li>• <code className="bg-mpak-gray-100 px-1 rounded">.mcpb</code> format by{' '}
                <a href="https://github.com/anthropics/mcpb" target="_blank" rel="noopener noreferrer" className="text-accent-gold-400 hover:text-accent-gold-500">Anthropic</a>
              </li>
            </ul>
          </div>
          <div className="bg-mpak-gray-50 border border-mpak-gray-200 rounded-xl p-5">
            <h3 className="font-semibold text-mpak-gray-900 mb-2">Skills</h3>
            <p className="text-sm text-mpak-gray-600 mb-3">
              Instructions that teach your AI new behaviors and expertise.
            </p>
            <ul className="text-sm text-mpak-gray-500 space-y-1">
              <li>• Code review patterns, writing styles, domain knowledge</li>
              <li>• Universal: works across AI platforms</li>
              <li>• <code className="bg-mpak-gray-100 px-1 rounded">.skill</code> format per{' '}
                <a href="https://agentskills.io" target="_blank" rel="noopener noreferrer" className="text-accent-gold-400 hover:text-accent-gold-500">Agent Skills spec</a>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* mpak Solution */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-mpak-gray-900 mb-4">mpak: The Secure Package Registry</h2>
        <p className="text-mpak-gray-600 mb-4">
          mpak is the central registry and CLI for AI packages. Discover, install, and manage bundles and skills with simple commands.
        </p>
        <div className="bg-mpak-gray-50 border border-mpak-gray-200 rounded-xl p-6 mb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold text-mpak-gray-900 mb-2">For Users</h3>
              <ul className="text-sm text-mpak-gray-600 space-y-1">
                <li>Search bundles and skills in one place</li>
                <li>One command to install</li>
                <li>Automatic platform detection</li>
                <li>Version management</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-mpak-gray-900 mb-2">For Publishers</h3>
              <ul className="text-sm text-mpak-gray-600 space-y-1">
                <li>Central registry for distribution</li>
                <li>GitHub Actions for CI/CD</li>
                <li>Provenance and verification</li>
                <li>Download analytics</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Built by NimbleBrain */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-mpak-gray-900 mb-4">Built by {siteConfig.operator.shortName}</h2>
        <p className="text-mpak-gray-600">
          mpak is built and maintained by{' '}
          <a
            href={siteConfig.operator.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-gold-400 hover:text-accent-gold-500"
          >
            {siteConfig.operator.shortName}
          </a>
          , a company focused on making AI tools more accessible and easier to deploy.
        </p>
      </section>

      {/* CTA */}
      <section className="bg-accent-gold-glow border border-accent-gold-border rounded-xl p-6 text-center">
        <h3 className="font-semibold text-mpak-gray-900 mb-2">Ready to get started?</h3>
        <p className="text-mpak-gray-600 text-sm mb-4">
          Install the CLI and start discovering packages for your AI.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/bundles"
            className="px-4 py-2 bg-accent-gold-400 text-mpak-dark font-medium rounded-lg hover:bg-accent-gold-500 transition-colors"
          >
            Browse Bundles
          </Link>
          <Link
            to="/skills"
            className="px-4 py-2 bg-accent-purple text-white font-medium rounded-lg hover:bg-accent-purple/90 transition-colors"
          >
            Browse Skills
          </Link>
          <Link
            to="/publish"
            className="px-4 py-2 bg-surface-raised border border-mpak-gray-200 text-mpak-gray-700 font-medium rounded-lg hover:border-accent-gold-400 transition-colors"
          >
            Publish a package
          </Link>
        </div>
      </section>
    </div>
  );
}
