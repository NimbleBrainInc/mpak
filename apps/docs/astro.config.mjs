// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.mpak.dev',
  integrations: [
    starlight({
      title: 'mpak',
      favicon: '/favicon.ico',
      customCss: ['./src/styles/custom.css'],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/NimbleBrainInc/mpak' },
        { icon: 'discord', label: 'Discord', href: 'https://nimblebrain.ai/discord' },
        { icon: 'x.com', label: 'X', href: 'https://x.com/nimblebraininc' },
      ],
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
          },
        },
      ],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'What is mpak?', slug: 'index' },
            { label: 'Quickstart', slug: 'quickstart' },
            { label: 'Why a Registry?', slug: 'why-a-registry' },
          ],
        },
        {
          label: 'MCP Bundles',
          items: [
            { label: 'What is an MCP Bundle?', slug: 'bundles/what-is-mcpb' },
            { label: 'Migrate Your MCP Server', slug: 'bundles/migrating' },
            { label: 'Publishing', slug: 'bundles/publishing' },
            { label: 'Manifest Reference', slug: 'bundles/manifest' },
            { label: 'GitHub Action', slug: 'bundles/github-action' },
            { label: 'Multi-Platform Builds', slug: 'bundles/multi-platform' },
            { label: 'User Configuration', slug: 'bundles/user-config' },
          ],
        },
        {
          label: 'Security',
          items: [
            { label: 'Provenance', slug: 'security/provenance' },
            { label: 'Certification', slug: 'security/certification' },
            { label: 'Scanning Your Bundle', slug: 'security/scanning' },
          ],
        },
        {
          label: 'Skills',
          items: [
            { label: 'What are Skills?', slug: 'skills/what-are-skills' },
            { label: 'Publishing', slug: 'skills/overview' },
            { label: 'SKILL.md Reference', slug: 'skills/skill-md' },
            { label: 'GitHub Action', slug: 'skills/github-action' },
            { label: 'Monorepo Guide', slug: 'skills/monorepo-guide' },
          ],
        },
        {
          label: 'Registry',
          items: [
            { label: 'How It Works', slug: 'registry/how-it-works' },
            { label: 'API Reference', slug: 'registry/api' },
            { label: 'Versioning', slug: 'registry/versioning' },
            { label: 'Access Model', slug: 'registry/access-model' },
            { label: 'Naming Conventions', slug: 'registry/naming' },
          ],
        },
        {
          label: 'Integrations',
          items: [
            { label: 'Claude Code', slug: 'integrations/claude-code' },
            { label: 'Claude Desktop', slug: 'integrations/claude-desktop' },
            { label: 'Cursor', slug: 'integrations/cursor' },
            { label: 'VS Code', slug: 'integrations/vscode' },
          ],
        },
        {
          label: 'CLI Reference',
          items: [
            { label: 'Installation', slug: 'cli/install' },
            { label: 'search', slug: 'cli/search' },
            { label: 'show', slug: 'cli/show' },
            { label: 'pull', slug: 'cli/pull' },
            { label: 'run', slug: 'cli/run' },
            { label: 'skill', slug: 'cli/skills' },
            { label: 'config', slug: 'cli/config' },
            { label: 'completion', slug: 'cli/completion' },
            { label: 'cache', slug: 'cli/cache' },
          ],
        },
        {
          label: 'Resources',
          items: [
            { label: 'Browsing the Registry', slug: 'browsing' },
            { label: 'Troubleshooting', slug: 'troubleshooting' },
            { label: 'Ecosystem', slug: 'ecosystem' },
          ],
        },
      ],
      components: {
        Header: './src/components/Header.astro',
      },
    }),
  ],
});
