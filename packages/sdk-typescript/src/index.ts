/**
 * @nimblebrain/mpak-sdk
 *
 * TypeScript SDK for mpak registry - MCPB bundles and Agent Skills
 *
 * Requires Node.js 18+ for native fetch support.
 *
 * @example
 * ```typescript
 * import { MpakClient } from '@nimblebrain/mpak-sdk';
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
 * // Download skill content
 * const downloadInfo = await client.getSkillDownload('@nimblebraininc/folk-crm');
 * const content = await client.downloadSkillContent(downloadInfo);
 * console.log(content); // Skill markdown content
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
} from './types.js';

// Re-export SkillSearchResponse from schemas
export type { SkillSearchResponse } from '@nimblebrain/mpak-schemas';

// Common types
export type { Platform, Pagination, Provenance, Author } from './types.js';

// Errors
export { MpakError, MpakNotFoundError, MpakIntegrityError, MpakNetworkError } from './errors.js';
