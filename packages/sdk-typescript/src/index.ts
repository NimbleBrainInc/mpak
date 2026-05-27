/**
 * @nimblebrain/mpak-sdk
 *
 * TypeScript SDK for mpak registry - MCPB bundles and Agent Skills
 *
 * @example
 * ```typescript
 * import { Mpak } from '@nimblebrain/mpak-sdk';
 *
 * const mpak = new Mpak();
 *
 * // Search for bundles
 * const bundles = await mpak.client.searchBundles({ q: 'mcp' });
 *
 * // Load a bundle into cache
 * const result = await mpak.bundleCache.loadBundle('@scope/name');
 * ```
 */

export type { MpakBundleCacheOptions } from './cache.js';
export { MpakBundleCache } from './cache.js';
export { MpakClient } from './client.js';
export type { MpakConfigManagerOptions, PackageConfig } from './config-manager.js';
// Components (standalone use)
export { MpakConfigManager } from './config-manager.js';
// Errors
export {
  MpakCacheCorruptedError,
  MpakConfigCorruptedError,
  MpakConfigError,
  MpakError,
  MpakIntegrityError,
  MpakInvalidBundleError,
  MpakNetworkError,
  MpakNotFoundError,
} from './errors.js';
export type { ExtractZipOptions } from './helpers.js';
export { extractZip, isSemverEqual, MAX_UNCOMPRESSED_SIZE } from './helpers.js';
export type {
  MpakOptions,
  PrepareServerOptions,
  PrepareServerSpec,
  ServerCommand,
} from './mpakSDK.js';
// Facade — primary entry point
export { Mpak } from './mpakSDK.js';
export type { MpakClientConfig, ServerSearchParams } from './types.js';
// Utilities
export { parsePackageSpec } from './utils.js';
export type {
  McpbValidationFailure,
  McpbValidationResult,
  McpbValidationSuccess,
} from './validate.js';
// Validation
export { validateMcpb } from './validate.js';
