/**
 * @nimblebrain/mpak-sdk
 *
 * TypeScript SDK for mpak registry - MCPB bundles and Agent Skills
 *
 * @example
 * ```typescript
 * import { MpakSDK } from '@nimblebrain/mpak-sdk';
 *
 * const mpak = new MpakSDK();
 *
 * // Search for bundles
 * const bundles = await mpak.client.searchBundles({ q: 'mcp' });
 *
 * // Load a bundle into cache
 * const result = await mpak.cache.loadBundle('@scope/name');
 * ```
 */

// Facade — primary entry point
export { MpakSDK } from './MpakSDK.js';
export type { MpakSDKOptions, PrepareServerOptions, ServerCommand } from './MpakSDK.js';

// Components (standalone use)
// MpakConfigManager
export { MpakConfigManager } from './config-manager.js';
export type { MpakConfigManagerOptions } from './config-manager.js';
//

// Types consumers may need
export type { MpakClientConfig } from './types.js';
export type { McpbManifest, UserConfigField } from './cache.js';
export type { MpakConfig, PackageConfig } from './config-manager.js';

// Errors
export {
  MpakError,
  MpakNotFoundError,
  MpakIntegrityError,
  MpakNetworkError,
  MpakConfigCorruptedError,
  MpakConfigError,
} from './errors.js';
