import { createHash } from 'node:crypto';
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import type { z } from 'zod';
import { MpakCacheCorruptedError, MpakError } from './errors.js';

/**
 * Default maximum allowed uncompressed size for a bundle (2GB).
 *
 * Override per-consumer via `MpakBundleCache` / `Mpak` options
 * (`maxUncompressedSize`), or per-call via the `extractZip` options.
 */
export const MAX_UNCOMPRESSED_SIZE = 2 * 1024 * 1024 * 1024;

/**
 * TTL for update checks — skip if last check was within this window (1 hour).
 */
export const UPDATE_CHECK_TTL_MS = 60 * 60 * 1000;

/** Options for {@link extractZip}. */
export interface ExtractZipOptions {
  /**
   * Maximum total uncompressed size in bytes. Defaults to
   * {@link MAX_UNCOMPRESSED_SIZE}. Enforced against both the declared
   * central-directory sizes and the actual bytes written during extraction
   * (the latter defeats zip bombs that lie about declared sizes).
   */
  maxUncompressedSize?: number;
}

/**
 * Compare two semver strings for equality, ignoring leading 'v' prefix.
 */
export function isSemverEqual(a: string, b: string): boolean {
  return a.replace(/^v/, '') === b.replace(/^v/, '');
}

/**
 * Extract a ZIP file to a directory, streaming entries to disk.
 *
 * Guarantees:
 * - **Zip-bomb protection:** the declared total uncompressed size (from the
 *   central directory) is checked before any files are written; during
 *   extraction, per-entry and cumulative byte counts are tracked and
 *   extraction aborts if either would exceed limits.
 * - **Path-traversal safe:** entry paths are resolved against `destDir` and
 *   any entry that escapes the destination is rejected.
 * - **Symlinks rejected:** bundles should not contain symlinks; their
 *   presence fails extraction.
 * - **Unix mode bits preserved** for entries that declare them (matches the
 *   behavior of the prior `unzip` shell-out).
 *
 * Uses a pure-JS zip library — no dependency on the `unzip` binary.
 *
 * @throws {MpakCacheCorruptedError} for any format, size, or safety violation.
 */
export async function extractZip(
  zipPath: string,
  destDir: string,
  options: ExtractZipOptions = {},
): Promise<void> {
  const maxSize = options.maxUncompressedSize ?? MAX_UNCOMPRESSED_SIZE;

  let zipfile: ZipFile;
  try {
    zipfile = await openZip(zipPath);
  } catch (error: unknown) {
    throw new MpakCacheCorruptedError(
      `Cannot open bundle archive: ${errorMessage(error)}`,
      zipPath,
      error instanceof Error ? error : undefined,
    );
  }

  try {
    let entries: Entry[];
    try {
      entries = await readAllEntries(zipfile);
    } catch (error: unknown) {
      throw new MpakCacheCorruptedError(
        `Invalid bundle entry: ${errorMessage(error)}`,
        zipPath,
        error instanceof Error ? error : undefined,
      );
    }

    const declaredTotal = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
    if (declaredTotal > maxSize) {
      throw new MpakCacheCorruptedError(
        `Bundle uncompressed size (${formatMB(declaredTotal)}MB) exceeds maximum allowed (${formatMB(maxSize)}MB)`,
        zipPath,
      );
    }

    const normalizedDest = resolve(destDir);
    mkdirSync(normalizedDest, { recursive: true });

    let cumulativeBytes = 0;
    for (const entry of entries) {
      const safePath = resolveEntryPath(normalizedDest, entry.fileName, zipPath);

      if (isSymlink(entry)) {
        throw new MpakCacheCorruptedError(
          `Bundle contains a symlink entry (${entry.fileName}); symlinks are not permitted`,
          zipPath,
        );
      }

      if (isDirectoryEntry(entry)) {
        mkdirSync(safePath, { recursive: true });
        continue;
      }

      mkdirSync(dirname(safePath), { recursive: true });

      const readStream = await openReadStream(zipfile, entry);
      const counter = createByteCounter(entry, zipPath, () => cumulativeBytes, maxSize, (n) => {
        cumulativeBytes = n;
      });

      await pipeline(readStream, counter, createWriteStream(safePath));

      const mode = unixMode(entry);
      if (mode !== null) {
        chmodSync(safePath, mode);
      }
    }
  } finally {
    zipfile.close();
  }
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((res, rej) => {
    yauzl.open(path, { lazyEntries: false, autoClose: false }, (err, zipfile) => {
      if (err || !zipfile) rej(err ?? new Error('yauzl returned no zipfile'));
      else res(zipfile);
    });
  });
}

function readAllEntries(zipfile: ZipFile): Promise<Entry[]> {
  return new Promise((res, rej) => {
    const entries: Entry[] = [];
    zipfile.on('entry', (entry: Entry) => entries.push(entry));
    zipfile.on('end', () => res(entries));
    zipfile.on('error', rej);
  });
}

function openReadStream(zipfile: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((res, rej) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err || !stream) rej(err ?? new Error('yauzl returned no read stream'));
      else res(stream);
    });
  });
}

function resolveEntryPath(normalizedDest: string, entryName: string, zipPath: string): string {
  if (entryName.includes('\0')) {
    throw new MpakCacheCorruptedError(
      `Bundle entry name contains NUL byte: ${JSON.stringify(entryName)}`,
      zipPath,
    );
  }
  const candidate = resolve(normalizedDest, entryName);
  if (candidate !== normalizedDest && !candidate.startsWith(normalizedDest + sep)) {
    throw new MpakCacheCorruptedError(
      `Bundle entry escapes destination directory: ${entryName}`,
      zipPath,
    );
  }
  return candidate;
}

function isDirectoryEntry(entry: Entry): boolean {
  return /\/$/.test(entry.fileName);
}

function isSymlink(entry: Entry): boolean {
  const mode = entry.externalFileAttributes >>> 16;
  // S_IFLNK = 0o120000; check the file-type bits
  return (mode & 0o170000) === 0o120000;
}

function unixMode(entry: Entry): number | null {
  const mode = (entry.externalFileAttributes >>> 16) & 0o7777;
  return mode === 0 ? null : mode;
}

function createByteCounter(
  entry: Entry,
  zipPath: string,
  getCumulative: () => number,
  maxSize: number,
  setCumulative: (n: number) => void,
): Transform {
  let entryBytes = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      entryBytes += chunk.length;
      if (entryBytes > entry.uncompressedSize) {
        cb(
          new MpakCacheCorruptedError(
            `Entry ${entry.fileName} exceeds its declared uncompressed size (possible zip bomb)`,
            zipPath,
          ),
        );
        return;
      }
      const next = getCumulative() + chunk.length;
      if (next > maxSize) {
        cb(
          new MpakCacheCorruptedError(
            `Bundle exceeds maximum uncompressed size (${formatMB(maxSize)}MB) during extraction`,
            zipPath,
          ),
        );
        return;
      }
      setCumulative(next);
      cb(null, chunk);
    },
  });
}

function formatMB(bytes: number): number {
  return Math.round(bytes / (1024 * 1024));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
