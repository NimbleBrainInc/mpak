/**
 * Fetch, verify, and inspect an upstream MCPB artifact.
 *
 * Kept apart from the ingest orchestration because this is the part that
 * touches untrusted bytes, and the rules it enforces (hash must match, size is
 * capped, the archive must actually be a bundle) are the ones worth reading in
 * isolation.
 */

import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import AdmZip from 'adm-zip';

/** Source-file extensions the scanner's static analysis can actually read. */
const SOURCE_EXTENSIONS = ['.py', '.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.rb', '.go'];

export type Scanability = 'full' | 'partial' | 'opaque';

export interface BundleInspection {
  manifest: Record<string, unknown>;
  manifestVersion?: string;
  serverType: string;
  /** How much of this bundle the scanner will be able to see. */
  scanability: Scanability;
  declaredTools: number;
  hasLockfile: boolean;
  sourceFileCount: number;
}

export interface DownloadedBundle {
  tempPath: string;
  sha256: string;
  size: number;
  inspection: BundleInspection;
  cleanup: () => Promise<void>;
}

export class BundleTooLargeError extends Error {
  constructor(readonly declaredSize: number | undefined) {
    super('Bundle exceeds the ingest size cap');
    this.name = 'BundleTooLargeError';
  }
}

/**
 * The artifact could not be retrieved: HTTP error, timeout, connection reset.
 *
 * Deliberately distinct from `BundleVerificationError`. A dead release asset is
 * routine upstream churn; a digest that does not match is a claim that the
 * bytes changed after publication. Reporting both as one reason buries the
 * second in a pile of the first, which is the opposite of what either is for.
 */
export class BundleDownloadError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BundleDownloadError';
  }
}

/** The bytes arrived but do not hash to the digest upstream declared. */
export class BundleVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BundleVerificationError';
  }
}

/**
 * A manifest is kilobytes. Anything approaching a megabyte is not a manifest,
 * it is an attempt to make us allocate.
 */
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

export class NotABundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotABundleError';
  }
}

const LOCKFILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'uv.lock',
  'poetry.lock',
  'requirements.txt',
  'Pipfile.lock',
  'Cargo.lock',
  'go.sum',
]);

/**
 * Read a bundle's manifest and judge how much of it is analyzable.
 *
 * `scanability` is decided here, at ingest, rather than inferred later from a
 * low score. A bundle whose `server.type` is `binary` ships a compiled
 * executable: the secret, malicious-pattern, and static-analysis controls have
 * nothing to read, so its certification level reflects absence of evidence, not
 * evidence of absence. Recording that distinction is the difference between a
 * trust signal and a number.
 */
export function inspectBundle(bundlePath: string): BundleInspection {
  let zip: AdmZip;
  try {
    zip = new AdmZip(bundlePath);
  } catch (err) {
    throw new NotABundleError(
      `Not a readable archive: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const entries = zip.getEntries();
  const manifestEntry = entries.find((e) => e.entryName === 'manifest.json');
  if (!manifestEntry) {
    throw new NotABundleError('Archive has no manifest.json at its root');
  }

  // The download cap bounds *compressed* bytes; this bounds what decompressing
  // the manifest would allocate, and an attacker picks the ratio. Measured: a
  // 398KB archive declaring a 400MB manifest costs ~1.7GB RSS on readAsText,
  // and being a Buffer that is external memory — --max-old-space-size does not
  // bound it, only the cgroup limit does, i.e. an OOMKill of a job running with
  // backoffLimit: 0. Upstream accepts publications from anyone.
  //
  // Only the manifest needs this. Nothing else here is ever decompressed: the
  // entry walk below reads names and header sizes and never calls readAsText,
  // so an archive-wide declared-size bound would guard an allocation that does
  // not happen — and would reject legitimately large bundles as "not a bundle".
  //
  // adm-zip exposes the declared size from the entry header before allocating,
  // so the check belongs here rather than after.
  if (manifestEntry.header.size > MAX_MANIFEST_BYTES) {
    throw new NotABundleError(
      `manifest.json declares ${manifestEntry.header.size} bytes uncompressed, over the ${MAX_MANIFEST_BYTES} cap`,
    );
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(zip.readAsText(manifestEntry)) as Record<string, unknown>;
  } catch (err) {
    throw new NotABundleError(
      `manifest.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!manifest || typeof manifest !== 'object') {
    throw new NotABundleError('manifest.json is not an object');
  }

  const server = (manifest.server ?? {}) as Record<string, unknown>;
  const serverType = typeof server.type === 'string' ? server.type : 'unknown';

  let sourceFileCount = 0;
  let hasLockfile = false;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const base = entry.entryName.split('/').pop() ?? '';
    if (LOCKFILES.has(base)) hasLockfile = true;
    const ext = path.extname(base).toLowerCase();
    if (SOURCE_EXTENSIONS.includes(ext)) sourceFileCount += 1;
  }

  const declaredTools = Array.isArray(manifest.tools) ? manifest.tools.length : 0;

  const scanability: Scanability =
    sourceFileCount === 0 ? 'opaque' : hasLockfile && declaredTools > 0 ? 'full' : 'partial';

  return {
    manifest,
    manifestVersion:
      typeof manifest.manifest_version === 'string' ? manifest.manifest_version : undefined,
    serverType,
    scanability,
    declaredTools,
    hasLockfile,
    sourceFileCount,
  };
}

/**
 * Stream an upstream artifact to a temp file, verifying as it lands.
 *
 * The hash is computed over the bytes actually received and compared to the
 * digest upstream declared. Upstream is a metaregistry and never holds the
 * bytes, so this check is the only thing standing between a URL that changed
 * after publication and a mirrored copy mpak would otherwise vouch for. The
 * size cap is enforced mid-stream rather than from Content-Length, which a
 * server is free to misreport or omit.
 */
export async function downloadAndVerify(options: {
  url: string;
  expectedSha256: string;
  maxBytes: number;
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}): Promise<DownloadedBundle> {
  const {
    url,
    expectedSha256,
    maxBytes,
    timeoutMs = 120_000,
    userAgent = 'mpak-registry-ingest/1.0',
    fetchImpl = fetch,
  } = options;

  const tempPath = path.join(tmpdir(), `mpak-ingest-${randomUUID()}`);
  const cleanup = async () => {
    await fs.unlink(tempPath).catch(() => {});
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new BundleDownloadError(
        `Download failed: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const declared = Number(response.headers.get('content-length') ?? '') || undefined;
    if (declared !== undefined && declared > maxBytes) {
      throw new BundleTooLargeError(declared);
    }

    const hash = createHash('sha256');
    let received = 0;

    const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

    await pipeline(async function* () {
      for await (const chunk of source) {
        const buf = chunk as Buffer;
        received += buf.length;
        if (received > maxBytes) throw new BundleTooLargeError(declared);
        hash.update(buf);
        yield buf;
      }
    }, createWriteStream(tempPath));

    const sha256 = hash.digest('hex');
    if (sha256 !== expectedSha256.toLowerCase()) {
      throw new BundleVerificationError(
        `SHA256 mismatch: upstream declared ${expectedSha256}, downloaded ${sha256}`,
      );
    }

    const inspection = inspectBundle(tempPath);

    return { tempPath, sha256, size: received, inspection, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
