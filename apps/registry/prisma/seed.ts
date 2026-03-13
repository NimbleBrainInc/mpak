/**
 * Database Seed Script
 *
 * Populates the local development database with realistic example data.
 * Safe to run multiple times (uses upserts).
 *
 * Usage:
 *   npx tsx prisma/seed.ts
 *   # or via npm script:
 *   npm run db:seed
 *
 * Requires DATABASE_URL to be set (defaults from .env).
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { createHash, randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Database setup (standalone, doesn't use the app's singleton)
// ---------------------------------------------------------------------------

const pool = new pg.Pool({
  connectionString: process.env['DATABASE_URL'],
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Seed data: Skills
// ---------------------------------------------------------------------------

interface SeedSkill {
  name: string;
  description: string;
  license: string;
  category: string;
  tags: string[];
  triggers: string[];
  keywords: string[];
  authorName: string;
  authorUrl: string;
  githubRepo: string;
  compatibility?: string;
  allowedTools?: string;
  versions: {
    version: string;
    downloads: number;
    frontmatter: Record<string, unknown>;
    content?: string;
  }[];
}

const SKILLS: SeedSkill[] = [
  {
    name: '@nimblebraininc/docs-auditor',
    description:
      'Systematically audit documentation against actual codebase to determine accuracy, staleness, and relevance. Use when auditing docs for accuracy, cleaning up stale docs after refactoring, validating docs match implementation, or building documentation health reports.',
    license: 'Apache-2.0',
    category: 'development',
    tags: ['documentation', 'audit', 'code-quality', 'maintenance', 'accuracy'],
    triggers: [
      'audit the docs',
      'check if docs are stale',
      'validate documentation',
      'docs match implementation',
      'documentation health report',
      'find outdated docs',
    ],
    keywords: ['documentation', 'audit', 'stale', 'accuracy', 'codebase'],
    authorName: 'NimbleBrain',
    authorUrl: 'https://nimblebrain.ai',
    githubRepo: 'NimbleBrainInc/skills',
    allowedTools: 'Read Glob Grep Task',
    versions: [
      {
        version: '1.0.0',
        downloads: 87,
        frontmatter: {
          name: 'docs-auditor',
          description:
            'Systematically audit documentation against actual codebase to determine accuracy, staleness, and relevance.',
          metadata: {
            version: '1.0.0',
            category: 'development',
            tags: ['documentation', 'audit', 'code-quality', 'maintenance', 'accuracy'],
            triggers: [
              'audit the docs',
              'check if docs are stale',
              'validate documentation',
              'docs match implementation',
              'documentation health report',
              'find outdated docs',
            ],
            surfaces: ['claude-code'],
            author: { name: 'NimbleBrain', url: 'https://nimblebrain.ai' },
          },
        },
      },
      {
        version: '1.1.0',
        downloads: 142,
        frontmatter: {
          name: 'docs-auditor',
          description:
            'Systematically audit documentation against actual codebase to determine accuracy, staleness, and relevance.',
          metadata: {
            version: '1.1.0',
            category: 'development',
            tags: ['documentation', 'audit', 'code-quality', 'maintenance', 'accuracy'],
            triggers: [
              'audit the docs',
              'check if docs are stale',
              'validate documentation',
              'docs match implementation',
              'documentation health report',
              'find outdated docs',
            ],
            surfaces: ['claude-code'],
            author: { name: 'NimbleBrain', url: 'https://nimblebrain.ai' },
            examples: [
              {
                prompt: 'Audit the docs in the docs/ folder against the current codebase',
                context: 'After a major refactor',
              },
              { prompt: 'Find all stale documentation that references removed APIs' },
            ],
          },
        },
        content: `## How It Works

The docs auditor scans your documentation files and cross-references them against the actual codebase to find inconsistencies, stale references, and missing documentation.

### Audit Process

1. **Discovery** - Finds all documentation files (Markdown, RST, plain text)
2. **Cross-reference** - Checks code references, function names, file paths, and API endpoints against the codebase
3. **Staleness detection** - Identifies docs that reference removed or renamed symbols
4. **Gap analysis** - Finds public APIs and exported functions that lack documentation
5. **Report** - Generates a structured health report with actionable findings

### Output Format

The audit produces a structured report with:

- **Accuracy score** - Percentage of code references that are still valid
- **Stale references** - Specific lines that reference code that no longer exists
- **Missing docs** - Public APIs without corresponding documentation
- **Recommendations** - Prioritized list of fixes

### Tips

- Run after major refactors to catch documentation drift
- Pair with CI to prevent stale docs from merging
- Use the gap analysis to prioritize which docs to write next`,
      },
    ],
  },
  {
    name: '@nimblebraininc/seo-optimizer',
    description:
      'Analyzes and optimizes content for search engine visibility. Use when reviewing blog posts for SEO, optimizing landing pages, checking meta descriptions, analyzing keyword usage, or improving content discoverability.',
    license: 'Apache-2.0',
    category: 'writing',
    tags: ['seo', 'content', 'marketing', 'optimization', 'search'],
    triggers: [
      'optimize for SEO',
      'check SEO',
      'improve search ranking',
      'keyword analysis',
      'review for search',
      'SEO audit',
      'meta description',
    ],
    keywords: ['seo', 'search', 'optimization', 'meta', 'keywords', 'ranking'],
    authorName: 'NimbleBrain',
    authorUrl: 'https://nimblebrain.ai',
    githubRepo: 'NimbleBrainInc/skills',
    versions: [
      {
        version: '1.0.0',
        downloads: 45,
        frontmatter: {
          name: 'seo-optimizer',
          description: 'Analyzes and optimizes content for search engine visibility.',
          metadata: {
            version: '1.0.0',
            category: 'writing',
            tags: ['seo', 'content', 'marketing', 'optimization', 'search'],
            triggers: [
              'optimize for SEO',
              'check SEO',
              'improve search ranking',
              'keyword analysis',
              'review for search',
              'SEO audit',
              'meta description',
            ],
            surfaces: ['claude-code', 'claude-ai'],
            author: { name: 'NimbleBrain', url: 'https://nimblebrain.ai' },
          },
        },
      },
      {
        version: '1.0.7',
        downloads: 213,
        frontmatter: {
          name: 'seo-optimizer',
          description: 'Analyzes and optimizes content for search engine visibility.',
          metadata: {
            version: '1.0.7',
            category: 'writing',
            tags: ['seo', 'content', 'marketing', 'optimization', 'search'],
            triggers: [
              'optimize for SEO',
              'check SEO',
              'improve search ranking',
              'keyword analysis',
              'review for search',
              'SEO audit',
              'meta description',
            ],
            surfaces: ['claude-code', 'claude-ai'],
            author: { name: 'NimbleBrain', url: 'https://nimblebrain.ai' },
            examples: [
              {
                prompt: 'Optimize this blog post for SEO',
                context: 'Before publishing a new article',
              },
              { prompt: 'Check the meta descriptions on our landing pages' },
            ],
          },
        },
        content: `## What It Does

Analyzes your content for search engine optimization and provides actionable recommendations to improve visibility and ranking.

### Analysis Areas

- **Title tags** - Length, keyword placement, uniqueness
- **Meta descriptions** - Compelling copy within character limits
- **Heading structure** - Proper H1/H2/H3 hierarchy
- **Keyword density** - Natural usage without stuffing
- **Internal linking** - Opportunities to connect related content
- **Readability** - Sentence length, paragraph structure, scan-ability

### Best Practices

The optimizer follows current SEO best practices:

- Write for humans first, search engines second
- Use natural language and semantic variations
- Structure content with clear headings and short paragraphs
- Include relevant internal and external links
- Optimize images with alt text and descriptive filenames`,
      },
    ],
  },
  {
    name: '@nimblebraininc/strategic-thought-partner',
    description:
      'Collaborative strategic thinking for founders, operators, and decision-makers. Use when someone needs help working through business strategy, product direction, positioning, prioritization, or major decisions. Not for execution, for clarification and decision-making.',
    license: 'Apache-2.0',
    category: 'consulting',
    tags: ['strategy', 'business', 'decision-making', 'product', 'founders'],
    triggers: [
      'think through strategy',
      'evaluate tradeoffs',
      'pressure-test this idea',
      'help me decide',
      'clarify direction',
      'scope this product',
      'navigate this pivot',
      'strategic thinking',
    ],
    keywords: ['strategy', 'business', 'decisions', 'tradeoffs', 'product', 'founders'],
    authorName: 'NimbleBrain',
    authorUrl: 'https://nimblebrain.ai',
    githubRepo: 'NimbleBrainInc/skills',
    compatibility: 'Claude Code, Claude AI',
    versions: [
      {
        version: '1.0.0',
        downloads: 64,
        frontmatter: {
          name: 'strategic-thought-partner',
          description:
            'Collaborative strategic thinking for founders, operators, and decision-makers.',
          metadata: {
            version: '1.0.0',
            category: 'consulting',
            tags: ['strategy', 'business', 'decision-making', 'product', 'founders'],
            triggers: [
              'think through strategy',
              'evaluate tradeoffs',
              'pressure-test this idea',
              'help me decide',
              'clarify direction',
              'scope this product',
              'navigate this pivot',
              'strategic thinking',
            ],
            surfaces: ['claude-code', 'claude-ai'],
            author: { name: 'NimbleBrain', url: 'https://nimblebrain.ai' },
          },
        },
      },
      {
        version: '1.1.0',
        downloads: 189,
        frontmatter: {
          name: 'strategic-thought-partner',
          description:
            'Collaborative strategic thinking for founders, operators, and decision-makers.',
          metadata: {
            version: '1.1.0',
            category: 'consulting',
            tags: ['strategy', 'business', 'decision-making', 'product', 'founders'],
            triggers: [
              'think through strategy',
              'evaluate tradeoffs',
              'pressure-test this idea',
              'help me decide',
              'clarify direction',
              'scope this product',
              'navigate this pivot',
              'strategic thinking',
            ],
            surfaces: ['claude-code', 'claude-ai'],
            author: { name: 'NimbleBrain', url: 'https://nimblebrain.ai' },
            examples: [
              {
                prompt: 'Help me think through whether to pivot from B2C to B2B',
                context: 'Early-stage startup with declining consumer metrics',
              },
              { prompt: 'Evaluate the tradeoffs of building vs buying our auth system' },
            ],
          },
        },
        content: `## Approach

This skill acts as a strategic thought partner, not an executor. It helps you think clearly through complex decisions by structuring the problem, surfacing assumptions, and pressure-testing your reasoning.

### When to Use

- Evaluating major product direction changes
- Weighing build vs. buy decisions
- Navigating pivot decisions with incomplete information
- Prioritizing across competing opportunities
- Stress-testing a strategy before committing resources

### How It Works

The skill follows a structured thinking process:

1. **Clarify the decision** - What exactly are you deciding? What are the constraints?
2. **Map the landscape** - What options exist? What are the second-order effects?
3. **Surface assumptions** - What are you taking for granted? What would change if those assumptions were wrong?
4. **Evaluate tradeoffs** - What do you gain and lose with each path?
5. **Identify the crux** - What is the single most important factor in this decision?

### What It Does Not Do

- Make decisions for you
- Execute on strategy
- Provide industry-specific market data
- Replace domain expertise`,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Seed data: Packages (bundles)
// ---------------------------------------------------------------------------

interface SeedPackageVersion {
  version: string;
  prerelease?: boolean;
  downloads: number;
  manifest: object;
  publishedAt: string;
  publishMethod: string;
  provenanceRepository: string;
  provenanceSha: string;
  releaseTag?: string;
  releaseUrl?: string;
}

interface SeedPackage {
  name: string;
  description: string;
  authorName: string;
  serverType: string;
  license?: string;
  githubRepo?: string;
  versions: SeedPackageVersion[];
}

const echoManifest = (version: string) => ({
  name: '@nimblebraininc/echo',
  version,
  description: 'Echo server for testing and debugging MCP connections',
  manifest_version: '0.3',
  author: { name: 'NimbleBrain Inc' },
  server: {
    type: 'python',
    mcp_config: { command: 'python', args: ['-m', 'mcp_echo.server'] },
    entry_point: 'mcp_echo.server',
  },
});

const nationalparksManifest = (version: string) => ({
  name: '@nimblebraininc/nationalparks',
  version,
  description: 'MCP server for National Parks Service API',
  manifest_version: '0.3',
  author: { name: 'NimbleBrain Inc' },
  server: {
    type: 'node',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/build/index.js'],
      env: { NPS_API_KEY: '${user_config.api_key}' },
    },
    entry_point: 'build/index.js',
  },
  user_config: {
    api_key: {
      type: 'string',
      title: 'NPS API Key',
      required: true,
      sensitive: true,
      description: 'Your NPS API key from https://www.nps.gov/subjects/developer/get-started.htm',
    },
  },
});

const PACKAGES: SeedPackage[] = [
  {
    name: '@nimblebraininc/echo',
    description: 'Echo server for testing and debugging MCP connections',
    authorName: 'NimbleBrain Inc',
    serverType: 'python',
    license: 'Apache-2.0',
    githubRepo: 'NimbleBrainInc/mcp-echo',
    versions: [
      {
        version: '0.1.0',
        downloads: 103,
        publishedAt: '2025-12-31T19:46:28.468Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-echo',
        provenanceSha: 'e3406ec72697feaba4da26f18f356ac9aae8a31f',
        releaseTag: 'v0.1.0',
        releaseUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/tag/v0.1.0',
        manifest: echoManifest('0.1.0'),
      },
      {
        version: '0.1.1-beta.1',
        prerelease: true,
        downloads: 208,
        publishedAt: '2026-01-02T22:00:46.118Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-echo',
        provenanceSha: '1b0be7da2ff7f6f88e738e8897b8b2e602816935',
        releaseTag: 'v0.1.1-beta.1',
        releaseUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/tag/v0.1.1-beta.1',
        manifest: echoManifest('0.1.1-beta.1'),
      },
      {
        version: '0.1.1',
        downloads: 336,
        publishedAt: '2026-01-02T22:27:05.591Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-echo',
        provenanceSha: 'df13c722759cd066aa97ce6a9921cab52dbf5c58',
        releaseTag: 'v0.1.1',
        releaseUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/tag/v0.1.1',
        manifest: echoManifest('0.1.1'),
      },
      {
        version: '0.1.2',
        downloads: 124,
        publishedAt: '2026-01-04T19:22:00.731Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-echo',
        provenanceSha: '01a67c0c69847783c53fb428b898ebd64d439a4a',
        releaseTag: 'v0.1.2',
        releaseUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/tag/v0.1.2',
        manifest: echoManifest('0.1.2'),
      },
      {
        version: '0.1.3',
        downloads: 226,
        publishedAt: '2026-01-04T19:48:38.421Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-echo',
        provenanceSha: 'ea9ea341fdd7085e5ced55c8748010efa07ef492',
        releaseTag: 'v0.1.3',
        releaseUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/tag/v0.1.3',
        manifest: echoManifest('0.1.3'),
      },
      {
        version: '0.1.4-rc.1',
        prerelease: true,
        downloads: 0,
        publishedAt: '2026-02-09T18:47:48.584Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-echo',
        provenanceSha: 'facc63fda3553268eee4da38ceb7758dc7d47607',
        releaseTag: 'v0.1.4-rc.1',
        releaseUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/tag/v0.1.4-rc.1',
        manifest: echoManifest('0.1.4-rc.1'),
      },
      {
        version: '0.1.4-rc.4',
        prerelease: true,
        downloads: 0,
        publishedAt: '2026-02-09T19:21:38.476Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-echo',
        provenanceSha: 'facc63fda3553268eee4da38ceb7758dc7d47607',
        releaseTag: 'v0.1.4-rc.4',
        releaseUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/tag/v0.1.4-rc.4',
        manifest: echoManifest('0.1.4-rc.4'),
      },
      {
        version: '0.1.4',
        downloads: 2,
        publishedAt: '2026-02-11T03:40:32.500Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-echo',
        provenanceSha: '638181a3357e89fcf8f77234667459df97d61d89',
        releaseTag: 'v0.1.4',
        releaseUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/tag/v0.1.4',
        manifest: echoManifest('0.1.4'),
      },
      {
        version: '0.1.5',
        downloads: 101,
        publishedAt: '2026-02-11T08:11:50.559Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-echo',
        provenanceSha: '640aa8ef2dd3843f834292015b3562349ebcbf00',
        releaseTag: 'v0.1.5',
        releaseUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/tag/v0.1.5',
        manifest: echoManifest('0.1.5'),
      },
    ],
  },
  {
    name: '@nimblebraininc/nationalparks',
    description: 'MCP server for National Parks Service API',
    authorName: 'NimbleBrain Inc',
    serverType: 'node',
    license: 'Apache-2.0',
    githubRepo: 'NimbleBrainInc/mcp-server-nationalparks',
    versions: [
      {
        version: '0.1.1',
        downloads: 255,
        publishedAt: '2026-01-05T05:52:56.802Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-server-nationalparks',
        provenanceSha: '528a517c72167f6e2903a40a67b233a3c2bb641a',
        releaseTag: 'v0.1.1',
        releaseUrl:
          'https://github.com/NimbleBrainInc/mcp-server-nationalparks/releases/tag/v0.1.1',
        manifest: nationalparksManifest('0.1.1'),
      },
      {
        version: '0.1.2',
        downloads: 56,
        publishedAt: '2026-01-05T06:12:53.512Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-server-nationalparks',
        provenanceSha: 'acd8c36aa4bea46ce69c8b6f3225a23ce8b83e19',
        releaseTag: 'v0.1.2',
        releaseUrl:
          'https://github.com/NimbleBrainInc/mcp-server-nationalparks/releases/tag/v0.1.2',
        manifest: nationalparksManifest('0.1.2'),
      },
      {
        version: '0.1.3',
        downloads: 67,
        publishedAt: '2026-01-05T07:01:29.791Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-server-nationalparks',
        provenanceSha: 'd4d7e54b40a4f96aa79778239da71b5c635f4377',
        releaseTag: 'v0.1.3',
        releaseUrl:
          'https://github.com/NimbleBrainInc/mcp-server-nationalparks/releases/tag/v0.1.3',
        manifest: nationalparksManifest('0.1.3'),
      },
      {
        version: '0.1.4',
        downloads: 171,
        publishedAt: '2026-01-05T07:04:34.396Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-server-nationalparks',
        provenanceSha: '4897a961ace1e34760fd5aff15496ff520ca7ce7',
        releaseTag: 'v0.1.4',
        releaseUrl:
          'https://github.com/NimbleBrainInc/mcp-server-nationalparks/releases/tag/v0.1.4',
        manifest: nationalparksManifest('0.1.4'),
      },
      {
        version: '0.1.5',
        downloads: 174,
        publishedAt: '2026-01-05T07:08:30.892Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-server-nationalparks',
        provenanceSha: '5e6f1f3f5512b837a14f564d6c182e6a370d7a66',
        releaseTag: 'v0.1.5',
        releaseUrl:
          'https://github.com/NimbleBrainInc/mcp-server-nationalparks/releases/tag/v0.1.5',
        manifest: nationalparksManifest('0.1.5'),
      },
      {
        version: '0.2.0',
        downloads: 2,
        publishedAt: '2026-02-12T23:33:07.687Z',
        publishMethod: 'oidc',
        provenanceRepository: 'NimbleBrainInc/mcp-server-nationalparks',
        provenanceSha: 'b4566b1298b2617aedd1a2cc7d23b1576fe96e5d',
        releaseTag: 'v0.2.0',
        releaseUrl:
          'https://github.com/NimbleBrainInc/mcp-server-nationalparks/releases/tag/v0.2.0',
        manifest: nationalparksManifest('0.2.0'),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a deterministic fake digest from a string */
