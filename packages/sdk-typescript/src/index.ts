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
 * // Download a bundle (latest version, auto-detected platform)
 * const { data, metadata } = await client.downloadBundle('@nimbletools/echo');
 *
 * // Download a skill bundle
 * const { data, metadata } = await client.downloadSkillBundle('@nimblebraininc/folk-crm');
 * ```
 */

export { MpakClient } from './client.js';

// Configuration
export type { MpakClientConfig } from './types.js';

// Errors
export { MpakError, MpakNotFoundError, MpakIntegrityError, MpakNetworkError } from './errors.js';
