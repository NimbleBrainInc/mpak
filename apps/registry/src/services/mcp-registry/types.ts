/**
 * Shapes returned by a registry implementing the MCP Registry API.
 *
 * Only the fields ingest actually reads are modelled. The upstream schema
 * carries more (remotes, packageArguments, runtimeHint); anything not needed to
 * identify, fetch, and verify an MCPB artifact is intentionally left off so a
 * schema addition upstream is not a type error here.
 */

/** Package registry types the upstream schema allows. */
export type UpstreamRegistryType = 'npm' | 'pypi' | 'oci' | 'nuget' | 'mcpb' | 'cargo' | string;

export interface UpstreamPackage {
  registryType: UpstreamRegistryType;
  /** For `mcpb`, an absolute URL to the bundle file. */
  identifier: string;
  /**
   * Hex sha256 of the artifact. Every mcpb package upstream carries one; it is
   * the only integrity anchor available, since the upstream schema has no size
   * field.
   */
  fileSha256?: string;
  version?: string;
  transport?: { type?: string };
}

export interface UpstreamRepository {
  url?: string;
  source?: string;
}

export interface UpstreamServer {
  name: string;
  description?: string;
  title?: string;
  version?: string;
  websiteUrl?: string;
  repository?: UpstreamRepository;
  packages?: UpstreamPackage[];
  remotes?: unknown[];
}

export interface UpstreamOfficialMeta {
  status?: 'active' | 'deprecated' | 'deleted' | string;
  publishedAt?: string;
  updatedAt?: string;
  isLatest?: boolean;
}

export interface UpstreamServerEntry {
  server: UpstreamServer;
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: UpstreamOfficialMeta;
  };
}

export interface UpstreamListResponse {
  servers?: UpstreamServerEntry[];
  metadata?: {
    nextCursor?: string;
    count?: number;
  };
}

/** Read the official `_meta` block, which carries status and timestamps. */
export function officialMeta(entry: UpstreamServerEntry): UpstreamOfficialMeta {
  return entry._meta?.['io.modelcontextprotocol.registry/official'] ?? {};
}
