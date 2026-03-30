/**
 * SDK-specific type definitions for mpak SDK
 *
 * API response types should be imported directly from @nimblebrain/mpak-schemas.
 * This file contains only SDK-specific types (client config).
 */

// =============================================================================
// Search Params (SDK-specific: all fields optional for client-side use)
// =============================================================================

/**
 * Query parameters for bundle search.
 *
 * Note: The schema's BundleSearchParams uses z.default() which makes fields
 * required in the inferred output type. The SDK needs all-optional input types.
 */
export interface BundleSearchParams {
  q?: string;
  type?: string;
  sort?: 'downloads' | 'recent' | 'name';
  limit?: number;
  offset?: number;
}

/**
 * Query parameters for skill search.
 */
export interface SkillSearchParams {
  q?: string;
  tags?: string;
  category?: string;
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
