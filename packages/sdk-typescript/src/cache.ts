import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  CachedBundleInfo,
  CacheMetadata,
  DownloadInfo,
  McpbManifest,
} from '@nimblebrain/mpak-schemas';
import { CacheMetadataSchema, McpbManifestSchema } from '@nimblebrain/mpak-schemas';
import { MpakClient } from './client.js';
import { MpakCacheCorruptedError } from './errors.js';
import { extractZip, isSemverEqual, readJsonFromFile, UPDATE_CHECK_TTL_MS } from './helpers.js';

export interface MpakBundleCacheOptions {
  mpakHome?: string;
}

/**
 * Manages the local bundle cache (`~/.mpak/cache/`).
 *
 * Handles downloading, extracting, and tracking cached bundles.
 * The cache directory is derived from `mpakHome` — the root directory
 * for all mpak state. Consumers can wire this to `MpakConfigManager.mpakHome`
 * for a shared base, or pass any directory.
 *
 * Requires an `MpakClient` for registry operations (download, update checks).
 *
 * @example
 * ```ts
 * // Via MpakSDK facade (recommended)
 * const mpak = new MpakSDK();
 * await mpak.cache.loadBundle('@scope/name');
 *
 * // Standalone
 * const client = new MpakClient();
 * const cache = new MpakBundleCache(client, { mpakHome: '/path/to/.mpak' });
 * await cache.loadBundle('@scope/name');
 * ```
 */
export class MpakBundleCache {
  public readonly cacheHome: string;
  private readonly mpakClient: MpakClient;

  constructor(client: MpakClient, options?: MpakBundleCacheOptions) {
    this.mpakClient = client;

    this.cacheHome = join(options?.mpakHome ?? join(homedir(), '.mpak'), 'cache');
  }

  /**
   * Compute the cache path for a package. Does not create the directory.
   * @example getPackageCachePath('@scope/name') => '<cacheBase>/scope-name'
   */
  getBundleCacheDirName(packageName: string): string {
    const safeName = packageName.replace('@', '').replace('/', '-');
    return join(this.cacheHome, safeName);
  }

