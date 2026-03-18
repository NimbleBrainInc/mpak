import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { execFileSync } from "child_process";
import { homedir } from "os";
import { dirname, join } from "path";
import { MpakClient } from "@nimblebrain/mpak-sdk";

export interface CacheMetadata {
  version: string;
  pulledAt: string;
  lastCheckedAt?: string;
  platform: { os: string; arch: string };
}

/**
 * Get cache directory for a package
 * @example getCacheDir('@scope/name') => '~/.mpak/cache/scope-name'
 */
export function getCacheDir(packageName: string): string {
  const cacheBase = join(homedir(), ".mpak", "cache");
  // @scope/name -> scope/name
  const safeName = packageName.replace("@", "").replace("/", "-");
  return join(cacheBase, safeName);
}

/**
 * Read cache metadata
 */
export function getCacheMetadata(cacheDir: string): CacheMetadata | null {
  const metaPath = join(cacheDir, ".mpak-meta.json");
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Write cache metadata
 */
export function writeCacheMetadata(
  cacheDir: string,
  metadata: CacheMetadata,
): void {
  const metaPath = join(cacheDir, ".mpak-meta.json");
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
}

const UPDATE_CHECK_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fire-and-forget background check for bundle updates.
 * Prints a notice to stderr if a newer version exists.
 * Silently swallows all errors.
 */
export async function checkForUpdateAsync(
  packageName: string,
  cachedMeta: CacheMetadata,
  cacheDir: string,
  client: MpakClient,
): Promise<void> {
  try {
    // Skip if checked within the TTL
    if (cachedMeta.lastCheckedAt) {
      const elapsed = Date.now() - new Date(cachedMeta.lastCheckedAt).getTime();
      if (elapsed < UPDATE_CHECK_TTL_MS) {
        return;
      }
    }

    const detail = await client.getBundle(packageName);

    // Update lastCheckedAt regardless of whether there's an update
    writeCacheMetadata(cacheDir, {
      ...cachedMeta,
      lastCheckedAt: new Date().toISOString(),
    });

    if (detail.latest_version !== cachedMeta.version) {
      process.stderr.write(
        `\n=> Update available: ${packageName} ${cachedMeta.version} -> ${detail.latest_version}\n` +
        `   Run 'mpak run ${packageName} --update' to update\n`,
      );
    }
  } catch {
    // Silently swallow all errors (network down, registry unreachable, etc.)
  }
}

export interface CachedBundle {
  name: string;
  version: string;
  pulledAt: string;
  cacheDir: string;
}

/**
 * Scan ~/.mpak/cache/ and return metadata for every cached registry bundle.
 * Skips the _local/ directory (local dev bundles).
 */
export function listCachedBundles(): CachedBundle[] {
  const cacheBase = join(homedir(), ".mpak", "cache");
  if (!existsSync(cacheBase)) return [];

  const entries = readdirSync(cacheBase, { withFileTypes: true });
  const bundles: CachedBundle[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "_local") continue;

    const dir = join(cacheBase, entry.name);
    const meta = getCacheMetadata(dir);
    if (!meta) continue;

    const manifestPath = join(dir, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      bundles.push({
        name: manifest.name,
        version: meta.version,
        pulledAt: meta.pulledAt,
        cacheDir: dir,
      });
    } catch {
      // Skip corrupt bundles
    }
  }

  return bundles;
}

/**
 * Maximum allowed uncompressed size for a bundle (500MB).
 */
const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024;

/**
 * Check uncompressed size and extract a ZIP file to a directory.
 * Rejects bundles exceeding MAX_UNCOMPRESSED_SIZE (zip bomb protection).
 */
export function extractZip(zipPath: string, destDir: string): void {
  // Check uncompressed size before extraction
  try {
    const listOutput = execFileSync("unzip", ["-l", zipPath], {
      stdio: "pipe",
      encoding: "utf8",
    });
    const totalMatch = listOutput.match(/^\s*(\d+)\s+\d+\s+files?$/m);
    if (totalMatch) {
      const totalSize = parseInt(totalMatch[1]!, 10);
      if (totalSize > MAX_UNCOMPRESSED_SIZE) {
        throw new Error(
          `Bundle uncompressed size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds maximum allowed (${MAX_UNCOMPRESSED_SIZE / (1024 * 1024)}MB)`,
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
    throw new Error(`Cannot verify bundle size before extraction: ${message}`);
  }

  mkdirSync(destDir, { recursive: true });
  execFileSync("unzip", ["-o", "-q", zipPath, "-d", destDir], {
    stdio: "pipe",
  });
}

export interface BundleDownloadInfo {
  url: string;
  bundle: { version: string; platform: { os: string; arch: string } };
}

/**
 * Resolve a bundle from the registry without downloading it.
 * Returns the download URL and resolved version/platform metadata.
 */
export async function resolveBundle(
  name: string,
  client: MpakClient,
  requestedVersion?: string,
): Promise<BundleDownloadInfo> {
  const platform = MpakClient.detectPlatform();
  return client.getBundleDownload(
    name,
    requestedVersion || "latest",
    platform,
  );
}

/**
 * Download a bundle using pre-resolved download info, extract it into the
 * cache, and write metadata. Returns the cache directory path.
 */
export async function downloadAndExtract(
  name: string,
  downloadInfo: BundleDownloadInfo,
): Promise<{ cacheDir: string; version: string }> {
  const bundle = downloadInfo.bundle;
  const cacheDir = getCacheDir(name);

  // Download to temp file
  const tempPath = join(homedir(), ".mpak", "tmp", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mcpb`);
  mkdirSync(dirname(tempPath), { recursive: true });

  process.stderr.write(`=> Pulling ${name}@${bundle.version}...\n`);

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

  extractZip(tempPath, cacheDir);

  // Write metadata
  writeCacheMetadata(cacheDir, {
    version: bundle.version,
    pulledAt: new Date().toISOString(),
    platform: bundle.platform,
  });

  // Cleanup temp file
  rmSync(tempPath, { force: true });

  process.stderr.write(`=> Cached ${name}@${bundle.version}\n`);

  return { cacheDir, version: bundle.version };
}
