import {
  generateBreadcrumbSchema,
  generatePackageSchema,
  generateFAQSchema,
  generateItemListSchema,
  generateHowToSchema,
  generateOrganizationSchema,
  generateWebSiteSchema,
  generateCLIToolSchema,
} from './schema';
import type { PackageDetail } from './api';
import { SITE_URL } from './siteConfig';

function makePackageDetail(overrides: Partial<PackageDetail> = {}): PackageDetail {
  return {
    name: '@scope/test-pkg',
    display_name: 'Test Package',
    description: 'A test package',
    author: { name: 'Test Author' },
    latest_version: '1.0.0',
    icon: null,
    server_type: 'node',
    tools: [],
    downloads: 100,
    published_at: '2025-01-01T00:00:00Z',
    verified: true,
    homepage: null,
    license: null,
    claiming: {
      claimable: false,
      claimed: false,
      claimed_by: null,
      claimed_at: null,
      github_repo: null,
    },
    versions: [],
    ...overrides,
  };
}

describe('generateBreadcrumbSchema', () => {
  it('produces correct BreadcrumbList with positions', () => {
    const items = [
      { name: 'Home', url: 'https://www.mpak.dev/' },
      { name: 'Packages', url: 'https://www.mpak.dev/packages' },
      { name: 'Test', url: 'https://www.mpak.dev/packages/@scope/test' },
    ];
    const schema = generateBreadcrumbSchema(items);

    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement).toHaveLength(3);
    expect(schema.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://www.mpak.dev/',
    });
    expect(schema.itemListElement[2]!.position).toBe(3);
  });
});

describe('generatePackageSchema', () => {
  it('generates basic schema without author or stars', () => {
    const pkg = makePackageDetail({ author: null, github: null });
    const schema = generatePackageSchema(pkg);

    expect(schema['@type']).toBe('SoftwareApplication');
    expect(schema.name).toBe('Test Package');
    expect(schema.softwareVersion).toBe('1.0.0');
    expect(schema).not.toHaveProperty('author');
    expect(schema).not.toHaveProperty('aggregateRating');
  });

  it('uses name when display_name is null', () => {
    const pkg = makePackageDetail({ display_name: null });
    const schema = generatePackageSchema(pkg);
    expect(schema.name).toBe('@scope/test-pkg');
  });

  it('includes author when available', () => {
    const pkg = makePackageDetail({ author: { name: 'Alice' } });
    const schema = generatePackageSchema(pkg);
    expect(schema.author).toEqual({ '@type': 'Person', name: 'Alice' });
  });

  it('includes aggregate rating for packages with stars', () => {
    const pkg = makePackageDetail({ github: { repo: 'test/repo', stars: 150, forks: 10, watchers: 5 } });
    const schema = generatePackageSchema(pkg);
    expect(schema.aggregateRating).toEqual({
      '@type': 'AggregateRating',
      ratingValue: 4.5,
      bestRating: 5,
      ratingCount: 150,
    });
  });

  it('includes license when available', () => {
    const pkg = makePackageDetail({ license: 'MIT' });
    const schema = generatePackageSchema(pkg);
    expect(schema.license).toBe('MIT');
  });

  it('calculates rating tiers correctly', () => {
    // 1000+ stars = 5
    const pkg1000 = makePackageDetail({ github: { repo: 'a/b', stars: 1000, forks: 0, watchers: 0 } });
    expect((generatePackageSchema(pkg1000).aggregateRating as Record<string, unknown>).ratingValue).toBe(5);

    // 100-999 stars = 4.5
    const pkg100 = makePackageDetail({ github: { repo: 'a/b', stars: 100, forks: 0, watchers: 0 } });
    expect((generatePackageSchema(pkg100).aggregateRating as Record<string, unknown>).ratingValue).toBe(4.5);

    // 50-99 stars = 4
    const pkg50 = makePackageDetail({ github: { repo: 'a/b', stars: 50, forks: 0, watchers: 0 } });
    expect((generatePackageSchema(pkg50).aggregateRating as Record<string, unknown>).ratingValue).toBe(4);

    // 10-49 stars = 3.5
    const pkg10 = makePackageDetail({ github: { repo: 'a/b', stars: 10, forks: 0, watchers: 0 } });
    expect((generatePackageSchema(pkg10).aggregateRating as Record<string, unknown>).ratingValue).toBe(3.5);

    // <10 stars = 3
    const pkg5 = makePackageDetail({ github: { repo: 'a/b', stars: 5, forks: 0, watchers: 0 } });
    expect((generatePackageSchema(pkg5).aggregateRating as Record<string, unknown>).ratingValue).toBe(3);
  });

  it('maps operating systems from version artifacts', () => {
    const pkg = makePackageDetail({
      versions: [
        {
          version: '1.0.0',
          published_at: '2025-01-01',
          downloads: 10,
          artifacts: [
            { os: 'darwin', arch: 'arm64', size_bytes: 100, digest: 'sha256:abc', downloads: 5 },
            { os: 'linux', arch: 'x64', size_bytes: 100, digest: 'sha256:def', downloads: 3 },
          ],
        },
      ],
    });
    const schema = generatePackageSchema(pkg);
    expect(schema.operatingSystem).toContain('macOS');
    expect(schema.operatingSystem).toContain('Linux');
    expect(schema.operatingSystem).not.toContain('Windows');
  });

  it('maps "any" platform to all operating systems', () => {
    const pkg = makePackageDetail({
      versions: [
        {
          version: '1.0.0',
          published_at: '2025-01-01',
          downloads: 10,
          artifacts: [
            { os: 'any', arch: 'any', size_bytes: 100, digest: 'sha256:abc', downloads: 5 },
          ],
        },
      ],
    });
    const schema = generatePackageSchema(pkg);
    expect(schema.operatingSystem).toContain('macOS');
    expect(schema.operatingSystem).toContain('Linux');
    expect(schema.operatingSystem).toContain('Windows');
  });

  it('returns "Any" when no version artifacts', () => {
    const pkg = makePackageDetail({ versions: [] });
    const schema = generatePackageSchema(pkg);
    expect(schema.operatingSystem).toBe('Any');
  });
});

