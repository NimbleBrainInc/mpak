import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { api, Package } from '../lib/api';
import { useSEO } from '../hooks/useSEO';
import {
  generateFAQSchema,
  generateWebSiteSchema,
  generateCLIToolSchema,
} from '../lib/schema';

// FAQ data for homepage
const faqs = [
  {
    question: 'What is mpak?',
    answer:
      'mpak is the secure, open-source package registry for MCP servers. Every bundle is scanned with 25 security controls across 5 domains, and trust scores are visible on every package. Think of it as a purpose-built registry for the MCP ecosystem, with security at its core.',
  },
  {
    question: 'What are Bundles?',
    answer:
      'Bundles are pre-packaged MCP servers that give your AI new capabilities: database access, API integrations, file operations. They contain everything needed to run: binaries, configs, and metadata. Works across macOS, Linux, and Windows.',
  },
  {
    question: 'What are Skills?',
    answer:
      'Skills are markdown instructions that teach your AI new behaviors and domain expertise: code review patterns, writing styles, specialized knowledge. They follow the Agent Skills specification and work across AI platforms.',
  },
  {
    question: 'How is mpak different from the MCP Registry?',
    answer:
      'The MCP Registry is a metaregistry that aggregates server listings from multiple sources. mpak is a package registry: it hosts the actual bundles, scans them for security, computes trust scores, and serves them to the CLI. The MCP Registry can point to mpak as a source.',
  },
  {
    question: 'Is mpak open source?',
    answer:
      'Yes. The registry, CLI, SDK, scanner, and deploy tooling are all Apache 2.0 licensed. mpak.dev is one instance of the registry, but you can self-host your own with federation, policies, and audit logging.',
  },
  {
    question: 'How do I install a package?',
    answer:
      'First install the CLI: npm install -g @nimblebrain/mpak. Then for bundles: mpak bundle pull @scope/bundle-name. For skills: mpak skill install @scope/skill-name.',
  },
  {
    question: 'Is mpak free to use?',
    answer:
      'Yes, mpak is completely free for both users and publishers. The registry, CLI tool, and all features are available at no cost.',
  },
  {
    question: 'How do I publish a package?',
    answer:
      'Add a manifest.json and the mcpb-pack GitHub Action to your repo. When you create a release, the action builds, scans, and publishes automatically. Visit /publish for the full guide.',
  },
];

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('search');
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);
  const [heroSearch, setHeroSearch] = useState('');
  const navigate = useNavigate();

  // SEO for homepage
  useSEO({
    title: 'mpak - Secure MCP Server & Skills Registry | Open Source',
    description:
      'Open-source package registry for MCP servers. Every bundle scanned with 25 security controls. Trust scores on every package.',
    canonical: 'https://www.mpak.dev/',
    keywords: [
      'ai',
      'package manager',
      'mcp',
      'agent skills',
      'bundles',
      'ai tools',
      'model context protocol',
      'security',
      'open source',
      'supply chain',
      'mcpb',
      'trust score',
    ],
    schema: [generateWebSiteSchema(), generateCLIToolSchema(), generateFAQSchema(faqs)],
  });

  useEffect(() => {
    if (searchQuery) {
      loadPackages();
    }
  }, [searchQuery]);

  async function loadPackages() {
    try {
      setLoading(true);
      const result = await api.searchPackages({
        q: searchQuery || undefined,
        limit: 12,
      });
      setPackages(result.packages);
    } catch (err) {
      console.error('Failed to load packages:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleHeroSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroSearch.trim()) {
      navigate(`/?search=${encodeURIComponent(heroSearch)}`);
    }
  };

  // If there's a search query, show search results instead of landing page
  if (searchQuery) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold text-mpak-gray-900 mb-6">
          Search results for "{searchQuery}"
        </h2>
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-gold-400"></div>
          </div>
        ) : packages.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {packages.map((pkg) => (
              <Link
                key={pkg.name}
                to={`/packages/${pkg.name}`}
                className="workshop-card workshop-card-gold block p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-mpak-gray-900">
                    {pkg.display_name || pkg.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    {pkg.claimable && (
                      <span className="text-xs bg-terminal-warning/15 text-terminal-warning px-2 py-1 rounded" title="Unclaimed - Click to claim">
                        Unclaimed
                      </span>
                    )}
                    {pkg.claimed && (
                      <span className="text-xs bg-terminal-success/15 text-terminal-success px-2 py-1 rounded" title="Claimed">
                        Claimed
                      </span>
                    )}
                    {pkg.verified && (
                      <span className="text-accent-gold-400" title="Verified">
                        Verified
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-mpak-gray-600 mb-4 line-clamp-2">
                  {pkg.description || 'No description'}
                </p>
                <div className="flex items-center justify-between text-sm text-mpak-gray-500 mb-3">
                  <span className="font-mono text-xs bg-surface px-2 py-1 rounded">
                    {pkg.name}
                  </span>
                  <span className="text-mpak-gray-400">{pkg.downloads} downloads</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="workshop-badge workshop-badge-gold">
                    {pkg.server_type}
                  </span>
                  <span className="text-xs text-mpak-gray-500">v{pkg.latest_version}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-mpak-gray-600">No packages found</p>
          </div>
        )}
      </div>
    );
  }

  // Landing page - Security-first design
  return (
    <div className="min-h-[calc(100vh-80px)]">
      {/* Hero Section */}
      <section aria-label="Hero" className="relative px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          {/* Minimal branding */}
          <div className="mb-8">
            <span className="inline-block font-mono text-sm text-mpak-gray-500 tracking-wider mb-4">
              OPEN SOURCE · SECURE · MCP-NATIVE
            </span>
            <h1 className="text-4xl sm:text-5xl font-bold text-mpak-gray-900 tracking-tight">
              The <span className="text-accent-gold-400">secure registry</span> for MCP servers and skills.
            </h1>
            <p className="mt-4 text-lg text-mpak-gray-600">
              Every bundle scanned. Every trust score public. Open source from day one.
            </p>
          </div>

          {/* Primary Search Box */}
          <form onSubmit={handleHeroSearch} className="mb-6">
            <div className="relative max-w-xl mx-auto">
              <input
                type="text"
                placeholder="Search packages..."
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                className="workshop-input w-full px-5 py-4 pl-12 text-lg rounded-xl border-2"
                autoFocus
              />
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-mpak-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-accent-gold-400 text-mpak-dark font-medium rounded-lg hover:bg-accent-gold-500 transition-colors"
              >
                Search
              </button>
            </div>
          </form>

          {/* Quick actions */}
          <p className="text-mpak-gray-500 text-sm">
            <Link to="/bundles" className="text-accent-gold-400 hover:text-accent-gold-300 font-medium">Browse bundles</Link>
            {' · '}
            <Link to="/skills" className="text-accent-purple-400 hover:text-accent-purple-300 font-medium">Browse skills</Link>
            {' · '}
            <Link to="/publish" className="text-mpak-gray-600 hover:text-mpak-gray-800 font-medium">Publish</Link>
          </p>
        </div>
      </section>

      {/* Terminal Demo */}
      <section aria-label="Terminal demo" className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-3xl mx-auto">
          <div className="bg-mpak-dark rounded-xl overflow-hidden shadow-2xl border border-white/[0.08]">
            <div className="bg-surface-raised px-4 py-3 flex items-center gap-2">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
              </div>
              <div className="flex-1 text-center text-sm text-mpak-gray-400 font-mono">
                terminal
              </div>
            </div>
            <div className="p-5 font-mono text-sm leading-relaxed">
              {/* Search with trust scores */}
              <div className="flex items-start mb-1">
                <span className="text-accent-cyan mr-3 select-none">$</span>
                <span className="text-mpak-gray-800">mpak search postgres</span>
              </div>
              <div className="ml-6 text-xs mb-4">
                <div className="flex gap-x-3 text-mpak-gray-400 mb-1 border-b border-white/[0.08] pb-1">
                  <span className="w-48">NAME</span>
                  <span className="w-14">VERSION</span>
                  <span className="w-10">TRUST</span>
                  <span className="hidden sm:inline">DESCRIPTION</span>
                </div>
                <div className="flex gap-x-3 text-mpak-gray-500">
                  <span className="text-mpak-gray-700 w-48">@mcp/server-postgres</span>
                  <span className="w-14">v0.6.2</span>
                  <span className="w-10 text-terminal-success font-semibold">L3</span>
                  <span className="text-mpak-gray-400 hidden sm:inline">PostgreSQL database access</span>
                </div>
                <div className="flex gap-x-3 text-mpak-gray-500">
                  <span className="text-mpak-gray-700 w-48">@community/pg-admin</span>
                  <span className="w-14">v1.2.0</span>
                  <span className="w-10 text-accent-gold-400 font-semibold">L2</span>
                  <span className="text-mpak-gray-400 hidden sm:inline">PostgreSQL admin tools</span>
                </div>
              </div>

              {/* Install with trust summary */}
              <div className="flex items-start mb-1">
                <span className="text-accent-cyan mr-3 select-none">$</span>
                <span className="text-mpak-gray-800">mpak install @mcp/server-postgres</span>
              </div>
              <div className="ml-6 text-xs mb-1 space-y-1">
                <div className="text-mpak-gray-500">Trust: <span className="text-terminal-success font-semibold">L3 Verified</span> (92/100)</div>
                <div className="text-terminal-success">✓ Signed provenance</div>
                <div className="text-terminal-success">✓ No dangerous permissions</div>
                <div className="text-terminal-success">✓ Dependencies vendored</div>
                <div className="text-terminal-success mt-1">Installing @mcp/server-postgres@0.6.2... done</div>
              </div>

              {/* Cursor */}
              <div className="flex items-start mt-4">
                <span className="text-accent-cyan mr-3 select-none">$</span>
                <span className="inline-block w-2 h-5 bg-accent-gold-400 animate-cursor-blink"></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three Pillars */}
      <section aria-label="Security features" className="px-4 sm:px-6 lg:px-8 py-16 border-y border-white/[0.08]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-mpak-gray-900 mb-8 text-center">
            Built for MCP security
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {/* MCPB Format */}
            <div className="workshop-card workshop-card-gold p-6">
              <div className="w-10 h-10 bg-accent-gold-glow rounded-lg flex items-center justify-center border border-accent-gold-border mb-4">
                <svg className="w-5 h-5 text-accent-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="font-semibold text-mpak-gray-900 mb-2">MCPB Format</h3>
              <p className="text-sm text-mpak-gray-600">
                One standardized package format for all MCP servers. Python, Node, or binary, all installed the same way.
              </p>
            </div>

            {/* MTF Security */}
            <div className="workshop-card workshop-card-gold p-6">
              <div className="w-10 h-10 bg-accent-gold-glow rounded-lg flex items-center justify-center border border-accent-gold-border mb-4">
                <svg className="w-5 h-5 text-accent-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-semibold text-mpak-gray-900 mb-2">Built-in Security Scans</h3>
              <p className="text-sm text-mpak-gray-600 mb-3">
                25 controls, 5 domains. Trust score on every publish. L1 through L4 certification.
              </p>
              <Link to="/security" className="text-sm text-accent-gold-400 hover:text-accent-gold-300 font-medium">
                Learn about certification →
              </Link>
            </div>

            {/* Open Source */}
            <div className="workshop-card workshop-card-gold p-6">
              <div className="w-10 h-10 bg-accent-gold-glow rounded-lg flex items-center justify-center border border-accent-gold-border mb-4">
                <svg className="w-5 h-5 text-accent-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-mpak-gray-900 mb-2">Open Source Registry</h3>
              <p className="text-sm text-mpak-gray-600">
                Entire stack is Apache 2.0. Self-hostable with federation, policies, and audit logging.
              </p>
            </div>
          </div>
          <p className="text-sm text-mpak-gray-500 mt-8 text-center">
            Want the full security architecture?{' '}
            <a
              href="/mpak-whitepaper.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-gold-400 hover:text-accent-gold-300 font-medium"
            >
              Read the whitepaper →
            </a>
          </p>
        </div>
      </section>

      {/* Comparison Table */}
      <section aria-label="Comparison with other registries" className="px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-mpak-gray-900 mb-8 text-center">
            Why not npm, PyPI, or Docker Hub?
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="text-left py-3 pr-4 font-medium text-mpak-gray-500 w-1/3"></th>
                  <th className="text-left py-3 pr-4 font-medium text-mpak-gray-500">General-purpose registries</th>
                  <th className="text-left py-3 font-medium text-accent-gold-400">mpak</th>
                </tr>
              </thead>
              <tbody className="text-mpak-gray-600">
                <tr className="border-b border-white/[0.08]">
                  <td className="py-3 pr-4 font-medium text-mpak-gray-800">Packaging</td>
                  <td className="py-3 pr-4">Language-specific (npm, pip, Docker)</td>
                  <td className="py-3 bg-accent-gold-400/5 px-3 rounded-l">One format (MCPB) for all runtimes</td>
                </tr>
                <tr className="border-b border-white/[0.08]">
                  <td className="py-3 pr-4 font-medium text-mpak-gray-800">Install experience</td>
                  <td className="py-3 pr-4">Requires runtime, deps, config</td>
                  <td className="py-3 bg-accent-gold-400/5 px-3">Single command, zero deps</td>
                </tr>
                <tr className="border-b border-white/[0.08]">
                  <td className="py-3 pr-4 font-medium text-mpak-gray-800">Security scanning</td>
                  <td className="py-3 pr-4">Generic CVE checks</td>
                  <td className="py-3 bg-accent-gold-400/5 px-3">MCP-specific: 25 controls, 5 domains</td>
                </tr>
                <tr className="border-b border-white/[0.08]">
                  <td className="py-3 pr-4 font-medium text-mpak-gray-800">Trust visibility</td>
                  <td className="py-3 pr-4">None or hidden</td>
                  <td className="py-3 bg-accent-gold-400/5 px-3">Public trust score on every package</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 font-medium text-mpak-gray-800">Enterprise governance</td>
                  <td className="py-3 pr-4">Limited or paid add-on</td>
                  <td className="py-3 bg-accent-gold-400/5 px-3 rounded-r">Self-hostable, federation, audit logs</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Extend Your AI */}
      <section aria-label="Package types" className="px-4 sm:px-6 lg:px-8 py-16 border-y border-white/[0.08]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-mpak-gray-900 mb-8 text-center">
            Extend your AI
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Bundles */}
            <div className="workshop-card workshop-card-gold p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-accent-gold-glow rounded-lg flex items-center justify-center border border-accent-gold-border">
                  <svg className="w-5 h-5 text-accent-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-mpak-gray-900">Bundles</h3>
                  <p className="text-xs text-mpak-gray-500 uppercase tracking-wide">Capabilities</p>
                </div>
              </div>
              <p className="text-sm text-mpak-gray-600 mb-4">
                Pre-built servers that give your AI new abilities. Connect to databases, call APIs, access file systems. Every bundle scanned with 25 security controls.
              </p>
              <ul className="text-sm text-mpak-gray-500 space-y-1 mb-5">
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-accent-gold-400 rounded-full"></span>
                  Database access
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-accent-gold-400 rounded-full"></span>
                  API integrations
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-accent-gold-400 rounded-full"></span>
                  File operations
                </li>
              </ul>
              <div className="flex items-center justify-between">
                <code className="text-xs bg-surface px-2 py-1 rounded text-mpak-gray-600 font-mono">mpak bundle pull [package]</code>
                <Link to="/bundles" className="text-sm text-accent-gold-400 hover:text-accent-gold-300 font-medium">
                  Browse bundles →
                </Link>
              </div>
            </div>

            {/* Skills */}
            <div className="workshop-card workshop-card-purple p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-accent-purple-glow rounded-lg flex items-center justify-center border border-accent-purple-border">
                  <svg className="w-5 h-5 text-accent-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-mpak-gray-900">Skills</h3>
                  <p className="text-xs text-mpak-gray-500 uppercase tracking-wide">Expertise</p>
                </div>
              </div>
              <p className="text-sm text-mpak-gray-600 mb-4">
                Instructions that teach your AI new behaviors and domain knowledge. Shape how it thinks and responds.
              </p>
              <ul className="text-sm text-mpak-gray-500 space-y-1 mb-5">
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-accent-purple-400 rounded-full"></span>
                  Code review patterns
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-accent-purple-400 rounded-full"></span>
                  Writing styles
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-accent-purple-400 rounded-full"></span>
                  Domain expertise
                </li>
              </ul>
              <div className="flex items-center justify-between">
                <code className="text-xs bg-surface px-2 py-1 rounded text-mpak-gray-600 font-mono">mpak skill install @org/skill</code>
                <Link to="/skills" className="text-sm text-accent-purple-400 hover:text-accent-purple-300 font-medium">
                  Browse skills →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Publish CTA */}
      <section aria-label="Publish to mpak" className="px-4 sm:px-6 lg:px-8 py-12 bg-surface-raised border-y border-white/[0.08]">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-mpak-gray-900 mb-1">Built something for AI?</h3>
            <p className="text-mpak-gray-500 text-sm">
              Publish bundles or skills to mpak. Security scanning, verified provenance, one-command installs.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
            <Link
              to="/publish/bundles"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-gold-400 text-mpak-dark font-medium rounded-lg hover:bg-accent-gold-500 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)] transition-all"
            >
              Publish a bundle →
            </Link>
            <Link
              to="/publish/skills"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-purple-400 text-white font-medium rounded-lg hover:bg-accent-purple-400/90 transition-all"
            >
              Publish a skill →
            </Link>
          </div>
        </div>
      </section>

      {/* Install Section */}
      <section id="install" aria-label="Install the CLI" className="px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-mpak-gray-900 mb-6">
            Install the CLI
          </h2>
          <div className="bg-surface text-mpak-gray-800 p-4 rounded-xl font-mono text-sm relative group border border-white/[0.08]">
            <code>npm install -g @nimblebrain/mpak</code>
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-mpak-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
              onClick={() => navigator.clipboard.writeText('npm install -g @nimblebrain/mpak')}
              title="Copy to clipboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          <p className="text-mpak-gray-500 text-sm mt-4">
            Then run <code className="bg-surface px-2 py-1 rounded text-mpak-gray-600 font-mono">mpak search</code> to get started
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section aria-label="Frequently asked questions" className="px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-mpak-gray-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details
                key={index}
                className="group workshop-card overflow-hidden"
              >
                <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-surface-overlay transition-colors">
                  <h3 className="font-semibold text-mpak-gray-900 pr-4">
                    {faq.question}
                  </h3>
                  <svg
                    className="w-5 h-5 text-mpak-gray-400 flex-shrink-0 transition-transform group-open:rotate-180"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </summary>
                <div className="px-5 pb-5 text-mpak-gray-600">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
