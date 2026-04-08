import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { z } from 'zod';
import { MpakCacheCorruptedError, MpakError } from './errors.js';

/**
 * Maximum allowed uncompressed size for a bundle (500MB).
 */
export const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024;

/**
 * TTL for update checks — skip if last check was within this window (1 hour).
 */
export const UPDATE_CHECK_TTL_MS = 60 * 60 * 1000;

/**
 * Compare two semver strings for equality, ignoring leading 'v' prefix.
 */
export function isSemverEqual(a: string, b: string): boolean {
  return a.replace(/^v/, '') === b.replace(/^v/, '');
}

/**
 * Check uncompressed size and extract a ZIP file to a directory.
 * Rejects bundles exceeding {@link MAX_UNCOMPRESSED_SIZE} (zip-bomb protection).
 *
 * Requires the `unzip` system command to be available on PATH.
 *
 * @throws If uncompressed size exceeds the limit or extraction fails.
 */
export function extractZip(zipPath: string, destDir: string): void {
  // Check uncompressed size before extraction
  try {
    const listOutput = execFileSync('unzip', ['-l', zipPath], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    const totalMatch = listOutput.match(/^\s*(\d+)\s+\d+\s+files?$/m);
    if (totalMatch) {
      const totalSize = parseInt(totalMatch[1] ?? '0', 10);
      if (totalSize > MAX_UNCOMPRESSED_SIZE) {
        throw new MpakCacheCorruptedError(
          `Bundle uncompressed size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds maximum allowed (${MAX_UNCOMPRESSED_SIZE / (1024 * 1024)}MB)`,
          zipPath,
        );
      }
    }
  } catch (error: unknown) {
    if (error instanceof MpakCacheCorruptedError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new MpakCacheCorruptedError(
      `Cannot verify bundle size before extraction: ${message}`,
      zipPath,
      error instanceof Error ? error : undefined,
    );
  }

  mkdirSync(destDir, { recursive: true });
  execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir], {
    stdio: 'pipe',
  });
}

/**
 * Compute a stable, short hash for a local bundle's absolute path.
 * Used to derive a unique cache directory under `_local/`.
 *
 * @param bundlePath - Path to the `.mcpb` file (resolved to absolute internally).
 * @returns A 12-character hex string.
 */
export function hashBundlePath(bundlePath: string): string {
  return createHash('md5').update(resolve(bundlePath)).digest('hex').slice(0, 12);
}

/**
 * Check whether a local bundle needs re-extraction.
 *
 * Returns `true` (needs extract) when:
 * - The cache directory has no `.mpak-local-meta.json`
 * - The `.mcpb` file's mtime is newer than the recorded extraction time
 * - The metadata file is corrupt or unreadable
 *
 * @param bundlePath - Absolute path to the `.mcpb` file.
 * @param cacheDir - The extracted cache directory for this local bundle.
 */
export function localBundleNeedsExtract(bundlePath: string, cacheDir: string): boolean {
  const metaPath = join(cacheDir, '.mpak-local-meta.json');
  if (!existsSync(metaPath)) return true;

  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { extractedAt?: string };
    if (!meta.extractedAt) return true;
    const bundleStat = statSync(bundlePath);
    return bundleStat.mtimeMs > new Date(meta.extractedAt).getTime();
  } catch {
    return true;
  }
}

/**
 * Read a JSON file, parse it, and validate against a Zod schema.
 *
 * Throws generic {@link MpakError} — callers should catch and re-throw
 * with a context-specific error (e.g. `MpakCacheCorruptedError`).
 *
 * @param filePath - Absolute path to the JSON file
 * @param schema - Zod schema to validate the parsed content against
 * @returns The validated data matching the schema's output type
 *
 * @throws {MpakError} If the file does not exist, contains invalid JSON,
 *   or fails schema validation.
 */
export function readJsonFromFile<T extends z.ZodTypeAny>(filePath: string, schema: T): z.output<T> {
  if (!existsSync(filePath)) {
    throw new MpakError(`File does not exist: ${filePath}`, 'FILE_NOT_FOUND');
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    throw new MpakError(`File is not valid JSON: ${filePath}`, 'INVALID_JSON');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new MpakError(
      `File failed validation: ${filePath} — ${result.error.issues[0]?.message ?? 'unknown error'}`,
      'VALIDATION_FAILED',
    );
  }

  return result.data;
}
