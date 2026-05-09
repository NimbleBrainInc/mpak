import { describe, expect, it } from 'vitest';
import {
  composeServerDetail,
  composeServerDetailOrThrow,
  type ComposerInput,
} from '../src/services/server-detail-composer.js';

const FULL_MANIFEST = {
  manifest_version: '0.4',
  name: '@nimblebraininc/echo',
  version: '0.1.6',
  display_name: 'Echo',
  description: 'Echo server for testing and debugging MCP connections',
  homepage: 'https://nimblebrain.ai',
  icon: 'https://static.nimblebrain.ai/icons/echo.png',
  repository: { type: 'git', url: 'https://github.com/NimbleBrainInc/mcp-echo' },
  server: {
    type: 'python',
    entry_point: 'mcp_echo.server',
    mcp_config: {
      command: 'python',
      args: ['-m', 'mcp_echo.server'],
      env: { IPINFO_API_KEY: '${user_config.api_key}' },
    },
  },
  user_config: {
    api_key: {
      type: 'string',
      description: 'IPInfo API token',
      sensitive: true,
      required: false,
    },
  },
  _meta: {
    'org.mpaktrust': {
      mtf_version: '0.1',
      permissions: { native: 'none' },
    },
  },
};

function input(over: Partial<ComposerInput> = {}): ComposerInput {
  return {
    pkg: {
      name: '@nimblebraininc/echo',
      latestVersion: '0.1.6',
      totalDownloads: BigInt(412),
      githubRepo: 'NimbleBrainInc/mcp-echo',
      ...over.pkg,
    },
    version: {
      version: '0.1.6',
      manifest: FULL_MANIFEST,
      publishedAt: new Date('2026-04-09T12:00:00Z'),
      publishMethod: 'oidc',
      provenance: { provider: 'github_oidc', repository: 'NimbleBrainInc/mcp-echo' },
      downloadCount: BigInt(6),
      ...over.version,
    },
    artifacts: over.artifacts ?? [
      {
        os: 'linux',
        arch: 'x64',
        digest: 'sha256:7352521191f69533f3e05fd905dea30ed43c329c930ee9840ccf9796a531f41b',
        sizeBytes: BigInt(17455747),
        sourceUrl: 'https://github.com/NimbleBrainInc/mcp-echo/releases/download/v0.1.6/x.mcpb',
        storagePath: '@nimblebraininc/echo/0.1.6/linux-x64.mcpb',
      },
    ],
    certification: over.certification ?? { level: 1, controlsPassed: 15, controlsFailed: 1, controlsTotal: 16 },
  };
}

