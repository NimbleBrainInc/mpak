import { useSEO } from '../hooks/useSEO';
import { generateBreadcrumbSchema, generateHowToSchema } from '../lib/schema';
import Breadcrumbs from '../components/Breadcrumbs';
import { siteConfig } from '../lib/siteConfig';

export default function PublishSkillsPage() {
  useSEO({
    title: 'Publish Skills to mpak',
    description:
      'Publish agent skills to the mpak registry. Write a SKILL.md, add the GitHub Action, and your skill is discoverable across AI platforms.',
    canonical: 'https://www.mpak.dev/publish/skills',
    keywords: [
      'publish agent skill',
      'agent skills',
      'skill publishing',
      'claude code skills',
      'ai skills registry',
      'SKILL.md',
    ],
    schema: [
      generateBreadcrumbSchema([
        { name: 'Home', url: 'https://www.mpak.dev/' },
        { name: 'Publish', url: 'https://www.mpak.dev/publish' },
        { name: 'Skills', url: 'https://www.mpak.dev/publish/skills' },
      ]),
      generateHowToSchema(
        'How to Publish an Agent Skill to mpak',
        'Publish agent skills to the mpak registry so they are discoverable across AI platforms.',
        [
          { name: 'Write a SKILL.md', text: 'Create a SKILL.md file in your repository with frontmatter (name, version, description, triggers) and markdown instructions for the AI.' },
          { name: 'Add the GitHub Action', text: 'Add the skill-pack GitHub Action to your CI workflow to automatically package and publish skills on release.' },
          { name: 'Create a release', text: 'Create a GitHub release. The action packages the skill, validates the format, and publishes to the registry.' },
        ],
      ),
    ],
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Publish', href: '/publish' },
          { label: 'Skills' },
        ]}
      />

      {/* Hero */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-accent-purple-glow rounded-lg flex items-center justify-center border border-accent-purple-border">
          <svg className="w-5 h-5 text-accent-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-mpak-gray-900">Publish Skills</h1>
      </div>
      <p className="text-mpak-gray-600 mb-12 text-lg">
        Share your expertise with the AI community. Write a SKILL.md, and your skill is discoverable and installable across platforms.
      </p>

      {/* What you get */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-mpak-gray-900 mb-4">What you get</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="workshop-card workshop-card-purple p-5">
            <h3 className="font-medium text-mpak-gray-900 mb-2">Discoverable</h3>
            <p className="text-sm text-mpak-gray-600">
              Your skill appears in mpak search, browsable by category and tags. Developers find it when they need it.
            </p>
          </div>
          <div className="workshop-card workshop-card-purple p-5">
            <h3 className="font-medium text-mpak-gray-900 mb-2">Cross-platform</h3>
            <p className="text-sm text-mpak-gray-600">
              Skills follow the Agent Skills specification. They work across Claude Code, and any platform that supports the spec.
            </p>
          </div>
          <div className="workshop-card workshop-card-purple p-5">
            <h3 className="font-medium text-mpak-gray-900 mb-2">Versioned</h3>
            <p className="text-sm text-mpak-gray-600">
              Semantic versioning, prerelease support, and version history. Users can pin to specific versions or track latest.
            </p>
          </div>
          <div className="workshop-card workshop-card-purple p-5">
            <h3 className="font-medium text-mpak-gray-900 mb-2">One-command install</h3>
            <p className="text-sm text-mpak-gray-600">
              Users install with <code className="text-mpak-gray-800">mpak skill install @you/skill</code>. No manual copying, no configuration.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-mpak-gray-900 mb-6">How it works</h2>

        <div className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-accent-purple-400 text-white rounded-full flex items-center justify-center font-bold text-sm">
              1
            </div>
            <div>
              <h3 className="text-lg font-medium text-mpak-gray-900 mb-1">Write a SKILL.md</h3>
              <p className="text-mpak-gray-600 text-sm mb-2">
                Create a SKILL.md with YAML frontmatter (name, description, category, tags) and markdown instructions that teach the AI your expertise.
              </p>
              <a
                href={`${siteConfig.docsUrl}/skills/skill-md`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-purple-400 hover:text-accent-purple-300 font-medium"
              >
                SKILL.md reference →
              </a>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-accent-purple-400 text-white rounded-full flex items-center justify-center font-bold text-sm">
              2
            </div>
            <div>
              <h3 className="text-lg font-medium text-mpak-gray-900 mb-1">Add the GitHub Action</h3>
              <p className="text-mpak-gray-600 text-sm mb-2">
                The <code className="bg-mpak-gray-100 px-1.5 py-0.5 rounded text-mpak-gray-800">skill-pack</code> action discovers SKILL.md files in your repo, validates them, packages each into a <code className="bg-mpak-gray-100 px-1.5 py-0.5 rounded text-mpak-gray-800">.skill</code> bundle, and publishes to the registry.
              </p>
              <a
                href={`${siteConfig.docsUrl}/skills/github-action`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent-purple-400 hover:text-accent-purple-300 font-medium"
              >
                Action documentation →
              </a>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 bg-accent-purple-400 text-white rounded-full flex items-center justify-center font-bold text-sm">
              3
            </div>
            <div>
              <h3 className="text-lg font-medium text-mpak-gray-900 mb-1">Create a release</h3>
              <p className="text-mpak-gray-600 text-sm">
                Tag and push. The action discovers, validates, packages, and publishes automatically.
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
              <div className="text-terminal-success">✓ Found 2 skills</div>
              <div className="text-terminal-success">✓ Packed code-reviewer-1.0.0.skill</div>
              <div className="text-terminal-success">✓ Packed api-designer-1.0.0.skill</div>
              <div className="text-terminal-success">✓ Published to mpak.dev</div>
            </div>
          </div>
        </div>
      </section>

      {/* Monorepo note */}
      <section className="mb-12">
        <div className="workshop-card workshop-card-purple p-6">
          <h3 className="font-semibold text-mpak-gray-900 mb-2">Publishing multiple skills</h3>
          <p className="text-sm text-mpak-gray-600 mb-3">
            The skill-pack action automatically discovers all SKILL.md files in your repository. For independent versioning across many skills, use release-please with per-skill tags.
          </p>
          <a
            href={`${siteConfig.docsUrl}/skills/monorepo-guide`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent-purple-400 hover:text-accent-purple-300 font-medium"
          >
            Monorepo versioning guide →
          </a>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-surface-raised border border-white/[0.08] rounded-xl p-6 text-center">
        <h3 className="font-semibold text-mpak-gray-900 mb-2">Ready to publish?</h3>
        <p className="text-mpak-gray-600 text-sm mb-4">
          The full guide covers SKILL.md format, frontmatter fields, categories, triggers, and more.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={`${siteConfig.docsUrl}/skills/overview`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-accent-purple-400 text-white font-medium rounded-lg hover:bg-accent-purple-400/90 transition-colors inline-flex items-center justify-center gap-2"
          >
            Read the skills guide
            <span aria-hidden="true">→</span>
          </a>
          <a
            href={`${siteConfig.github.org}/skill-pack`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-surface-raised border border-mpak-gray-200 text-mpak-gray-700 font-medium rounded-lg hover:border-accent-purple-400 transition-colors inline-flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            View skill-pack on GitHub
          </a>
        </div>
      </section>
    </div>
  );
}