describe('generateFAQSchema', () => {
  it('produces correct FAQPage structure', () => {
    const faqs = [
      { question: 'What is mpak?', answer: 'A package manager for MCP.' },
      { question: 'How to install?', answer: 'npm install mpak' },
    ];
    const schema = generateFAQSchema(faqs);

    expect(schema['@type']).toBe('FAQPage');
    expect(schema.mainEntity).toHaveLength(2);
    expect(schema.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: 'What is mpak?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A package manager for MCP.',
      },
    });
  });
});

describe('generateItemListSchema', () => {
  it('produces correct ItemList structure', () => {
    const items = [
      { name: 'Package A', url: 'https://mpak.dev/packages/a' },
      { name: 'Package B', url: 'https://mpak.dev/packages/b' },
    ];
    const schema = generateItemListSchema(items, 'Test List');

    expect(schema['@type']).toBe('ItemList');
    expect(schema.name).toBe('Test List');
    expect(schema.numberOfItems).toBe(2);
    expect(schema.itemListElement[0]!.position).toBe(1);
    expect(schema.itemListElement[1]!.position).toBe(2);
  });
});

describe('generateHowToSchema', () => {
  it('produces correct HowTo structure', () => {
    const steps = [
      { name: 'Install', text: 'Run npm install mpak' },
      { name: 'Run', text: 'Run mpak run @scope/pkg' },
    ];
    const schema = generateHowToSchema('Install a package', 'How to install', steps);

    expect(schema['@type']).toBe('HowTo');
    expect(schema.name).toBe('Install a package');
    expect(schema.step).toHaveLength(2);
    expect(schema.step[0]!.position).toBe(1);
    expect(schema.step[1]!.name).toBe('Run');
  });
});

describe('static schemas', () => {
  it('generateOrganizationSchema returns Organization', () => {
    const schema = generateOrganizationSchema();
    expect(schema['@type']).toBe('Organization');
    expect(schema.name).toBe('mpak');
    expect(schema.url).toBe(SITE_URL);
  });

  it('generateWebSiteSchema returns WebSite with SearchAction', () => {
    const schema = generateWebSiteSchema();
    expect(schema['@type']).toBe('WebSite');
    expect(schema.potentialAction['@type']).toBe('SearchAction');
  });

  it('generateCLIToolSchema returns SoftwareApplication', () => {
    const schema = generateCLIToolSchema();
    expect(schema['@type']).toBe('SoftwareApplication');
    expect(schema.name).toBe('mpak CLI');
  });
});