describe('composeServerDetail', () => {
  it('projects every required field from the manifest', () => {
    const detail = composeServerDetail(input());
    expect(detail).not.toBeNull();
    // Mechanical reverse-DNS uses the curated org map for nimblebraininc.
    expect(detail?.name).toBe('ai.nimblebrain/echo');
    expect(detail?.title).toBe('Echo');
    expect(detail?.description).toBe('Echo server for testing and debugging MCP connections');
    expect(detail?.version).toBe('0.1.6');
    expect(detail?.websiteUrl).toBe('https://nimblebrain.ai');
    expect(detail?.repository?.url).toBe('https://github.com/NimbleBrainInc/mcp-echo');
    expect(detail?.repository?.source).toBe('github');
    expect(detail?.icons?.[0]?.src).toBe('https://static.nimblebrain.ai/icons/echo.png');
    expect(detail?.packages?.[0]?.identifier).toBe('@nimblebraininc/echo');
    expect(detail?.packages?.[0]?.transport).toEqual({ type: 'stdio' });
    expect(detail?.packages?.[0]?.environmentVariables?.[0]?.name).toBe('IPINFO_API_KEY');
    expect(detail?.packages?.[0]?.environmentVariables?.[0]?.isSecret).toBe(true);
  });

  it('carries author _meta verbatim and adds dev.mpak/registry meta', () => {
    const detail = composeServerDetail(input());
    expect(detail?._meta?.['org.mpaktrust']).toEqual({
      mtf_version: '0.1',
      permissions: { native: 'none' },
    });
    const mpakMeta = detail?._meta?.['dev.mpak/registry'] as Record<string, unknown>;
    expect(mpakMeta['npmName']).toBe('@nimblebraininc/echo');
    expect(mpakMeta['downloads']).toBe(412);
    expect(mpakMeta['published_at']).toBe('2026-04-09T12:00:00.000Z');
    expect(mpakMeta['publishMethod']).toBe('oidc');
    expect(mpakMeta['certification']).toEqual({
      level: 1,
      controlsPassed: 15,
      controlsFailed: 1,
      controlsTotal: 16,
    });
    expect(Array.isArray(mpakMeta['artifacts'])).toBe(true);
    expect((mpakMeta['artifacts'] as unknown[])[0]).toMatchObject({
      platform: { os: 'linux', arch: 'x64' },
      url: 'https://github.com/NimbleBrainInc/mcp-echo/releases/download/v0.1.6/x.mcpb',
      sha256: '7352521191f69533f3e05fd905dea30ed43c329c930ee9840ccf9796a531f41b',
      size: 17455747,
    });
  });

  it('honors author reverse-DNS name override at _meta["dev.mpak/registry"].name', () => {
    const m = {
      ...FULL_MANIFEST,
      _meta: { 'dev.mpak/registry': { name: 'com.acme/custom-name' } },
    };
    const detail = composeServerDetail(input({ version: { ...input().version, manifest: m } }));
    expect(detail?.name).toBe('com.acme/custom-name');
  });

  it('falls back to the npm name for title when display_name is missing', () => {
    const { display_name: _ignore, ...rest } = FULL_MANIFEST;
    const detail = composeServerDetail(input({ version: { ...input().version, manifest: rest } }));
    expect(detail?.title).toBe('@nimblebraininc/echo');
  });

  it('drops icons with non-http(s) schemes (XSS guard for downstream <img src>)', () => {
    const m = { ...FULL_MANIFEST, icon: 'javascript:alert(1)' };
    const detail = composeServerDetail(input({ version: { ...input().version, manifest: m } }));
    expect(detail?.icons).toBeUndefined();
  });

  it('truncates description longer than the upstream 100-char cap', () => {
    const long = 'x'.repeat(150);
    const m = { ...FULL_MANIFEST, description: long };
    const detail = composeServerDetail(input({ version: { ...input().version, manifest: m } }));
    expect(detail?.description.length).toBe(100);
    expect(detail?.description.endsWith('…')).toBe(true);
  });

  it('returns null when the manifest is too malformed to project (invalid name)', () => {
    // Mechanical reverse-DNS for a missing name would fail the upstream
    // pattern; ServerDetailSchema rejects, composer returns null.
    const m = { ...FULL_MANIFEST };
    const detail = composeServerDetail(
      input({
        pkg: {
          name: '',
          latestVersion: '0.1.6',
          totalDownloads: BigInt(0),
          githubRepo: null,
        },
        version: { ...input().version, manifest: m },
      }),
    );
    expect(detail).toBeNull();
  });

  it('composeServerDetailOrThrow throws on invalid input (loud failure for ingest path)', () => {
    expect(() =>
      composeServerDetailOrThrow(
        input({
          pkg: {
            name: '',
            latestVersion: '0.1.6',
            totalDownloads: BigInt(0),
            githubRepo: null,
          },
        }),
      ),
    ).toThrow();
  });

  it('handles bundles with no artifacts (single placeholder package entry)', () => {
    const detail = composeServerDetail(input({ artifacts: [] }));
    expect(detail?.packages?.length).toBe(1);
    expect(detail?.packages?.[0]?.identifier).toBe('@nimblebraininc/echo');
    expect(detail?.packages?.[0]?.fileSha256).toBeUndefined();
  });

  it('maps user_config to environmentVariables using the manifest env map', () => {
    const detail = composeServerDetail(input());
    const env = detail?.packages?.[0]?.environmentVariables;
    expect(env).toEqual([
      {
        name: 'IPINFO_API_KEY',
        description: 'IPInfo API token',
        isSecret: true,
        isRequired: false,
      },
    ]);
  });
});
