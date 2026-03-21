import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { MpakClient } from '../src/client.js';
import { MpakNotFoundError, MpakIntegrityError, MpakNetworkError } from '../src/errors.js';

// Helper to compute SHA256 hash (same as client implementation)
function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

// Helper to create a mock Response
function mockResponse(
  body: string | object,
  init: { status?: number; ok?: boolean } = {},
): Response {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    text: () => Promise.resolve(bodyStr),
    json: () => Promise.resolve(typeof body === 'string' ? JSON.parse(body) : body),
    arrayBuffer: () => Promise.resolve(Buffer.from(bodyStr).buffer),
    status: init.status ?? 200,
    ok: init.ok ?? (init.status === undefined || init.status < 400),
  } as Response;
}

// Helper to create a mock binary Response
function mockBinaryResponse(
  data: Uint8Array,
  init: { status?: number; ok?: boolean } = {},
): Response {
  return {
    arrayBuffer: () =>
      Promise.resolve(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)),
    status: init.status ?? 200,
    ok: init.ok ?? (init.status === undefined || init.status < 400),
  } as Response;
}

describe('MpakClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('constructor', () => {
    it('uses default registry URL when not specified', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(mockResponse({ bundles: [], total: 0, pagination: {} }));

      await client.searchBundles();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://registry.mpak.dev'),
        expect.any(Object),
      );
    });

    it('uses custom registry URL when specified', async () => {
      const client = new MpakClient({
        registryUrl: 'https://custom.registry.com',
      });
      fetchMock.mockResolvedValueOnce(mockResponse({ bundles: [], total: 0, pagination: {} }));

      await client.searchBundles();

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('https://custom.registry.com'),
        expect.any(Object),
      );
    });
  });

  describe('searchBundles', () => {
    it('returns search results', async () => {
      const client = new MpakClient();
      const searchResponse = {
        bundles: [
          {
            name: '@test/bundle-1',
            latest_version: '1.0.0',
            downloads: 100,
            published_at: '2024-01-01',
            verified: true,
          },
        ],
        total: 1,
        pagination: { limit: 20, offset: 0, has_more: false },
      };
      fetchMock.mockResolvedValueOnce(mockResponse(searchResponse));

      const result = await client.searchBundles({ q: 'test' });

      expect(result.bundles).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('passes query parameters correctly', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(mockResponse({ bundles: [], total: 0, pagination: {} }));

      await client.searchBundles({
        q: 'mcp',
        type: 'python',
        sort: 'downloads',
        limit: 10,
        offset: 5,
      });

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('q=mcp');
      expect(calledUrl).toContain('type=python');
      expect(calledUrl).toContain('sort=downloads');
      expect(calledUrl).toContain('limit=10');
      expect(calledUrl).toContain('offset=5');
    });

    it('calls /v1/bundles/search endpoint', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(mockResponse({ bundles: [], total: 0, pagination: {} }));

      await client.searchBundles();

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/v1/bundles/search');
    });
  });

  describe('getBundle', () => {
    it('returns bundle details', async () => {
      const client = new MpakClient();
      const bundleResponse = {
        name: '@test/bundle',
        latest_version: '1.0.0',
        downloads: 100,
        published_at: '2024-01-01',
        verified: true,
        versions: [],
      };
      fetchMock.mockResolvedValueOnce(mockResponse(bundleResponse));

      const result = await client.getBundle('@test/bundle');

      expect(result.name).toBe('@test/bundle');
    });

    it('throws error for unscoped name', async () => {
      const client = new MpakClient();

      await expect(client.getBundle('invalid-name')).rejects.toThrow('Package name must be scoped');
    });

    it('throws MpakNotFoundError on 404', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(mockResponse('', { status: 404 }));

      await expect(client.getBundle('@test/nonexistent')).rejects.toThrow(MpakNotFoundError);
    });
  });

  describe('getBundleVersions', () => {
    it('returns versions list', async () => {
      const client = new MpakClient();
      const versionsResponse = {
        name: '@test/bundle',
        latest: '1.0.0',
        versions: [
          {
            version: '1.0.0',
            artifacts_count: 1,
            platforms: [],
            published_at: '2024-01-01',
            downloads: 50,
            publish_method: null,
          },
        ],
      };
      fetchMock.mockResolvedValueOnce(mockResponse(versionsResponse));

      const result = await client.getBundleVersions('@test/bundle');

      expect(result.versions).toHaveLength(1);
      expect(result.latest).toBe('1.0.0');
    });
  });

  describe('getBundleDownload', () => {
    it('returns download info with URL', async () => {
      const client = new MpakClient();
      const downloadResponse = {
        url: 'https://storage.example.com/bundle.mcpb',
        bundle: {
          name: '@test/bundle',
          version: '1.0.0',
          platform: { os: 'darwin', arch: 'arm64' },
          sha256: 'abc123',
          size: 12345,
        },
        expires_at: '2024-01-02T00:00:00Z',
      };
      fetchMock.mockResolvedValueOnce(mockResponse(downloadResponse));

      const result = await client.getBundleDownload('@test/bundle', '1.0.0');

      expect(result.url).toBe('https://storage.example.com/bundle.mcpb');
      expect(result.bundle.sha256).toBe('abc123');
    });

    it('passes platform parameters', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          url: 'https://example.com',
          bundle: {
            name: '@test/bundle',
            version: '1.0.0',
            platform: {},
            sha256: '',
            size: 0,
          },
        }),
      );

      await client.getBundleDownload('@test/bundle', '1.0.0', {
        os: 'linux',
        arch: 'x64',
      });

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('os=linux');
      expect(calledUrl).toContain('arch=x64');
    });
  });

  describe('searchSkills', () => {
    it('returns search results', async () => {
      const client = new MpakClient();
      const searchResponse = {
        skills: [
          {
            name: '@test/skill-1',
            description: 'Test skill',
            latest_version: '1.0.0',
            downloads: 50,
            published_at: '2024-01-01',
          },
        ],
        total: 1,
        pagination: { limit: 20, offset: 0, has_more: false },
      };
      fetchMock.mockResolvedValueOnce(mockResponse(searchResponse));

      const result = await client.searchSkills({ q: 'test' });

      expect(result.skills).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('passes all query parameters', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(mockResponse({ skills: [], total: 0, pagination: {} }));

      await client.searchSkills({
        q: 'crm',
        tags: 'sales,contacts',
        category: 'development',
        sort: 'recent',
        limit: 10,
        offset: 5,
      });

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('q=crm');
      expect(calledUrl).toContain('tags=sales%2Ccontacts');
      expect(calledUrl).toContain('category=development');
      expect(calledUrl).toContain('sort=recent');
    });

    it('calls /v1/skills/search endpoint', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(mockResponse({ skills: [], total: 0, pagination: {} }));

      await client.searchSkills();

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/v1/skills/search');
    });
  });

  describe('getSkill', () => {
    it('returns skill details', async () => {
      const client = new MpakClient();
      const skillResponse = {
        name: '@test/skill',
        description: 'A test skill',
        latest_version: '1.0.0',
        downloads: 100,
        published_at: '2024-01-01',
        versions: [],
      };
      fetchMock.mockResolvedValueOnce(mockResponse(skillResponse));

      const result = await client.getSkill('@test/skill');

      expect(result.name).toBe('@test/skill');
      expect(result.description).toBe('A test skill');
    });

    it('throws MpakNotFoundError on 404', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(mockResponse('', { status: 404 }));

      await expect(client.getSkill('@test/nonexistent')).rejects.toThrow(MpakNotFoundError);
    });
  });

  describe('getSkillDownload', () => {
    it('returns download info', async () => {
      const client = new MpakClient();
      const downloadResponse = {
        url: 'https://storage.example.com/skill.skill',
        skill: {
          name: '@test/skill',
          version: '1.0.0',
          sha256: 'abc123def456',
          size: 1024,
        },
        expires_at: '2024-01-02T00:00:00Z',
      };
      fetchMock.mockResolvedValueOnce(mockResponse(downloadResponse));

      const result = await client.getSkillDownload('@test/skill');

      expect(result.url).toBe('https://storage.example.com/skill.skill');
      expect(result.skill.sha256).toBe('abc123def456');
    });
  });

  describe('getSkillVersionDownload', () => {
    it('returns download info for specific version', async () => {
      const client = new MpakClient();
      const downloadResponse = {
        url: 'https://storage.example.com/skill-v1.skill',
        skill: {
          name: '@test/skill',
          version: '1.0.0',
          sha256: 'version1hash',
          size: 1024,
        },
        expires_at: '2024-01-02T00:00:00Z',
      };
      fetchMock.mockResolvedValueOnce(mockResponse(downloadResponse));

      const result = await client.getSkillVersionDownload('@test/skill', '1.0.0');

      expect(result.skill.version).toBe('1.0.0');
    });

    it('calls correct versioned endpoint', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(
        mockResponse({
          url: 'https://example.com',
          skill: {
            name: '@test/skill',
            version: '2.0.0',
            sha256: '',
            size: 0,
          },
          expires_at: '',
        }),
      );

      await client.getSkillVersionDownload('@test/skill', '2.0.0');

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/versions/2.0.0/download');
    });
  });

  describe('downloadContent', () => {
    it('downloads and verifies SHA-256', async () => {
      const client = new MpakClient();
      const content = new TextEncoder().encode('bundle binary data');
      const hash = sha256(content);
      fetchMock.mockResolvedValueOnce(mockBinaryResponse(content));

      const result = await client.downloadContent('https://example.com/file.mcpb', hash);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result)).toBe('bundle binary data');
    });

    it('throws MpakIntegrityError on SHA-256 mismatch', async () => {
      const client = new MpakClient();
      const content = new TextEncoder().encode('some data');
      fetchMock.mockResolvedValueOnce(mockBinaryResponse(content));

      await expect(
        client.downloadContent('https://example.com/file.mcpb', 'wrong_hash'),
      ).rejects.toThrow(MpakIntegrityError);
    });

    it('throws MpakNetworkError on fetch failure', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(
        mockBinaryResponse(new Uint8Array(0), { status: 500, ok: false }),
      );

      await expect(
        client.downloadContent('https://example.com/file.mcpb', 'anyhash'),
      ).rejects.toThrow(MpakNetworkError);
    });
  });

  describe('downloadBundle', () => {
    const bundleContent = new TextEncoder().encode('fake mcpb bundle');
    const bundleHash = sha256(bundleContent);
    const downloadInfoResponse = {
      url: 'https://storage.example.com/bundle.mcpb',
      bundle: {
        name: '@test/bundle',
        version: '1.0.0',
        platform: { os: 'darwin', arch: 'arm64' },
        sha256: bundleHash,
        size: bundleContent.length,
      },
      expires_at: '2024-01-02T00:00:00Z',
    };

    it('resolves download info and returns verified buffer + metadata', async () => {
      const client = new MpakClient();
      fetchMock
        .mockResolvedValueOnce(mockResponse(downloadInfoResponse))
        .mockResolvedValueOnce(mockBinaryResponse(bundleContent));

      const result = await client.downloadBundle('@test/bundle', '1.0.0', {
        os: 'darwin',
        arch: 'arm64',
      });

      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result.data)).toBe('fake mcpb bundle');
      expect(result.metadata.name).toBe('@test/bundle');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.sha256).toBe(bundleHash);
    });

    it('defaults version to latest and auto-detects platform', async () => {
      const client = new MpakClient();
      fetchMock
        .mockResolvedValueOnce(mockResponse(downloadInfoResponse))
        .mockResolvedValueOnce(mockBinaryResponse(bundleContent));

      await client.downloadBundle('@test/bundle');

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/versions/latest/download');
      expect(calledUrl).toContain('os=');
      expect(calledUrl).toContain('arch=');
    });

    it('propagates MpakNotFoundError from getBundleDownload', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(mockResponse('', { status: 404 }));

      await expect(client.downloadBundle('@test/nonexistent')).rejects.toThrow(MpakNotFoundError);
    });

    it('propagates MpakIntegrityError on SHA-256 mismatch', async () => {
      const client = new MpakClient();
      const tampered = new TextEncoder().encode('tampered content');
      fetchMock
        .mockResolvedValueOnce(mockResponse(downloadInfoResponse))
        .mockResolvedValueOnce(mockBinaryResponse(tampered));

      await expect(client.downloadBundle('@test/bundle', '1.0.0')).rejects.toThrow(
        MpakIntegrityError,
      );
    });
  });

  describe('downloadSkillBundle', () => {
    const skillContent = new TextEncoder().encode('fake skill bundle');
    const skillHash = sha256(skillContent);
    const skillDownloadInfoResponse = {
      url: 'https://storage.example.com/skill.skill',
      skill: {
        name: '@test/skill',
        version: '1.0.0',
        sha256: skillHash,
        size: skillContent.length,
      },
      expires_at: '2024-01-02T00:00:00Z',
    };

    it('resolves download info and returns verified buffer + metadata', async () => {
      const client = new MpakClient();
      fetchMock
        .mockResolvedValueOnce(mockResponse(skillDownloadInfoResponse))
        .mockResolvedValueOnce(mockBinaryResponse(skillContent));

      const result = await client.downloadSkillBundle('@test/skill', '1.0.0');

      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(new TextDecoder().decode(result.data)).toBe('fake skill bundle');
      expect(result.metadata.name).toBe('@test/skill');
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.sha256).toBe(skillHash);
    });

    it('defaults version to latest', async () => {
      const client = new MpakClient();
      fetchMock
        .mockResolvedValueOnce(mockResponse(skillDownloadInfoResponse))
        .mockResolvedValueOnce(mockBinaryResponse(skillContent));

      await client.downloadSkillBundle('@test/skill');

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('/versions/latest/download');
    });

    it('propagates MpakNotFoundError from getSkillVersionDownload', async () => {
      const client = new MpakClient();
      fetchMock.mockResolvedValueOnce(mockResponse('', { status: 404 }));

      await expect(client.downloadSkillBundle('@test/nonexistent')).rejects.toThrow(
        MpakNotFoundError,
      );
    });

    it('propagates MpakIntegrityError on SHA-256 mismatch', async () => {
      const client = new MpakClient();
      const tampered = new TextEncoder().encode('tampered content');
      fetchMock
        .mockResolvedValueOnce(mockResponse(skillDownloadInfoResponse))
        .mockResolvedValueOnce(mockBinaryResponse(tampered));

      await expect(client.downloadSkillBundle('@test/skill', '1.0.0')).rejects.toThrow(
        MpakIntegrityError,
      );
    });
  });

  describe('detectPlatform', () => {
    it('returns current platform', () => {
      const platform = MpakClient.detectPlatform();

      expect(platform).toHaveProperty('os');
      expect(platform).toHaveProperty('arch');
      expect(['darwin', 'linux', 'win32', 'any']).toContain(platform.os);
      expect(['x64', 'arm64', 'any']).toContain(platform.arch);
    });
  });

  describe('timeout handling', () => {
    it('throws MpakNetworkError on timeout', async () => {
      const client = new MpakClient({ timeout: 100 });

      fetchMock.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              const error = new Error('AbortError');
              error.name = 'AbortError';
              reject(error);
            }, 50);
          }),
      );

      await expect(client.searchBundles()).rejects.toThrow(MpakNetworkError);
    });

    it('includes timeout duration in error message', async () => {
      const client = new MpakClient({ timeout: 5000 });

      fetchMock.mockImplementationOnce(() => {
        const error = new Error('AbortError');
        error.name = 'AbortError';
        return Promise.reject(error);
      });

      await expect(client.searchBundles()).rejects.toThrow('5000ms');
    });

    it('wraps generic fetch errors as MpakNetworkError', async () => {
      const client = new MpakClient();
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(client.searchBundles()).rejects.toThrow(MpakNetworkError);
    });
  });
});
