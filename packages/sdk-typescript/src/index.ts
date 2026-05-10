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

// Facade — primary entry point
export { Mpak } from './mpakSDK.js';
export type {
  MpakOptions,
  PrepareServerSpec,
  PrepareServerOptions,
  ServerCommand,
} from './mpakSDK.js';

// Components (standalone use)
export { MpakConfigManager } from './config-manager.js';
export type { MpakConfigManagerOptions, PackageConfig } from './config-manager.js';
export { MpakBundleCache } from './cache.js';
export type { CacheInfo, LocalCacheEntry, MpakBundleCacheOptions, RegistryCacheEntry, UpdateCheckResult } from './cache.js';
export { MpakClient } from './client.js';
export type { MpakClientConfig, ServerSearchParams } from './types.js';

// Validation
export { validateMcpb } from './validate.js';
export type {
  McpbValidationResult,
  McpbValidationSuccess,
  McpbValidationFailure,
} from './validate.js';

// Utilities
export { parsePackageSpec } from './utils.js';
export { MAX_UNCOMPRESSED_SIZE, extractZip, isSemverEqual } from './helpers.js';
export type { ExtractZipOptions } from './helpers.js';

// Errors
export {
  MpakError,
  MpakNotFoundError,
  MpakIntegrityError,
  MpakNetworkError,
  MpakCacheCorruptedError,
  MpakConfigCorruptedError,
  MpakConfigError,
  MpakInvalidBundleError,
} from './errors.js';