function fakeDigest(input: string): string {
  return 'sha256:' + createHash('sha256').update(input).digest('hex');
}

/** Generate a deterministic fake storage path */
function storagePath(scope: string, name: string, version: string): string {
  return `skills/${scope}/${name}/${version}/skill.bundle`;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  console.log('Seeding database...\n');

  for (const s of SKILLS) {
    const [scope, skillName] = s.name.replace('@', '').split('/');

    // Compute total downloads across all versions
    const totalDownloads = s.versions.reduce((sum, v) => sum + v.downloads, 0);
    const latestVersion = s.versions[s.versions.length - 1]!.version;

    // Upsert the skill
    const skill = await prisma.skill.upsert({
      where: { name: s.name },
      create: {
        name: s.name,
        description: s.description,
        license: s.license,
        category: s.category,
        compatibility: s.compatibility ?? null,
        allowedTools: s.allowedTools ?? null,
        tags: s.tags,
        triggers: s.triggers,
        keywords: s.keywords,
        authorName: s.authorName,
        authorUrl: s.authorUrl,
        githubRepo: s.githubRepo,
        latestVersion,
        totalDownloads: BigInt(totalDownloads),
      },
      update: {
        description: s.description,
        license: s.license,
        category: s.category,
        compatibility: s.compatibility ?? null,
        allowedTools: s.allowedTools ?? null,
        tags: s.tags,
        triggers: s.triggers,
        keywords: s.keywords,
        authorName: s.authorName,
        authorUrl: s.authorUrl,
        latestVersion,
        totalDownloads: BigInt(totalDownloads),
      },
    });

    console.log(`  Skill: ${s.name} (${skill.id})`);

    // Upsert each version
    for (const v of s.versions) {
      const path = storagePath(scope!, skillName!, v.version);
      const digest = fakeDigest(`${s.name}@${v.version}`);

      await prisma.skillVersion.upsert({
        where: {
          skillId_version: { skillId: skill.id, version: v.version },
        },
        create: {
          skillId: skill.id,
          version: v.version,
          frontmatter: v.frontmatter,
          content: v.content ?? null,
          storagePath: path,
          digest,
          sizeBytes: BigInt(Math.floor(Math.random() * 5000) + 2000),
          downloadCount: BigInt(v.downloads),
          publishMethod: 'oidc',
          provenanceRepository: s.githubRepo,
          provenanceSha: createHash('sha256')
            .update(`${s.name}@${v.version}-commit`)
            .digest('hex')
            .slice(0, 40),
          releaseTag: `${skillName}/v${v.version}`,
          releaseUrl: `https://github.com/${s.githubRepo}/releases/tag/${skillName}%2Fv${v.version}`,
        },
        update: {
          frontmatter: v.frontmatter,
          content: v.content ?? null,
          downloadCount: BigInt(v.downloads),
        },
      });

      console.log(`    v${v.version} (${v.downloads} downloads)`);
    }
  }

  console.log(`\nSeeded ${SKILLS.length} skills successfully.\n`);

  // Seed packages (bundles)
  for (const p of PACKAGES) {
    const totalDownloads = p.versions.reduce((sum, v) => sum + v.downloads, 0);
    const latestVersion = p.versions[p.versions.length - 1]!.version;

    const pkg = await prisma.package.upsert({
      where: { name: p.name },
      create: {
        name: p.name,
        description: p.description,
        authorName: p.authorName,
        serverType: p.serverType,
        license: p.license ?? null,
        githubRepo: p.githubRepo ?? null,
        latestVersion,
        totalDownloads: BigInt(totalDownloads),
      },
      update: {
        description: p.description,
        authorName: p.authorName,
        serverType: p.serverType,
        license: p.license ?? null,
        latestVersion,
        totalDownloads: BigInt(totalDownloads),
      },
    });

    console.log(`  Package: ${p.name} (${pkg.id})`);

    for (const v of p.versions) {
      await prisma.packageVersion.upsert({
        where: {
          packageId_version: { packageId: pkg.id, version: v.version },
        },
        create: {
          packageId: pkg.id,
          version: v.version,
          manifest: v.manifest,
          prerelease: v.prerelease ?? false,
          downloadCount: BigInt(v.downloads),
          publishMethod: v.publishMethod,
          provenanceRepository: v.provenanceRepository,
          provenanceSha: v.provenanceSha,
          releaseTag: v.releaseTag ?? null,
          releaseUrl: v.releaseUrl ?? null,
          publishedAt: new Date(v.publishedAt),
        },
        update: {
          manifest: v.manifest,
          downloadCount: BigInt(v.downloads),
        },
      });

      console.log(`    v${v.version} (${v.downloads} downloads)`);
    }
  }

  console.log(`\nSeeded ${PACKAGES.length} packages successfully.`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
