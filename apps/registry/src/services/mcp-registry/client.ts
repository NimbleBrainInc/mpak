/**
 * Client for the upstream MCP Registry API.
 *
 * The upstream registry is a metaregistry: it serves metadata and points at
 * package registries for bytes. This client only walks the metadata. Fetching
 * and verifying the referenced artifact is the ingest pipeline's job.
 */

import type { UpstreamListResponse, UpstreamServerEntry } from './types.js';

export interface RegistryClientOptions {
  baseUrl: string;
  /** Page size for list calls. Upstream caps this; 100 is the documented max. */
  pageSize?: number;
  /** Guard against an upstream cursor that never terminates. */
  maxPages?: number;
  requestTimeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}

export interface ListServersParams {
  /**
   * RFC3339 lower bound. Upstream flips `include_deleted` on automatically when
   * this is set, which is what lets an incremental run observe takedowns rather
   * than silently retaining a server that upstream removed.
   */
  updatedSince?: Date;
  /** `latest` collapses a server's version history to its current version. */
  version?: 'latest';
}

export class RegistryRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly url?: string,
  ) {
    super(message);
    this.name = 'RegistryRequestError';
  }
}

export class McpRegistryClient {
  private readonly baseUrl: string;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly requestTimeoutMs: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RegistryClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.pageSize = options.pageSize ?? 100;
    this.maxPages = options.maxPages ?? 1000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.userAgent = options.userAgent ?? 'mpak-registry-ingest/1.0';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Walk every page of `/servers`, yielding entries as they arrive.
   *
   * A generator rather than a materialised array: the full upstream catalog is
   * tens of thousands of entries, and the caller discards all but the MCPB ones.
   * Streaming keeps peak memory flat and lets the pipeline start work on page 1
   * instead of after page 200.
   */
  async *listServers(params: ListServersParams = {}): AsyncGenerator<UpstreamServerEntry> {
    let cursor: string | undefined;
    let pages = 0;

    do {
      const url = new URL(`${this.baseUrl}/servers`);
      url.searchParams.set('limit', String(this.pageSize));
      if (params.version) url.searchParams.set('version', params.version);
      if (params.updatedSince) {
        url.searchParams.set('updated_since', params.updatedSince.toISOString());
      }
      if (cursor) url.searchParams.set('cursor', cursor);

      const body = await this.getJson<UpstreamListResponse>(url.toString());

      for (const entry of body.servers ?? []) {
        if (entry?.server?.name) yield entry;
      }

      const next = body.metadata?.nextCursor;
      // Upstream signals the end with an absent or empty cursor. Treating a
      // repeat of the current cursor as terminal too, so a server-side bug
      // cannot spin this loop forever.
      cursor = next && next !== cursor ? next : undefined;
      pages += 1;
    } while (cursor && pages < this.maxPages);

    if (cursor) {
      throw new RegistryRequestError(
        `Pagination exceeded maxPages (${this.maxPages}); refusing to continue`,
      );
    }
  }

  private async getJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': this.userAgent },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new RegistryRequestError(
          `Registry request failed: ${response.status} ${response.statusText}`,
          response.status,
          url,
        );
      }

      return (await response.json()) as T;
    } catch (err) {
      if (err instanceof RegistryRequestError) throw err;
      throw new RegistryRequestError(
        `Registry request failed: ${err instanceof Error ? err.message : String(err)}`,
        undefined,
        url,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
