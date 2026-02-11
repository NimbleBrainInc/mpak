// Auth types
export interface AuthenticatedUser {
  userId: string;
  email: string;
  emailVerified: boolean;
  githubUsername?: string; // GitHub username from OAuth
  metadata: {
    verified?: boolean;
    publishedBundles?: number;
    totalDownloads?: number;
    role?: string;
  };
}

// Bundle manifest types (MCPB v0.2 spec)
export interface MCPBManifest {
  name: string;
  version: string;
  display_name?: string;
  description?: string;
  author?: {
    name: string;
    email?: string;
    url?: string;
  };
  homepage?: string;
  license?: string;
  icon?: string;
  repository?: {
    type?: string;
    url?: string;
  };
  server_type: 'node' | 'python' | 'binary';
  platforms?: {
    [platform: string]: {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    };
  };
  tools?: Array<{
    name: string;
    description?: string;
  }>;
  prompts?: Array<{
    name: string;
    description?: string;
  }>;
  resources?: Array<{
    name: string;
    description?: string;
  }>;
}

// Database models
export interface RegistryPackage {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  author_name: string | null;
  author_email: string | null;
  author_url: string | null;
  homepage: string | null;
  license: string | null;
  icon_url: string | null;
  server_type: 'node' | 'python' | 'binary';
  verified: boolean;
  latest_version: string;
  total_downloads: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface PackageVersion {
  id: string;
  package_id: string;
  version: string;
  manifest: MCPBManifest;
  sha256: string;
  size_bytes: number;
  storage_path: string;
  download_count: number;
  published_by: string;
  published_by_email: string;
  published_at: Date;
}

// API response types - now imported from schemas
export type {
  Package as PackageListItem,
  PackageDetail as PackageInfo,
} from './schemas/generated/api-responses.js';

// API query params - now imported from schemas
export type { PackageSearchParams } from './schemas/generated/package.js';

// MCP Registry types
export interface MCPServerDetail {
  name: string;
  version: string;
  title?: string;
  description: string;
  icons?: Array<{ uri: string; mimeType?: string }>;
  packages?: unknown[];
  remotes?: unknown[];
  repository?: { url: string; source?: string };
  websiteUrl?: string;
  _meta?: Record<string, unknown>;
}

export interface MCPServerListResponse {
  servers: MCPServerDetail[];
  metadata?: {
    next_cursor?: string;
    count?: number;
  };
}

export interface MCPRegistryMetadata {
  serverId: string;
  versionId: string;
  publishedAt: string;
  updatedAt: string;
  isLatest: boolean;
}
