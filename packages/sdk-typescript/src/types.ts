/**
 * SDK-specific type definitions for mpak SDK
 *
 * API response types are re-exported from @nimblebrain/mpak-schemas.
 * This file contains SDK-specific types (client config, skill references, etc.)
 */

import type {
  BundleSearchResponse,
  BundleDetail,
  VersionsResponse,
  VersionDetail,
  DownloadInfo,
  SkillSearchResponse,
  SkillDetail,
  SkillDownloadInfo,
  PlatformInfo,
  Pagination,
  FullProvenance,
  Bundle,
  SkillSummary,
} from '@nimblebrain/mpak-schemas';

// =============================================================================
// Re-exports from @nimblebrain/mpak-schemas
// =============================================================================

/** Response from bundle search endpoint */
export type { BundleSearchResponse };

/** Full bundle detail */
export type { BundleDetail as BundleDetailResponse };

/** Bundle versions listing */
export type { VersionsResponse as BundleVersionsResponse };

/** Single version detail */
export type { VersionDetail as BundleVersionResponse };

/** Bundle download info */
export type { DownloadInfo as BundleDownloadResponse };

/** Skill search response */
export type { SkillSearchResponse };

/** Skill detail response */
export type { SkillDetail as SkillDetailResponse };

/** Skill download info */
export type { SkillDownloadInfo as SkillDownloadResponse };

/** Bundle summary in search results */
export type { Bundle };

/** Bundle detail alias */
export type { BundleDetail };

/** Version in versions listing */
export type BundleVersion = VersionsResponse['versions'][number];

/** Artifact in version detail */
export type BundleArtifact = VersionDetail['artifacts'][number];

/** Download info alias */
export type BundleDownloadInfo = DownloadInfo;

/** Skill summary in search results */
export type Skill = SkillSummary;

/** Skill detail alias */
export type { SkillDetail };

/** Skill download info alias */
export type { SkillDownloadInfo };

/** Skill version in detail */
export type SkillVersion = SkillDetail['versions'][number];

// =============================================================================
// Common Types
// =============================================================================

/** Platform identifier (os + arch) */
export type Platform = PlatformInfo;

/** Pagination info returned by search endpoints */
export type { Pagination };

/** Provenance information for verified packages */
export type Provenance = FullProvenance;

/** Author information */
export interface Author {
  name: string;
  url?: string;
  email?: string;
}

// =============================================================================
// Search Params
// =============================================================================

/** Query parameters for bundle search */
export interface BundleSearchParams {
  q?: string;
  type?: string;
  sort?: 'downloads' | 'recent' | 'name';
  limit?: number;
  offset?: number;
}

/** Query parameters for skill search */
export interface SkillSearchParams {
  q?: string;
  tags?: string;
  category?: string;
  surface?: string;
  sort?: 'downloads' | 'recent' | 'name';
  limit?: number;
  offset?: number;
}

// =============================================================================
// Client Configuration
// =============================================================================

/**
 * Configuration options for MpakClient
 */
export interface MpakClientConfig {
  /**
   * Base URL for the mpak registry API
   * @default 'https://registry.mpak.dev'
   */
  registryUrl?: string;

  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;

  /**
   * User-Agent string sent with every request
   * @example 'mpak-cli/0.2.0'
   */
  userAgent?: string;
}

// =============================================================================
// Skill Reference Types (for resolveSkillRef)
// =============================================================================

/**
 * Base fields shared by all skill reference types
 */
interface SkillReferenceBase {
  /** Skill artifact identifier (e.g., '@nimbletools/folk-crm') */
  name: string;
  /** Semver version (e.g., '1.0.0') or 'latest' */
  version: string;
  /** SHA256 integrity hash (format: 'sha256-hexdigest') */
  integrity?: string;
}

/**
 * Skill reference from mpak registry
 */
export interface MpakSkillReference extends SkillReferenceBase {
  source: 'mpak';
}

/**
 * Skill reference from GitHub repository
 */
export interface GithubSkillReference extends SkillReferenceBase {
  source: 'github';
  /** GitHub repository (owner/repo) */
  repo: string;
  /** Path to skill file in repo */
  path: string;
}

/**
 * Skill reference from direct URL
 */
export interface UrlSkillReference extends SkillReferenceBase {
  source: 'url';
  /** Direct download URL */
  url: string;
}

/**
 * Discriminated union of skill reference types
 */
export type SkillReference = MpakSkillReference | GithubSkillReference | UrlSkillReference;

/**
 * Result of resolving a skill reference
 */
export interface ResolvedSkill {
  /** The markdown content of the skill */
  content: string;
  /** Version that was resolved */
  version: string;
  /** Source the skill was fetched from */
  source: 'mpak' | 'github' | 'url';
  /** Whether integrity was verified */
  verified: boolean;
}
