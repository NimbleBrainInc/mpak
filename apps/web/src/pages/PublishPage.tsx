import { useSEO } from '../hooks/useSEO';
import Breadcrumbs from '../components/Breadcrumbs';
import { siteConfig } from '../lib/siteConfig';

export default function PublishPage() {
  useSEO({
    title: 'Publish to mpak',
    description:
      'Get your MCP server in front of developers. Automatic security scoring, verified provenance, one-command installs.',
    canonical: 'https://www.mpak.dev/publish',
    keywords: [
      'publish mcp server',
      'mcp package publishing',
      'mcpb bundle',
      'github actions mcp',
      'mcp distribution',
      'security scoring',
      'trust framework',
    ],
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Publish' },
        ]}
      />

      {/* Hero */}
      <h1 className="text-4xl font-bold text-mpak-gray-900 mb-4">Publish to mpak</h1>
      <p className="text-mpak-gray-600 mb-12 text-lg">
        Get your MCP server in front of developers. Automatic security scoring, verified provenance, one-command installs.
      </p>

      {/* What you get - motivation first */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-mpak-gray-900 mb-4">What you get</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="workshop-card workshop-card-gold p-5">
            <h3 className="font-medium text-mpak-gray-900 mb-2">Automatic Security Scanning</h3>
            <p className="text-sm text-mpak-gray-600">
              Every published bundle is scanned with the mpak Trust Framework. 25 controls across 5 domains. Your trust score is computed automatically and visible to all consumers.
            </p>
          </div>
          <div className="workshop-card workshop-card-gold p-5">
            <h3 className="font-medium text-mpak-gray-900 mb-2">Verified provenance</h3>
            <p className="text-sm text-mpak-gray-600">
              Bundles are signed with GitHub OIDC, so users know exactly where they came from.
            </p>
          </div>
          <div className="workshop-card workshop-card-gold p-5">
            <h3 className="font-medium text-mpak-gray-900 mb-2">Discoverable</h3>
            <p className="text-sm text-mpak-gray-600">
              Your server appears in mpak search and on the web registry with trust scores displayed.
            </p>
          </div>
          <div className="workshop-card workshop-card-gold p-5">
            <h3 className="font-medium text-mpak-gray-900 mb-2">One-command install</h3>
            <p className="text-sm text-mpak-gray-600">
              Users install with <code className="text-mpak-gray-800">mpak bundle pull @you/server</code>. No setup, no dependencies.
            </p>
          </div>
        </div>
      </section>

      {/* How it works - abbreviated */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-mpak-gray-900 mb-6">How it works</h2>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-accent-gold-400 text-mpak-dark rounded-full flex items-center justify-center font-bold text-sm">
              1
            </div>
            <div>
              <h3 className="text-lg font-medium text-mpak-gray-900 mb-1">Add a manifest.json</h3>
              <p className="text-mpak-gray-600 text-sm mb-2">
                Describe your server: name, version, entry point, and runtime. The manifest tells mpak how to package and run your server.
              </p>
              <a
                href={`${siteConfig.docsUrl}/bundles/manifest`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-gold-400 hover:text-accent-gold-300 font-medium"
              >
                Full manifest reference →
              </a>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-accent-gold-400 text-mpak-dark rounded-full flex items-center justify-center font-bold text-sm">
              2
            </div>
            <div>
              <h3 className="text-lg font-medium text-mpak-gray-900 mb-1">Add the GitHub Action</h3>
              <p className="text-mpak-gray-600 text-sm mb-2">
                The <code className="bg-mpak-gray-100 px-1.5 py-0.5 rounded text-mpak-gray-800">mcpb-pack</code> action builds your server into an MCPB bundle, attaches it to your release, and registers it with the registry.
              </p>
              <a
                href={`${siteConfig.docsUrl}/bundles/github-action`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-gold-400 hover:text-accent-gold-300 font-medium"
              >
                Action documentation →
              </a>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-accent-gold-400 text-mpak-dark rounded-full flex items-center justify-center font-bold text-sm">
              3
            </div>
            <div>
              <h3 className="text-lg font-medium text-mpak-gray-900 mb-1">Create a release</h3>
              <p className="text-mpak-gray-600 text-sm">
                Tag and push. The action builds, scans, scores, and publishes automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Terminal result */}
        <div className="mt-6 bg-mpak-dark rounded-xl overflow-hidden border border-white/[0.08]">
          <div className="bg-surface-raised px-4 py-2">
            <span className="text-sm text-mpak-gray-400 font-mono">terminal</span>
          </div>
          <div className="p-4 font-mono text-sm leading-relaxed">
            <div className="flex items-start mb-1">
              <span className="text-accent-cyan mr-3 select-none">$</span>
              <span className="text-mpak-gray-800">git tag v1.0.0 && git push --tags</span>
            </div>
            <div className="ml-6 text-mpak-gray-500 text-xs space-y-1">
              <div className="text-mpak-gray-400"># GitHub Action runs...</div>
              <div className="text-terminal-success">✓ Built server-postgres-1.0.0.mcpb</div>
              <div className="text-terminal-success">✓ MTF scan: L2 Standard (78/100)</div>
              <div className="text-terminal-success">✓ Published to mpak.dev</div>
            </div>
          </div>
        </div>
      </section>

      {/* Publishing Skills */}
      <section className="mb-12">
        <div className="workshop-card workshop-card-purple p-6">
          <h3 className="font-semibold text-mpak-gray-900 mb-2">Publishing Skills</h3>
          <p className="text-sm text-mpak-gray-600 mb-3">
            You can also publish Agent Skills to mpak. Skills are markdown instructions that teach AI new behaviors and domain expertise.
          </p>
          <a
            href={`${siteConfig.docsUrl}/skills/overview`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent-purple-400 hover:text-accent-purple-300 font-medium"
          >
            Skills publishing guide →
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-surface-raised border border-white/[0.08] rounded-xl p-6 text-center">
        <h3 className="font-semibold text-mpak-gray-900 mb-2">Ready to publish?</h3>
        <p className="text-mpak-gray-600 text-sm mb-4">
          The full guide covers manifest options, multi-platform builds, prereleases, and more.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={`${siteConfig.docsUrl}/bundles/publishing`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-accent-gold-400 text-mpak-dark font-medium rounded-lg hover:bg-accent-gold-500 transition-colors inline-flex items-center justify-center gap-2"
          >
            Read the full publishing guide
            <span aria-hidden="true">→</span>
          </a>
          <a
            href={`${siteConfig.github.org}/mcpb-pack`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-surface-raised border border-mpak-gray-200 text-mpak-gray-700 font-medium rounded-lg hover:border-accent-gold-400 transition-colors inline-flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            View mcpb-pack on GitHub
          </a>
        </div>
      </section>
    </div>
  );
}
