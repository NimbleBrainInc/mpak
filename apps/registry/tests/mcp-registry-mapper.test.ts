/**
 * Mapping rules between an upstream MCP Registry server and mpak's catalog.
 *
 * These are the rules that decide what gets ingested at all, so the cases that
 * matter are the rejections: an unverifiable pointer or an ambiguous platform
 * must not become a catalog row.
 */

import { describe, expect, it } from 'vitest';
import {
  deriveNames,
  filenameFromUrl,
  githubSlug,
  inferPlatform,
  mapServer,
} from '../src/services/mcp-registry/mapper.js';
import type { UpstreamServerEntry } from '../src/services/mcp-registry/types.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function entry(overrides: Partial<UpstreamServerEntry['server']> = {}): UpstreamServerEntry {
  return {
    server: {
      name: 'io.github.acme/widget-mcp',
      version: '1.2.3',
      description: 'A widget server',
      repository: { url: 'https://github.com/acme/widget-mcp', source: 'github' },
      packages: [
        {
          registryType: 'mcpb',
          identifier: 'https://github.com/acme/widget-mcp/releases/download/v1.2.3/widget.mcpb',
          fileSha256: SHA_A,
          transport: { type: 'stdio' },
        },
      ],
      ...overrides,
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active',
        updatedAt: '2026-07-01T00:00:00Z',
        isLatest: true,
      },
    },
  };
}

describe('deriveNames', () => {
  it('offers the short handle the existing reverse-DNS lookup already guesses', () => {
    expect(deriveNames('io.github.acme/widget-mcp')?.preferred).toBe('@acme/widget-mcp');
  });

  it('offers a namespace-qualified fallback that survives a short-handle clash', () => {
    const a = deriveNames('io.github.acme/widget');
    const b = deriveNames('com.acme/widget');

    // The lossy short form collides across namespaces...
    expect(a?.preferred).toBe(b?.preferred);
    // ...which is exactly why the qualified form must not.
    expect(a?.qualified).not.toBe(b?.qualified);
  });

  it('lowercases, since mpak addresses packages as @scope/name in URLs', () => {
    expect(deriveNames('io.github.Servosity/Abnormal-MCP')?.preferred).toBe(
      '@servosity/abnormal-mcp',
    );
  });

  it('rejects a name with no namespace separator', () => {
    expect(deriveNames('not-a-reverse-dns-name')).toBeNull();
  });
});

describe('inferPlatform', () => {
  it.each([
    ['widget-darwin-arm64.mcpb', 'darwin', 'arm64'],
    ['widget-linux-x86_64.mcpb', 'linux', 'x64'],
    ['widget-windows-amd64.mcpb', 'win32', 'x64'],
    ['widget-macos-aarch64.mcpb', 'darwin', 'arm64'],
  ])('reads platform out of %s', (filename, os, arch) => {
    expect(inferPlatform(filename)).toEqual({ os, arch });
  });

  it('treats a bundle with no platform token as universal', () => {
    // The common case: interpreted servers ship one bundle for everything.
    expect(inferPlatform('widget.mcpb')).toEqual({ os: 'any', arch: 'any' });
  });

  it('honours an explicit universal claim over an incidental arch token', () => {
    expect(inferPlatform('widget-darwin-universal.mcpb')).toEqual({ os: 'darwin', arch: 'any' });
  });
});

describe('filenameFromUrl', () => {
  it('ignores query and fragment', () => {
    expect(filenameFromUrl('https://example.com/a/b/widget.mcpb?token=1#x')).toBe('widget.mcpb');
  });

  it('refuses a non-http scheme', () => {
    expect(filenameFromUrl('file:///etc/passwd')).toBeNull();
    expect(filenameFromUrl('not a url')).toBeNull();
  });
});

describe('githubSlug', () => {
  it('extracts owner/repo and drops a .git suffix', () => {
    expect(githubSlug('https://github.com/acme/widget-mcp.git')).toBe('acme/widget-mcp');
  });

  it('returns undefined for a non-GitHub host', () => {
    expect(githubSlug('https://gitlab.com/acme/widget')).toBeUndefined();
  });
});

describe('mapServer', () => {
  it('maps a well-formed server', () => {
    const result = mapServer(entry());

    expect(result.reason).toBeUndefined();
    expect(result.server?.upstreamName).toBe('io.github.acme/widget-mcp');
    expect(result.server?.githubRepo).toBe('acme/widget-mcp');
    expect(result.server?.artifacts).toHaveLength(1);
    expect(result.server?.artifacts[0]?.os).toBe('any');
  });

  it('ignores servers that ship no MCPB package', () => {
    const result = mapServer(
      entry({ packages: [{ registryType: 'npm', identifier: 'widget-mcp' }] }),
    );
    expect(result.reason).toBe('no-mcpb-package');
    expect(result.server).toBeUndefined();
  });

  it('refuses a bundle with no declared hash', () => {
    // Upstream never holds the bytes. Without a digest there is nothing to
    // verify a download against, and mirroring it would launder unknown
    // content into a registry whose entire claim is that it checked.
    const result = mapServer(
      entry({
        packages: [
          {
            registryType: 'mcpb',
            identifier: 'https://github.com/acme/w/releases/download/v1/w.mcpb',
          },
        ],
      }),
    );
    expect(result.reason).toBe('missing-sha256');
  });

  it('refuses a malformed hash rather than trusting it', () => {
    const result = mapServer(
      entry({
        packages: [
          {
            registryType: 'mcpb',
            identifier: 'https://github.com/acme/w/releases/download/v1/w.mcpb',
            fileSha256: 'not-a-sha',
          },
        ],
      }),
    );
    expect(result.reason).toBe('missing-sha256');
  });

  it('refuses two bundles claiming the same platform', () => {
    // Artifacts are keyed by platform; picking one arbitrarily would make the
    // catalog depend on upstream array order.
    const result = mapServer(
      entry({
        packages: [
          {
            registryType: 'mcpb',
            identifier: 'https://github.com/acme/w/releases/download/v1/w.mcpb',
            fileSha256: SHA_A,
          },
          {
            registryType: 'mcpb',
            identifier: 'https://github.com/acme/w/releases/download/v1/w2.mcpb',
            fileSha256: SHA_B,
          },
        ],
      }),
    );
    expect(result.reason).toBe('duplicate-platform');
  });

  it('keeps a multi-platform matrix distinct', () => {
    const result = mapServer(
      entry({
        packages: [
          {
            registryType: 'mcpb',
            identifier: 'https://github.com/acme/w/releases/download/v1/w-darwin-arm64.mcpb',
            fileSha256: SHA_A,
          },
          {
            registryType: 'mcpb',
            identifier: 'https://github.com/acme/w/releases/download/v1/w-linux-x64.mcpb',
            fileSha256: SHA_B,
          },
        ],
      }),
    );
    expect(result.server?.artifacts.map((a) => `${a.os}/${a.arch}`)).toEqual([
      'darwin/arm64',
      'linux/x64',
    ]);
  });

  it('refuses a server with no version', () => {
    expect(mapServer(entry({ version: undefined })).reason).toBe('no-version');
  });

  it('carries upstream status through so takedowns can propagate', () => {
    const e = entry();
    e._meta = {
      'io.modelcontextprotocol.registry/official': {
        status: 'deleted',
        updatedAt: '2026-07-02T00:00:00Z',
      },
    };
    expect(mapServer(e).server?.status).toBe('deleted');
  });
});