  /**
   * Read and validate cache metadata for a package.
   * Returns `null` if the package does not exist in the cache.
   * throws Error if metadata is corrupt
   */
  getBundleMetadata(packageName: string): CacheMetadata | null {
    const packageCacheDir = this.getBundleCacheDirName(packageName);

    if (!existsSync(packageCacheDir)) {
      return null;
    }

    const metaPath = join(packageCacheDir, '.mpak-meta.json');

    try {
      return readJsonFromFile(metaPath, CacheMetadataSchema);
    } catch (err) {
      throw new MpakCacheCorruptedError(
        err instanceof Error ? err.message : String(err),
        metaPath,
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Read and validate the MCPB manifest from a cached package.
   * Returns `null` if the package is not cached (directory doesn't exist).
   *
   * @throws {MpakCacheCorruptedError} If the cache directory exists but
   *   `manifest.json` is missing, contains invalid JSON, or fails schema validation.
   */
  getBundleManifest(packageName: string): McpbManifest | null {
    const dir = this.getBundleCacheDirName(packageName);

    if (!existsSync(dir)) {
      return null;
    }

    const manifestPath = join(dir, 'manifest.json');

    try {
      return readJsonFromFile(manifestPath, McpbManifestSchema);
    } catch (err) {
      throw new MpakCacheCorruptedError(
        err instanceof Error ? err.message : String(err),
        manifestPath,
        err instanceof Error ? err : undefined,
      );
    }
  }

  /**
   * Scan the cache directory and return metadata for every cached registry bundle.
   * Skips the `_local/` directory (local dev bundles) and entries with
   * missing/corrupt metadata or manifests.
   */
  listCachedBundles(): CachedBundleInfo[] {
    if (!existsSync(this.cacheHome)) return [];

    const entries = readdirSync(this.cacheHome, { withFileTypes: true });
    const bundles: CachedBundleInfo[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '_local') continue;

      const cacheDir = join(this.cacheHome, entry.name);
      try {
        const manifest = readJsonFromFile(join(cacheDir, 'manifest.json'), McpbManifestSchema);
        const meta = this.getBundleMetadata(manifest.name);
        if (!meta) continue;

        bundles.push({
          name: manifest.name,
          version: meta.version,
          pulledAt: meta.pulledAt,
          cacheDir: cacheDir,
        });
      } catch {
        // in case an entry is corrupted, it should not be listed
      }
    }

    return bundles;
  }

  /**
   * Remove a cached bundle from disk.
   * @returns `true` if the bundle was cached and removed, `false` if it wasn't cached.
   */
  removeCachedBundle(packageName: string): boolean {
    const dir = this.getBundleCacheDirName(packageName);
    if (!existsSync(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  }

  /**
   * Load a bundle into the local cache, downloading from the registry only
   * if the cache is missing or stale. Returns the cache directory and version.
   *
   * Requires an `MpakClient` to be provided at construction time.
   *
   * @param name - Scoped package name (e.g. `@scope/bundle`)
   * @param options.version - Specific version to load. Omit for "latest".
   * @param options.force - Skip cache checks and always re-download.
   *
   * @returns `cacheDir` — path to the extracted bundle on disk,
   *          `version` — the resolved version string,
   *          `pulled` — whether a download actually occurred.
   *
   * @throws If no `MpakClient` was provided at construction time.
   */
  async loadBundle(
    name: string,
    options?: { version?: string; force?: boolean },
  ): Promise<{ cacheDir: string; version: string; pulled: boolean }> {
    const { version: requestedVersion, force = false } = options ?? {};
    const cacheDir = this.getBundleCacheDirName(name);

    let cachedMeta: CacheMetadata | null = null;
    try {
      cachedMeta = this.getBundleMetadata(name);
    } catch {
      // Treat cache as non existent if cache is corrupt
    }

    /*
    We immediately return from cache when
    1. Not forced, AND
    2. Cache exists, AND
    3. Either no version requested, OR cached version matches requested version
    If any fails, we go to registry
    */

    if (
      !options?.force &&
      !!cachedMeta &&
      (!requestedVersion || isSemverEqual(cachedMeta.version, requestedVersion))
    ) {
      return { cacheDir, version: cachedMeta.version, pulled: false };
    }

    // Get download info from registry
    const platform = MpakClient.detectPlatform();
    const downloadInfo = await this.mpakClient.getBundleDownload(
      name,
      requestedVersion ?? 'latest',
      platform,
    );

    // Registry resolved to the same version we already have — skip download
    if (!force && cachedMeta && isSemverEqual(cachedMeta.version, downloadInfo.bundle.version)) {
      // Update lastCheckedAt since we just verified with the registry
      this.writeCacheMetadata(name, {
        ...cachedMeta,
        lastCheckedAt: new Date().toISOString(),
      });
      return { cacheDir, version: cachedMeta.version, pulled: false };
    }

    // Download and extract
    await this.downloadAndExtract(name, downloadInfo);
    return { cacheDir, version: downloadInfo.bundle.version, pulled: true };
  }

  /**
   * Fire-and-forget background check for bundle updates.
   * Return the latest version string if an update is available, null otherwise (not cached, skipped, up-to-date, or error).
   * The caller can just check `if (result) { console.log("update available: " + result) }`
   * @param packageName - Scoped package name (e.g. `@scope/bundle`)
   */
  async checkForUpdate(
    packageName: string,
    options?: { force?: boolean },
  ): Promise<string | null> {
    const cachedMeta = this.getBundleMetadata(packageName);
    if (!cachedMeta) return null;

    // Skip if checked within the TTL (unless force is set)
    if (!options?.force && cachedMeta.lastCheckedAt) {
      const elapsed = Date.now() - new Date(cachedMeta.lastCheckedAt).getTime();
      if (elapsed < UPDATE_CHECK_TTL_MS) return null;
    }

    try {
      const detail = await this.mpakClient.getBundle(packageName);

      // Update lastCheckedAt regardless of whether there's an update
      this.writeCacheMetadata(packageName, {
        ...cachedMeta,
        lastCheckedAt: new Date().toISOString(),
      });

      if (!isSemverEqual(detail.latest_version, cachedMeta.version)) {
        return detail.latest_version;
      }

      return null;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /**
   * Write cache metadata for a package.
   * @throws If the metadata fails schema validation.
   */
  private writeCacheMetadata(packageName: string, metadata: CacheMetadata): void {
    const metaPath = join(this.getBundleCacheDirName(packageName), '.mpak-meta.json');

    writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Download a bundle using pre-resolved download info, extract it into
   * the cache, and write metadata.
   */
  private async downloadAndExtract(name: string, downloadInfo: DownloadInfo): Promise<void> {
    const bundle = downloadInfo.bundle;
    const cacheDir = this.getBundleCacheDirName(name);

    // Download to temp file (using OS temp dir, not inside cache)
    const tempPath = join(tmpdir(), `mpak-${Date.now()}-${randomUUID().slice(0, 8)}.mcpb`);

    try {
      const data = await this.mpakClient.downloadContent(downloadInfo.url, bundle.sha256);
      writeFileSync(tempPath, data);

      // Clear old cache and extract
      if (existsSync(cacheDir)) {
        rmSync(cacheDir, { recursive: true, force: true });
      }

      extractZip(tempPath, cacheDir);

      // Write metadata
      this.writeCacheMetadata(name, {
        version: bundle.version,
        pulledAt: new Date().toISOString(),
        platform: bundle.platform,
      });
    } finally {
      rmSync(tempPath, { force: true });
    }
  }
}
