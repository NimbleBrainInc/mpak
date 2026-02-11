import { packageToDetailPlaceholder } from './api';
import type { Package } from '../schemas/generated';

function makePackage(overrides: Partial<Package> = {}): Package {
  return {
    name: '@scope/test-pkg',
    display_name: 'Test Package',
    description: 'A test package',
    author: { name: 'Test Author' },
    latest_version: '1.0.0',
    icon: 'icon.png',
    server_type: 'node',
    tools: [{ name: 'tool1', description: 'A tool' }],
    downloads: 42,
    published_at: '2025-01-01T00:00:00Z',
    verified: true,
    github: { repo: 'scope/test-pkg', stars: 10, forks: 2, watchers: 1 },
    claimable: true,
    claimed: false,
    ...overrides,
  };
}

describe('packageToDetailPlaceholder', () => {
  it('maps all fields correctly', () => {
    const pkg = makePackage();
    const detail = packageToDetailPlaceholder(pkg);

    expect(detail.name).toBe('@scope/test-pkg');
    expect(detail.display_name).toBe('Test Package');
    expect(detail.description).toBe('A test package');
    expect(detail.author).toEqual({ name: 'Test Author' });
    expect(detail.latest_version).toBe('1.0.0');
    expect(detail.icon).toBe('icon.png');
    expect(detail.server_type).toBe('node');
    expect(detail.tools).toEqual([{ name: 'tool1', description: 'A tool' }]);
    expect(detail.downloads).toBe(42);
    expect(detail.published_at).toBe('2025-01-01T00:00:00Z');
    expect(detail.verified).toBe(true);
    expect(detail.github).toEqual({ repo: 'scope/test-pkg', stars: 10, forks: 2, watchers: 1 });
  });

  it('transforms claimable/claimed into claiming object', () => {
    const pkg = makePackage({ claimable: true, claimed: false });
    const detail = packageToDetailPlaceholder(pkg);

    expect(detail.claiming).toEqual({
      claimable: true,
      claimed: false,
      claimed_by: null,
      claimed_at: null,
      github_repo: null,
    });
  });

  it('defaults claimable to false when undefined', () => {
    const pkg = makePackage({ claimable: undefined, claimed: undefined });
    const detail = packageToDetailPlaceholder(pkg);

    expect(detail.claiming.claimable).toBe(false);
    expect(detail.claiming.claimed).toBe(false);
  });

  it('sets placeholder fields for data not in Package type', () => {
    const pkg = makePackage();
    const detail = packageToDetailPlaceholder(pkg);

    expect(detail.homepage).toBeNull();
    expect(detail.license).toBeNull();
    expect(detail.versions).toEqual([]);
  });

  it('handles missing optional fields', () => {
    const pkg = makePackage({
      display_name: null,
      description: null,
      author: null,
      icon: null,
      github: null,
    });
    const detail = packageToDetailPlaceholder(pkg);

    expect(detail.display_name).toBeNull();
    expect(detail.description).toBeNull();
    expect(detail.author).toBeNull();
    expect(detail.icon).toBeNull();
    expect(detail.github).toBeNull();
  });
});
