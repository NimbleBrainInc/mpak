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
export type { MpakOptions, PrepareServerOptions, ServerCommand } from './mpakSDK.js';

// Components (standalone use)
export { MpakConfigManager } from './config-manager.js';
export type { MpakConfigManagerOptions } from './config-manager.js';
export { MpakBundleCache } from './cache.js';
export type { MpakBundleCacheOptions } from './cache.js';
export { MpakClient } from './client.js';
export type { MpakClientConfig } from './types.js';

// Utilities
export { parsePackageSpec } from './utils.js';

// Errors
export {
  MpakError,
  MpakNotFoundError,
  MpakIntegrityError,
  MpakNetworkError,
  MpakCacheCorruptedError,
  MpakConfigCorruptedError,
  MpakConfigError,
} from './errors.js';
