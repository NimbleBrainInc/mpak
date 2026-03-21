import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { CacheMetadata, DownloadInfo } from "@nimblebrain/mpak-schemas";
import { CacheMetadataSchema } from "@nimblebrain/mpak-schemas";
import { MpakClient } from "./client.js";

/**
 * Manages the local bundle cache (`~/.mpak/cache/`).
 *
 * Handles downloading, extracting, and tracking cached bundles.
 * The cache directory is derived from `mpakHome` — the root directory
 * for all mpak state. Consumers can wire this to `ConfigManager.mpakHome`
 * for a shared base, or pass any directory.
 *
 * @param mpakHome - Root directory for mpak state. Defaults to `~/.mpak`.
 *
 * @example
 * ```ts
 * // Standalone usage (local-only operations)
 * const cache = new BundleCache();
 *
 * // With client for registry operations
 * const cache = new BundleCache({ client: new MpakClient() });
 *
 * // Wired via Mpak facade (recommended)
 * const mpak = new Mpak();
 * mpak.cache.loadBundle('@scope/name');
 * ```
 */
export class BundleCache {
	private readonly cacheBase: string;
	private readonly client: MpakClient | undefined;
	private logger: ((msg: string) => void);

	constructor(options?: { mpakHome?: string; client?: MpakClient; logger?: (msg: string) => void }) {
		this.cacheBase = join(options?.mpakHome ?? join(homedir(), ".mpak"), "cache");
		this.client = options?.client;
		this.logger = options?.logger ?? ((msg: string) => process.stderr.write(msg));
	}

	/**
	 * Get the client, throwing if not provided.
	 * @throws If no client was provided at construction time.
	 */
	private requireClient(): MpakClient {
		if (!this.client) {
			throw new Error("MpakClient required for registry operations. Pass { client } in the BundleCache constructor.");
		}
		return this.client;
	}

	/**
	 * Compute the cache path for a package. Does not create the directory.
	 * @example getPackageCachePath('@scope/name') => '<cacheBase>/scope-name'
	 */
	getPackageCachePath(packageName: string): string {
		const safeName = packageName.replace("@", "").replace("/", "-");
		return join(this.cacheBase, safeName);
	}

	/**
	 * Read and validate cache metadata for a package.
	 * Returns `null` if the metadata file doesn't exist or fails validation.
	 */
	getCacheMetadata(packageName: string): CacheMetadata | null {
		return this.readMetadataFromDir(this.getPackageCachePath(packageName));
	}

	/**
	 * Write cache metadata for a package.
	 * @throws If the metadata fails schema validation.
	 */
	writeCacheMetadata(packageName: string, metadata: CacheMetadata): void {
		const result = CacheMetadataSchema.safeParse(metadata);
		if (!result.success) {
			throw new Error(
				`Invalid cache metadata: ${result.error.issues[0]?.message ?? "unknown error"}`,
			);
		}
		const metaPath = join(
			this.getPackageCachePath(packageName),
			".mpak-meta.json",
		);
		writeFileSync(metaPath, JSON.stringify(result.data, null, 2));
	}

