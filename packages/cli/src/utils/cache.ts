import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { MpakClient } from "@nimblebrain/mpak-sdk";

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
