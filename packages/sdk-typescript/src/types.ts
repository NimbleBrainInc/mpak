/**
 * SDK-specific type definitions for mpak SDK
 *
 * API response types should be imported directly from @nimblebrain/mpak-schemas.
 * This file contains only SDK-specific types (client config).
 */

// Re-export input types from schemas — all fields optional (pre-default).
export type { BundleSearchParamsInput as BundleSearchParams } from '@nimblebrain/mpak-schemas';
export type { SkillSearchParamsInput as SkillSearchParams } from '@nimblebrain/mpak-schemas';

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
