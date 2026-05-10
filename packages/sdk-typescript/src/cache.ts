import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import { dirSizeBytes, extractZip, isSemverEqual, readJsonFromFile, UPDATE_CHECK_TTL_MS } from './helpers.js';

export type UpdateCheckResult =
  | { status: 'up-to-date' }
  | { status: 'update-available'; latestVersion: string }
  | { status: 'check-failed'; reason: string };

export interface RegistryCacheEntry {
  name: string;
  version: string;
  pulledAt: string;
  bytes: number;
}

export interface LocalCacheEntry {
  hash: string;
  localPath: string;
  extractedAt: string;
  bytes: number;
}

export interface CacheInfo {
  registryBundles: RegistryCacheEntry[];
  localBundles: LocalCacheEntry[];
  totalBytes: number;
}

export interface MpakBundleCacheOptions {
  mpakHome?: string;
  /**
   * Maximum allowed uncompressed size (bytes) for any bundle this cache
   * extracts. Defaults to {@link MAX_UNCOMPRESSED_SIZE}.
   */
  maxUncompressedSize?: number;
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
  public readonly maxUncompressedSize: number | undefined;
  private readonly mpakClient: MpakClient;

  constructor(client: MpakClient, options?: MpakBundleCacheOptions) {
    this.mpakClient = client;

    this.cacheHome = join(options?.mpakHome ?? join(homedir(), '.mpak'), 'cache');
    this.maxUncompressedSize = options?.maxUncompressedSize;
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
   * Evict all `_local/` entries for the same bundle name except the current one.
   * Called after a local bundle is prepared so stale entries from previous path-keyed
   * extractions (e.g. v0.1.0 → v0.1.1 renames) don't accumulate on disk.
   */
  evictOtherLocalBundles(bundleName: string, currentHash: string): void {
    const localDir = join(this.cacheHome, '_local');
    if (!existsSync(localDir)) return;

    for (const entry of readdirSync(localDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === currentHash) continue;
      try {
        const manifest = readJsonFromFile(
          join(localDir, entry.name, 'manifest.json'),
          McpbManifestSchema,
        );
        if (manifest.name === bundleName) {
          rmSync(join(localDir, entry.name), { recursive: true, force: true });
        }
      } catch {
        // corrupt or missing manifest — skip
      }
    }
  }

  /**
   * Return a snapshot of everything in the cache: registry bundles, local bundles,
   * and their disk usage. Skips entries with missing or corrupt metadata.
   */
  getCacheInfo(): CacheInfo {
    const registryBundles: RegistryCacheEntry[] = [];
    const localBundles: LocalCacheEntry[] = [];

    for (const bundle of this.listCachedBundles()) {
      registryBundles.push({
        name: bundle.name,
        version: bundle.version,
        pulledAt: bundle.pulledAt,
        bytes: dirSizeBytes(bundle.cacheDir),
      });
    }

    const localDir = join(this.cacheHome, '_local');
    if (existsSync(localDir)) {
      for (const entry of readdirSync(localDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const entryDir = join(localDir, entry.name);
        try {
          const raw = JSON.parse(readFileSync(join(entryDir, '.mpak-local-meta.json'), 'utf8')) as {
            localPath?: string;
            extractedAt?: string;
          };
          if (!raw.localPath || !raw.extractedAt) continue;
          localBundles.push({
            hash: entry.name,
            localPath: raw.localPath,
            extractedAt: raw.extractedAt,
            bytes: dirSizeBytes(entryDir),
          });
        } catch {
          // corrupt or missing meta — skip
        }
      }
    }

    const totalBytes =
      registryBundles.reduce((s, b) => s + b.bytes, 0) +
      localBundles.reduce((s, b) => s + b.bytes, 0);

    return { registryBundles, localBundles, totalBytes };
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
    const platform = MpakClient.detectPlatform();

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
      cachedMeta.platform.os === platform.os &&
      cachedMeta.platform.arch === platform.arch &&
      (!requestedVersion || isSemverEqual(cachedMeta.version, requestedVersion))
    ) {
      return { cacheDir, version: cachedMeta.version, pulled: false };
    }

    // Get download info from registry
    const downloadInfo = await this.mpakClient.getBundleDownload(
      name,
      requestedVersion ?? 'latest',
      platform,
    );

    // Registry resolved to the same version we already have — skip download
    if (
      !force &&
      cachedMeta &&
      cachedMeta.platform.os === platform.os &&
      cachedMeta.platform.arch === platform.arch &&
      isSemverEqual(cachedMeta.version, downloadInfo.bundle.version)
    ) {
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
   * Check whether a newer version of a cached bundle is available in the registry.
   *
   * Returns a discriminated union so callers can distinguish "up to date",
   * "update available", and "check failed" — unlike a `string | null` return
   * where `null` is ambiguous between "up to date" and "network error".
   *
   * @param packageName - Scoped package name (e.g. `@scope/bundle`)
   */
  async checkForUpdate(
    packageName: string,
    options?: { force?: boolean },
  ): Promise<UpdateCheckResult> {
    try {
      const cachedMeta = this.getBundleMetadata(packageName);
      if (!cachedMeta) return { status: 'up-to-date' };

      // Skip if checked within the TTL (unless force is set)
      if (!options?.force && cachedMeta.lastCheckedAt) {
        const elapsed = Date.now() - new Date(cachedMeta.lastCheckedAt).getTime();
        if (elapsed < UPDATE_CHECK_TTL_MS) return { status: 'up-to-date' };
      }

      const detail = await this.mpakClient.getBundle(packageName);

      // Update lastCheckedAt regardless of whether there's an update
      this.writeCacheMetadata(packageName, {
        ...cachedMeta,
        lastCheckedAt: new Date().toISOString(),
      });

      if (!isSemverEqual(detail.latest_version, cachedMeta.version)) {
        return { status: 'update-available', latestVersion: detail.latest_version };
      }

      return { status: 'up-to-date' };
    } catch (err) {
      return {
        status: 'check-failed',
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Extract pre-downloaded bundle bytes into the cache.
   * Use this when bytes are already in memory (e.g. after `bundle pull`) to
   * avoid a second download.
   */
  async extractBundle(
    name: string,
    data: Uint8Array,
    bundle: DownloadInfo['bundle'],
  ): Promise<void> {
    const cacheDir = this.getBundleCacheDirName(name);
    const tempPath = join(tmpdir(), `mpak-${Date.now()}-${randomUUID().slice(0, 8)}.mcpb`);

    try {
      writeFileSync(tempPath, data);

      if (existsSync(cacheDir)) {
        rmSync(cacheDir, { recursive: true, force: true });
      }

      await extractZip(tempPath, cacheDir, this.extractOptions());

      this.writeCacheMetadata(name, {
        version: bundle.version,
        pulledAt: new Date().toISOString(),
        platform: bundle.platform,
      });
    } finally {
      rmSync(tempPath, { force: true });
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

      await extractZip(tempPath, cacheDir, this.extractOptions());

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

  /** Options threaded into every `extractZip` call. */
  extractOptions(): { maxUncompressedSize?: number } {
    return this.maxUncompressedSize !== undefined
      ? { maxUncompressedSize: this.maxUncompressedSize }
      : {};
  }
}