	/**
	 * Scan the cache directory and return metadata for every cached registry bundle.
	 * Skips the `_local/` directory (local dev bundles) and entries with
	 * missing/corrupt metadata or manifests.
	 */
	listCachedBundles(): CachedBundle[] {
		if (!existsSync(this.cacheBase)) return [];

		const entries = readdirSync(this.cacheBase, { withFileTypes: true });
		const bundles: CachedBundle[] = [];

		for (const entry of entries) {
			if (!entry.isDirectory() || entry.name === "_local") continue;

			const dir = join(this.cacheBase, entry.name);
			const meta = this.readMetadataFromDir(dir);
			if (!meta) continue;

			const manifestPath = join(dir, "manifest.json");
			if (!existsSync(manifestPath)) {
				this.logger(`Skipping ${dir}: missing manifest.json`);
				continue;
			}

			try {
				const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
				bundles.push({
					name: manifest.name,
					version: meta.version,
					pulledAt: meta.pulledAt,
					cacheDir: dir,
				});
			} catch (err) {
				this.logger(
					`Skipping ${dir}: corrupt manifest.json: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}

		return bundles;
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
		const client = this.requireClient();
		const { version: requestedVersion, force = false } = options ?? {};
		const cacheDir = this.getPackageCachePath(name);
		const cachedMeta = this.getCacheMetadata(name);

		/*
    We immediately return from cache when
    1. Not forced, AND
    2. Cache exists, AND
    3. Either no version requested, OR cached version matches requested version
    If any fails, we go to registry
    */

		const isReturnedFromCache =
			!options?.force &&
			!!cachedMeta &&
			(!requestedVersion ||
				BundleCache.isSemverEqual(cachedMeta.version, requestedVersion));

		if (isReturnedFromCache) {
			return { cacheDir, version: cachedMeta.version, pulled: false };
		}

		// Get download info from registry
		const downloadInfo = await this.resolveFromRegistry(
			name,
			client,
			requestedVersion,
		);

		// Registry resolved to the same version we already have — skip download
		if (
			!force &&
			cachedMeta &&
			BundleCache.isSemverEqual(cachedMeta.version, downloadInfo.bundle.version)
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

		// Stamp lastCheckedAt — we just verified with the registry.
		const freshMeta = this.getCacheMetadata(name);
		if (freshMeta) {
			this.writeCacheMetadata(name, {
				...freshMeta,
				lastCheckedAt: new Date().toISOString(),
			});
		}

		return { cacheDir, version: downloadInfo.bundle.version, pulled: true };
	}

	/**
	 * TTL for update checks — skip if last check was within this window.
	 */
	static readonly UPDATE_CHECK_TTL_MS = 60 * 60 * 1000; // 1 hour

	/**
	 * Fire-and-forget background check for bundle updates.
	 * Logs a notice via the logger if a newer version exists.
	 *
	 * Requires an `MpakClient` to be provided at construction time.
	 *
	 * @param packageName - Scoped package name (e.g. `@scope/bundle`)
	 * @throws If no `MpakClient` was provided at construction time.
	 */
	async checkForUpdateAsync(packageName: string): Promise<void> {
		const client = this.requireClient();
		const cachedMeta = this.getCacheMetadata(packageName);
		if (!cachedMeta) return;

		// Skip if checked within the TTL
		if (cachedMeta.lastCheckedAt) {
			const elapsed =
				Date.now() - new Date(cachedMeta.lastCheckedAt).getTime();
			if (elapsed < BundleCache.UPDATE_CHECK_TTL_MS) {
				const remainingMin = Math.ceil((BundleCache.UPDATE_CHECK_TTL_MS - elapsed) / 60000);
				this.logger(`Skipping update check for ${packageName}, next check in ${remainingMin}m`);
				return;
			}
		}

		try {
			const detail = await client.getBundle(packageName);

			// Update lastCheckedAt regardless of whether there's an update
			this.writeCacheMetadata(packageName, {
				...cachedMeta,
				lastCheckedAt: new Date().toISOString(),
			});

			if (
				!BundleCache.isSemverEqual(detail.latest_version, cachedMeta.version)
			) {
				this.logger(
					`Update available: ${packageName} ${cachedMeta.version} -> ${detail.latest_version}`,
				);
			} else {
				this.logger(`${packageName}@${cachedMeta.version} is up to date`);
			}
		} catch (error) {
			this.logger(
				`Cannot check for updates: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Maximum allowed uncompressed size for a bundle (500MB).
	 */
	static readonly MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024;

	/**
	 * Check uncompressed size and extract a ZIP file to a directory.
	 * Rejects bundles exceeding {@link MAX_UNCOMPRESSED_SIZE} (zip-bomb protection).
	 *
	 * Requires the `unzip` system command to be available on PATH.
	 *
	 * @throws If uncompressed size exceeds the limit or extraction fails.
	 */
	static extractZip(zipPath: string, destDir: string): void {
		// Check uncompressed size before extraction
		try {
			const listOutput = execFileSync("unzip", ["-l", zipPath], {
				stdio: "pipe",
				encoding: "utf8",
			});
			const totalMatch = listOutput.match(/^\s*(\d+)\s+\d+\s+files?$/m);
			if (totalMatch) {
				const totalSize = parseInt(totalMatch[1] ?? "0", 10);
				if (totalSize > BundleCache.MAX_UNCOMPRESSED_SIZE) {
					throw new Error(
						`Bundle uncompressed size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds maximum allowed (${BundleCache.MAX_UNCOMPRESSED_SIZE / (1024 * 1024)}MB)`,
					);
				}
			}
		} catch (error: unknown) {
			if (
				error instanceof Error &&
				error.message.includes("exceeds maximum allowed")
			) {
				throw error;
			}
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Cannot verify bundle size before extraction: ${message}`,
			);
		}

		mkdirSync(destDir, { recursive: true });
		execFileSync("unzip", ["-o", "-q", zipPath, "-d", destDir], {
			stdio: "pipe",
		});
	}

	/**
	 * Compare two semver strings for equality, ignoring leading 'v' prefix.
	 */
	static isSemverEqual(a: string, b: string): boolean {
		return a.replace(/^v/, "") === b.replace(/^v/, "");
	}

	// ===========================================================================
	// Private methods
	// ===========================================================================

	/**
	 * Resolve download info from the registry for a bundle.
	 */
	private async resolveFromRegistry(
		name: string,
		client: MpakClient,
		version?: string,
	): Promise<DownloadInfo> {
		const platform = MpakClient.detectPlatform();
		return client.getBundleDownload(name, version ?? "latest", platform);
	}

	/**
	 * Download a bundle using pre-resolved download info, extract it into
	 * the cache, and write metadata.
	 */
	private async downloadAndExtract(
		name: string,
		downloadInfo: DownloadInfo,
	): Promise<void> {
		const bundle = downloadInfo.bundle;
		const cacheDir = this.getPackageCachePath(name);

		// Download to temp file
		const tmpDir = join(dirname(this.cacheBase), "tmp");
		const tempPath = join(
			tmpDir,
			`${Date.now()}-${randomUUID().slice(0, 8)}.mcpb`,
		);
		mkdirSync(tmpDir, { recursive: true });

		this.logger(`Pulling ${name}@${bundle.version}...`);

		const response = await fetch(downloadInfo.url);
		if (!response.ok) {
			throw new Error(`Failed to download bundle: ${response.statusText}`);
		}
		const arrayBuffer = await response.arrayBuffer();
		writeFileSync(tempPath, Buffer.from(arrayBuffer));

		// Clear old cache and extract
		if (existsSync(cacheDir)) {
			rmSync(cacheDir, { recursive: true, force: true });
		}

		BundleCache.extractZip(tempPath, cacheDir);

		// Write metadata
		this.writeCacheMetadata(name, {
			version: bundle.version,
			pulledAt: new Date().toISOString(),
			platform: bundle.platform,
		});

		// Cleanup temp file
		rmSync(tempPath, { force: true });

		this.logger(`Cached ${name}@${bundle.version}`);
	}

	/**
	 * Read and validate `.mpak-meta.json` from a directory path.
	 */
	private readMetadataFromDir(dir: string): CacheMetadata | null {
		const metaPath = join(dir, ".mpak-meta.json");
		if (!existsSync(metaPath)) {
			return null;
		}
		try {
			const raw = JSON.parse(readFileSync(metaPath, "utf8"));
			const result = CacheMetadataSchema.safeParse(raw);
			return result.success ? result.data : null;
		} catch {
			return null;
		}
	}
}

interface CachedBundle {
	name: string;
	version: string;
	pulledAt: string;
	cacheDir: string;
}
