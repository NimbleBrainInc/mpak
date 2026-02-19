/**
 * @nimblebrain/mpak-sdk
 *
 * TypeScript SDK for mpak registry - MCPB bundles and Agent Skills
 *
 * Requires Node.js 18+ for native fetch support.
 *
 * @example
 * ```typescript
 * import { MpakClient, SkillReference } from '@nimblebrain/mpak-sdk';
 *
 * const client = new MpakClient();
 *
 * // Search for bundles
 * const bundles = await client.searchBundles({ q: 'mcp' });
 *
 * // Get bundle details
 * const bundle = await client.getBundle('@nimbletools/echo');
 *
 * // Search for skills
 * const skills = await client.searchSkills({ q: 'crm' });
 *
 * // Resolve a skill reference to content (recommended)
 * const ref: SkillReference = {
 *   source: 'mpak',
 *   name: '@nimblebraininc/folk-crm',
 *   version: '1.3.0',
 * };
 * const resolved = await client.resolveSkillRef(ref);
 * console.log(resolved.content); // Skill markdown content
 * ```
 */

export { MpakClient } from './client.js';

// Configuration
export type { MpakClientConfig } from './types.js';

// Bundle types
export type {
  BundleSearchParams,
  BundleDetailResponse,
  BundleVersionsResponse,
  BundleVersionResponse,
  BundleDownloadResponse,
  Bundle,
  BundleDetail,
  BundleVersion,
  BundleArtifact,
  BundleDownloadInfo,
} from './types.js';

// Re-export BundleSearchResponse from schemas
export type { BundleSearchResponse } from '@nimblebrain/mpak-schemas';

// Skill types
export type {
  SkillSearchParams,
  SkillDetailResponse,
  SkillDownloadResponse,
  Skill,
  SkillDetail,
  SkillDownloadInfo,
  SkillVersion,
  // Skill reference types (for resolveSkillRef)
  SkillReference,
  MpakSkillReference,
  GithubSkillReference,
  UrlSkillReference,
  ResolvedSkill,
} from './types.js';

// Re-export SkillSearchResponse from schemas
export type { SkillSearchResponse } from '@nimblebrain/mpak-schemas';

// Common types
export type { Platform, Pagination, Provenance, Author } from './types.js';

// Errors
export { MpakError, MpakNotFoundError, MpakIntegrityError, MpakNetworkError } from './errors.js';
