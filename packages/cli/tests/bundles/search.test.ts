import type { BundleSearchResponse } from '@nimblebrain/mpak-schemas';
import type { MpakClient } from '@nimblebrain/mpak-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSearch } from '../../src/commands/packages/search.js';

// ---------------------------------------------------------------------------
// Mock the mpak singleton
// ---------------------------------------------------------------------------

let mockSearchBundles: ReturnType<typeof vi.fn>;

vi.mock('../../src/utils/config.js', () => ({
  get mpak() {
    return {
      client: { searchBundles: mockSearchBundles } as unknown as MpakClient,
    };
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeBundle = (name: string, version: string) => ({
  name,
  display_name: null,
  description: `${name} description`,
  author: { name: 'test-author' },
  latest_version: version,
  icon: null,
  server_type: 'node',
  tools: [],
  downloads: 42,
  published_at: '2025-01-01T00:00:00.000Z',
  verified: false,
  provenance: null,
  certification_level: null,
});

const emptyResponse: BundleSearchResponse = {
  bundles: [],
  total: 0,
  pagination: { limit: 20, offset: 0, has_more: false },
};

const twoResultsResponse: BundleSearchResponse = {
  bundles: [makeBundle('@scope/alpha', '1.0.0'), makeBundle('@scope/beta', '2.3.1')],
  total: 2,
  pagination: { limit: 20, offset: 0, has_more: false },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleSearch', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockSearchBundles = vi.fn();
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('prints no-results message when search returns 0 bundles', async () => {
    mockSearchBundles.mockResolvedValue(emptyResponse);

    await handleSearch('nonexistent');

    expect(mockSearchBundles).toHaveBeenCalledWith(expect.objectContaining({ q: 'nonexistent' }));
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('No bundles found for "nonexistent"'),
    );
  });

  it('prints table output when results exist and json is not set', async () => {
    mockSearchBundles.mockResolvedValue(twoResultsResponse);

    await handleSearch('test');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Found 2 bundle(s)'));
    const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(allOutput).toContain('@scope/alpha');
    expect(allOutput).toContain('@scope/beta');
  });

  it('prints JSON output when json option is set', async () => {
    mockSearchBundles.mockResolvedValue(twoResultsResponse);

    await handleSearch('test', { json: true });

    const jsonCall = stdoutSpy.mock.calls.find((c: unknown[]) => {
      try {
        JSON.parse(c[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse((jsonCall as unknown[])[0] as string);
    expect(parsed.bundles).toHaveLength(2);
    expect(parsed.total).toBe(2);
  });

  it('logs error when searchBundles throws (e.g. 404)', async () => {
    mockSearchBundles.mockRejectedValue(new Error('Resource not found: bundles/search endpoint'));

    await handleSearch('anything');

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Resource not found'));
  });
});
