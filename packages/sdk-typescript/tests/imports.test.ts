import { describe, it, expect } from 'vitest';

/**
 * Smoke test: verify all public exports resolve at import time.
 *
 * Catches the class of bug from NimbleBrainInc/mpak#77 where the SDK
 * was published against schema exports that didn't exist in the
 * released mpak-schemas package.
 */
describe('SDK exports resolve', () => {
  it('public API exports are defined', async () => {
    const sdk = await import('../src/index.js');

    expect(sdk.Mpak).toBeDefined();
    expect(sdk.MpakClient).toBeDefined();
    expect(sdk.MpakBundleCache).toBeDefined();
    expect(sdk.MpakConfigManager).toBeDefined();
    expect(sdk.parsePackageSpec).toBeDefined();

    // Error classes
    expect(sdk.MpakError).toBeDefined();
    expect(sdk.MpakNotFoundError).toBeDefined();
    expect(sdk.MpakIntegrityError).toBeDefined();
    expect(sdk.MpakNetworkError).toBeDefined();
    expect(sdk.MpakCacheCorruptedError).toBeDefined();
    expect(sdk.MpakConfigError).toBeDefined();
    expect(sdk.MpakInvalidBundleError).toBeDefined();
  });

  it('schemas dependency exports resolve', async () => {
    const schemas = await import('@nimblebrain/mpak-schemas');

    // These two were missing in mpak-schemas@0.1.0 (see #77)
    expect(schemas.CacheMetadataSchema).toBeDefined();
    expect(schemas.McpbManifestSchema).toBeDefined();
  });
});
