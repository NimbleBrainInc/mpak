/**
 * Upstream registry client: pagination and the loop guards.
 *
 * The client walks an unbounded upstream catalog on a schedule with no operator
 * watching, so the cases worth pinning are the ones where a misbehaving
 * upstream would otherwise spin it forever.
 */

import { describe, expect, it, vi } from 'vitest';
import { McpRegistryClient, RegistryRequestError } from '../src/services/mcp-registry/client.js';
import type { UpstreamServerEntry } from '../src/services/mcp-registry/types.js';

function server(name: string): UpstreamServerEntry {
  return { server: { name, version: '1.0.0' } };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function collect(gen: AsyncGenerator<UpstreamServerEntry>): Promise<string[]> {
  const out: string[] = [];
  for await (const e of gen) out.push(e.server.name);
  return out;
}

describe('McpRegistryClient.listServers', () => {
  it('follows the cursor to the end', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ servers: [server('a/one')], metadata: { nextCursor: 'c1' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ servers: [server('a/two')], metadata: {} }));

    const client = new McpRegistryClient({ baseUrl: 'https://reg.test/v0', fetchImpl });

    expect(await collect(client.listServers())).toEqual(['a/one', 'a/two']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('passes updated_since and version=latest for an incremental run', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ servers: [], metadata: {} }));
    const client = new McpRegistryClient({ baseUrl: 'https://reg.test/v0', fetchImpl });

    await collect(
      client.listServers({ updatedSince: new Date('2026-07-01T00:00:00Z'), version: 'latest' }),
    );

    const url = new URL(fetchImpl.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get('updated_since')).toBe('2026-07-01T00:00:00.000Z');
    expect(url.searchParams.get('version')).toBe('latest');
  });

  it('throws when upstream repeats a cursor rather than truncating the run', async () => {
    // A repeated cursor is upstream malfunctioning, not end-of-catalog. Ending
    // quietly would truncate the walk and let the caller advance its watermark
    // past servers it never read. A fresh Response per call because a body can
    // only be read once.
    const fetchImpl = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse({ servers: [server('a/stuck')], metadata: { nextCursor: 'same' } }),
        ),
      );
    const client = new McpRegistryClient({ baseUrl: 'https://reg.test/v0', fetchImpl });

    await expect(collect(client.listServers())).rejects.toThrow(/repeated pagination cursor/);
  });

  it('gives up once maxPages is exhausted rather than paging indefinitely', async () => {
    let n = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      n += 1;
      return Promise.resolve(
        jsonResponse({ servers: [server(`a/s${n}`)], metadata: { nextCursor: `c${n}` } }),
      );
    });
    const client = new McpRegistryClient({
      baseUrl: 'https://reg.test/v0',
      fetchImpl,
      maxPages: 3,
    });

    await expect(collect(client.listServers())).rejects.toThrow(RegistryRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('surfaces an upstream error status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));
    const client = new McpRegistryClient({ baseUrl: 'https://reg.test/v0', fetchImpl });

    await expect(collect(client.listServers())).rejects.toThrow(/503/);
  });

  it('skips entries with no name rather than yielding a nameless server', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        servers: [{ server: {} }, server('a/real')],
        metadata: {},
      }),
    );
    const client = new McpRegistryClient({ baseUrl: 'https://reg.test/v0', fetchImpl });

    expect(await collect(client.listServers())).toEqual(['a/real']);
  });
});
