import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface CacheMetadata {
  version: string;
  pulledAt: string;
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
