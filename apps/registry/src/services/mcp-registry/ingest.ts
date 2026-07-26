/**
 * Incremental ingest of MCPB bundles from an upstream MCP Registry.
 *
 * The upstream registry is a metaregistry that deliberately makes no quality or
 * security judgement — its own design principles say so, and leave curation to
 * downstream consumers. This job is mpak acting as that consumer: mirror the
 * bytes so they can be verified and scanned, and record what we could and could
 * not determine about each one.
 *
 * Idempotent by construction. Every run may safely re-read a window it has
 * already processed; work is skipped at the cheapest layer that can prove it is
 * redundant (see `ingestServer`).
 */

import { createReadStream } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { runInTransaction } from '../../db/client.js';
import { PackageRepository } from '../../db/repositories/package.repository.js';
import type { StorageService } from '../../plugins/storage.js';
import { triggerSecurityScan } from '../scanner.js';
import {
  BundleDownloadError,
  BundleTooLargeError,
  BundleVerificationError,
  downloadAndVerify,
  NotABundleError,
} from './bundle.js';
import type { McpRegistryClient } from './client.js';
import type { MappedArtifact, MappedServer, RejectReason } from './mapper.js';
import { mapServer, mcpbPackages } from './mapper.js';
import { officialMeta, type UpstreamServerEntry } from './types.js';

export const INGEST_SOURCE = 'mcp-registry';

/**
 * A package name was claimed by someone else between the pre-download check and
 * the write. Thrown from inside the transaction so the write rolls back rather
 * than half-applying.
 */
class NameConflictError extends Error {
  constructor(readonly packageName: string) {
    super(`Package ${packageName} is owned by another publisher`);
    this.name = 'NameConflictError';
  }
}

/**
 * Upstream's own updated_at for an entry, read directly rather than via the
 * mapper so it is still available when mapping is what failed.
 */
function upstreamUpdatedAt(entry: UpstreamServerEntry): Date | undefined {
  const meta = entry._meta?.['io.modelcontextprotocol.registry/official'];
  const raw = meta?.updatedAt ?? meta?.publishedAt;
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Every terminal disposition a single upstream server can reach. */
export type SkipReason =
  | RejectReason
  | 'unchanged'
  | 'too-large'
  | 'not-a-bundle'
  | 'sha-mismatch'
  | 'download-failed'
  | 'name-conflict'
  | 'upstream-deleted';

export interface IngestOptions {
  client: McpRegistryClient;
  storage: StorageService;
  prisma: PrismaClient;
  /** Only consider servers updated at or after this instant. */
  since?: Date;
  maxBundleBytes: number;
  /**
   * Furthest back a retryable failure may drag the watermark.
   *
   * Without a bound, one permanently dead release asset pins the window at its
   * timestamp on every run forever — and 21 of the 388 upstream MCPB URLs do
   * not resolve, so that is the expected case, not a corner. Past this age a
   * failure is treated as permanent and the window is allowed to move on.
   */
  maxHoldbackMs?: number;
  /** Per-artifact download timeout. Wired from INGEST_DOWNLOAD_TIMEOUT_MS. */
  downloadTimeoutMs?: number;
  /** Concurrent server pipelines. Downloads dominate, so this is network-bound. */
  concurrency: number;
  /** Map and verify without writing or storing anything. */
  dryRun?: boolean;
  /** Hard cap on servers *read* from upstream; undefined means no cap. */
  limit?: number;
  /**
   * Stop after this many servers carrying an MCPB bundle have been picked up.
   *
   * Distinct from `limit` because the two answer different questions. Only
   * about 2% of upstream ships an MCPB bundle, and they are not evenly spread
   * through the catalog's name ordering — so "read 10 servers" and "try 10
   * bundles" can differ by three orders of magnitude. This is the bound you
   * want for a trial run.
   */
  maxBundles?: number;
  scanEnabled: boolean;
  logger: IngestLogger;
}

export interface IngestLogger {
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
}

export interface IngestCounters {
  serversSeen: number;
  serversMatched: number;
  packagesCreated: number;
  versionsCreated: number;
  artifactsStored: number;
  bytesStored: number;
  scansTriggered: number;
  /** Mirrors removed because upstream took the server down. */
  mirrorsRemoved: number;
  skipped: number;
  failed: number;
}

export interface IngestResult extends IngestCounters {
  skipReasons: Record<string, number>;
  scanability: Record<string, number>;
  failures: Array<{ server: string; error: string }>;
  /**
   * Lower bound for the next run's window.
   *
   * The run's start instant, except that a server which failed for a
   * *retryable* reason pulls it back to that server's own upstream timestamp.
   * Without that, the next window opens after the failure and the server falls
   * outside every subsequent window — one transient 503 would drop a bundle
   * until someone ran --full. `backoffLimit: 0` on the CronJob means there is
   * no job-level retry to cover it either.
   */
  watermark: Date;
}

/**
 * Failures worth re-reading next run. A bundle that is not an archive, is
 * oversized, or whose digest does not match will fail identically forever —
 * holding the watermark for those would freeze it permanently.
 */
const RETRYABLE_SKIPS: ReadonlySet<string> = new Set(['download-failed', 'name-conflict']);

/**
 * Default bound on how far a retryable failure may drag the next window.
 *
 * Defaulted rather than left open-ended: an unbounded holdback is the failure
 * mode this exists to prevent, so a caller that forgets to pass one should get
 * the safe behaviour, not the broken one.
 */
const DEFAULT_MAX_HOLDBACK_MS = 72 * 60 * 60 * 1000;

interface ServerOutcome {
  matched: boolean;
  skipReason?: SkipReason;
  /** Upstream's timestamp, retained so a retryable failure can hold the watermark. */
  upstreamUpdatedAt?: Date;
  packageCreated?: boolean;
  versionCreated?: boolean;
  artifactsStored?: number;
  bytesStored?: number;
  scanTriggered?: boolean;
  scanability?: string;
  mirrorsRemoved?: number;
  error?: string;
}

/**
 * Run one ingest pass.
 *
 * The watermark is the instant the run *started*, not the newest timestamp it
 * observed. A run takes long enough that a server updated while it is paging
 * could sort behind the cursor and never be seen; opening the next window at
 * the start time re-reads that overlap. Re-reading is free because ingest is
 * idempotent, whereas a gap is silent and permanent.
 */
export async function runIngest(options: IngestOptions): Promise<IngestResult> {
  const { client, since, limit, maxBundles, logger } = options;
  const runStarted = new Date();

  const counters: IngestCounters = {
    serversSeen: 0,
    serversMatched: 0,
    packagesCreated: 0,
    versionsCreated: 0,
    artifactsStored: 0,
    bytesStored: 0,
    scansTriggered: 0,
    mirrorsRemoved: 0,
    skipped: 0,
    failed: 0,
  };
  const skipReasons: Record<string, number> = {};
  const scanability: Record<string, number> = {};
  const failures: Array<{ server: string; error: string }> = [];
  let oldestRetryableFailure: Date | undefined;

  const holdWatermark = (at?: Date) => {
    if (!at) return;
    if (!oldestRetryableFailure || at < oldestRetryableFailure) oldestRetryableFailure = at;
  };

  const record = (name: string, outcome: ServerOutcome) => {
    counters.serversSeen += 1;
    if (outcome.matched) counters.serversMatched += 1;

    if (outcome.skipReason) {
      // A server with no MCPB package is the overwhelming majority of upstream
      // and is not interesting enough to count as "skipped" — that number
      // should mean "an MCPB bundle we declined", not "an npm server".
      if (outcome.skipReason !== 'no-mcpb-package') counters.skipped += 1;
      skipReasons[outcome.skipReason] = (skipReasons[outcome.skipReason] ?? 0) + 1;
      if (RETRYABLE_SKIPS.has(outcome.skipReason)) holdWatermark(outcome.upstreamUpdatedAt);
    }
    if (outcome.error) {
      counters.failed += 1;
      failures.push({ server: name, error: outcome.error });
      // A thrown error is always retryable: it is by definition a case the
      // pipeline did not classify, so assuming it is permanent would lose data.
      // An entry carrying no upstream timestamp cannot be held for
      // individually; `failed > 0` is what covers it, by stopping the job
      // advancing the watermark at all (see the job entrypoint).
      holdWatermark(outcome.upstreamUpdatedAt);
    }
    if (outcome.packageCreated) counters.packagesCreated += 1;
    if (outcome.versionCreated) counters.versionsCreated += 1;
    if (outcome.artifactsStored) counters.artifactsStored += outcome.artifactsStored;
    if (outcome.bytesStored) counters.bytesStored += outcome.bytesStored;
    if (outcome.scanTriggered) counters.scansTriggered += 1;
    if (outcome.mirrorsRemoved) counters.mirrorsRemoved += outcome.mirrorsRemoved;
    if (outcome.scanability) {
      scanability[outcome.scanability] = (scanability[outcome.scanability] ?? 0) + 1;
    }
  };

  logger.info('Starting ingest', {
    since: since?.toISOString() ?? 'full-backfill',
    concurrency: options.concurrency,
    dryRun: options.dryRun ?? false,
  });

  let processed = 0;
  const inFlight = new Set<Promise<void>>();

  const launch = (entry: UpstreamServerEntry) => {
    const name = entry.server.name;
    const task = (async () => {
      try {
        record(name, await ingestServer(entry, options));
      } catch (err) {
        // A single bad server must never end the run: the catalog is
        // third-party content and a steady failure rate is the normal state.
        record(name, {
          matched: true,
          error: err instanceof Error ? err.message : String(err),
          upstreamUpdatedAt: upstreamUpdatedAt(entry),
        });
        logger.warn('Server ingest failed', { server: name, err: String(err) });
      }
    })();

    const tracked = task.finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
    return tracked;
  };

  let bundlesTaken = 0;

  for await (const entry of client.listServers({ updatedSince: since, version: 'latest' })) {
    if (limit !== undefined && processed >= limit) break;
    processed += 1;

    // Whether a server carries an MCPB bundle is a pure check over metadata
    // already in hand, so the bundle budget can be spent before any work is
    // launched — no download is started that the budget would not have allowed.
    if (maxBundles !== undefined && mcpbPackages(entry).length > 0) {
      if (bundlesTaken >= maxBundles) break;
      bundlesTaken += 1;
    }

    launch(entry);
    if (inFlight.size >= options.concurrency) await Promise.race(inFlight);
  }

  await Promise.all(inFlight);

  // Floor the holdback. A retryable failure pulls the next window back to its
  // own timestamp so it gets another attempt, but a permanently dead asset
  // would otherwise pin the window there forever and every subsequent run would
  // re-read an ever-widening span until activeDeadlineSeconds truncated it.
  const holdbackFloor = new Date(
    runStarted.getTime() - (options.maxHoldbackMs ?? DEFAULT_MAX_HOLDBACK_MS),
  );
  const heldAt =
    oldestRetryableFailure && oldestRetryableFailure > holdbackFloor
      ? oldestRetryableFailure
      : oldestRetryableFailure
        ? holdbackFloor
        : runStarted;
  const watermark = heldAt < runStarted ? heldAt : runStarted;

  logger.info('Ingest complete', {
    ...counters,
    skipReasons,
    scanability,
    watermark: watermark.toISOString(),
    watermarkHeldBack: watermark < runStarted,
  });

  return { ...counters, skipReasons, scanability, failures, watermark };
}

/**
 * Process one upstream server.
 *
 * Dedupe is layered cheapest-first, because the expensive layer is a multi-
 * megabyte download over the public internet:
 *
 *   1. shape        — no MCPB package, no work (pure, no I/O)
 *   2. identity     — `upstreamName` finds the row a prior run created
 *   3. version      — a version already stored with every artifact digest
 *                     upstream declares is byte-identical; skip the download
 *   4. content      — the download is still verified against that digest, so a
 *                     URL whose contents changed after publication is caught
 *                     rather than mirrored
 */
async function ingestServer(
  entry: UpstreamServerEntry,
  options: IngestOptions,
): Promise<ServerOutcome> {
  const { storage, prisma, logger, dryRun, maxBundleBytes } = options;
  const repo = new PackageRepository();

  const at = upstreamUpdatedAt(entry);

  // Decided on the raw entry, before any interpretation. A takedown often
  // arrives with the packages array emptied or invalidated, which makes
  // mapServer reject the entry — and rejecting it below would mean the one
  // event we most need to act on is the one we skip. Deleting needs no mapping:
  // the upstream name is right there, and it is the same value mapServer would
  // have produced.
  if (officialMeta(entry).status === 'deleted') {
    const removed = dryRun ? 0 : await repo.deleteMirror(entry.server.name);
    if (removed > 0) {
      logger.info('Removed mirror after upstream takedown', { server: entry.server.name });
    }
    return {
      matched: true,
      skipReason: 'upstream-deleted',
      upstreamUpdatedAt: at,
      mirrorsRemoved: removed,
    };
  }

  const mapped = mapServer(entry);
  if (!mapped.server) {
    return {
      matched: mapped.reason !== 'no-mcpb-package',
      skipReason: mapped.reason,
      upstreamUpdatedAt: at,
    };
  }
  const server = mapped.server;

  // Upstream marks a removed server 'deleted'. Incremental runs see these
  // because upstream flips include_deleted on whenever updated_since is set,
  // which is exactly how a takedown reaches us.
  const existing = await repo.findByUpstreamName(server.upstreamName);

  // Layer 3: a version we already hold, whose stored artifact digests match
  // every digest upstream declares, cannot have changed. Skip before the wire.
  if (existing && (await versionIsCurrent(prisma, existing.id, server))) {
    return { matched: true, skipReason: 'unchanged', upstreamUpdatedAt: at };
  }

  const name = await resolveName(repo, server);
  if (!name) return { matched: true, skipReason: 'name-conflict', upstreamUpdatedAt: at };

  const downloads: Array<{
    artifact: MappedArtifact;
    storagePath: string;
    sha256: string;
    size: number;
    scanability: string;
    manifest: Record<string, unknown>;
    serverType: string;
  }> = [];

  // Registered the instant a temp file exists, separately from `downloads`,
  // which is only appended to once the artifact is fully stored. A storage
  // write that throws used to skip registration entirely and leak that file —
  // up to INGEST_MAX_BUNDLE_SIZE_MB of it — into an emptyDir the run keeps
  // using, because the per-server failure is caught and the run continues.
  const cleanups: Array<() => Promise<void>> = [];

  try {
    for (const artifact of server.artifacts) {
      try {
        const bundle = await downloadAndVerify({
          url: artifact.sourceUrl,
          expectedSha256: artifact.sha256,
          maxBytes: maxBundleBytes,
          timeoutMs: options.downloadTimeoutMs,
        });
        cleanups.push(bundle.cleanup);

        let storagePath = '';
        if (!dryRun) {
          const { scope, packageName } = splitName(name);
          const platform =
            artifact.os === 'any' && artifact.arch === 'any'
              ? undefined
              : `${artifact.os}-${artifact.arch}`;

          // createReadStream opens lazily, on first read. If the save rejects
          // before consuming it — or never consumes it — the open lands after
          // this server's cleanup has already unlinked the temp file, and the
          // resulting 'error' event has no listener. An unhandled stream error
          // takes the whole process down, which on a nightly batch job means one
          // bad artifact ends the run.
          const body = createReadStream(bundle.tempPath);
          try {
            const stored = await storage.saveBundleFromStream(
              scope,
              packageName,
              server.version,
              body,
              bundle.sha256,
              bundle.size,
              platform,
            );
            storagePath = stored.path;
          } finally {
            body.destroy();
          }
        }

        downloads.push({
          artifact,
          storagePath,
          sha256: bundle.sha256,
          size: bundle.size,
          scanability: bundle.inspection.scanability,
          manifest: bundle.inspection.manifest,
          serverType: bundle.inspection.serverType,
        });
      } catch (err) {
        // A per-artifact failure abandons the whole server rather than
        // recording a partial platform set — a half-mirrored server would
        // advertise a matrix it cannot serve. Earlier artifacts may already be
        // in S3; only the rows are avoided. Keys are deterministic, so a retry
        // overwrites rather than accumulating.
        if (err instanceof BundleTooLargeError)
          return { matched: true, skipReason: 'too-large', upstreamUpdatedAt: at };
        if (err instanceof NotABundleError) {
          logger.warn('Upstream mcpb package is not a bundle', {
            server: server.upstreamName,
            url: artifact.sourceUrl,
            err: err.message,
          });
          return { matched: true, skipReason: 'not-a-bundle', upstreamUpdatedAt: at };
        }
        if (err instanceof BundleVerificationError) {
          // Loud on purpose. Upstream declared a digest and served different
          // bytes, which means the artifact changed after it was published.
          // That is the one failure here worth a human looking at it, and it
          // must not sit silently in a counter alongside dead links.
          logger.error('Upstream artifact does not match its declared digest', {
            server: server.upstreamName,
            url: artifact.sourceUrl,
            err: err.message,
          });
          return { matched: true, skipReason: 'sha-mismatch', upstreamUpdatedAt: at };
        }
        if (err instanceof BundleDownloadError) {
          return { matched: true, skipReason: 'download-failed', upstreamUpdatedAt: at };
        }
        // Anything left is ours, not upstream's — a storage write that failed,
        // most likely. Reporting that as "download-failed" would point the run
        // report at the wrong system entirely.
        throw err;
      }
    }

    if (downloads.length === 0)
      return { matched: true, skipReason: 'bad-identifier', upstreamUpdatedAt: at };
    if (dryRun) {
      return {
        matched: true,
        artifactsStored: downloads.length,
        bytesStored: downloads.reduce((n, d) => n + d.size, 0),
        scanability: downloads[0]?.scanability,
      };
    }

    const primary = downloads[0];
    if (!primary) return { matched: true, skipReason: 'bad-identifier', upstreamUpdatedAt: at };

    let written: { packageCreated: boolean; versionCreated: boolean; versionId: string };
    try {
      written = await runInTransaction(async (tx) => {
        // resolveName ran before a download that can take minutes. If a real
        // publisher claimed this name in the meantime, upsertPackage's update
        // clause would overwrite their display name, description, author,
        // homepage, license, icon, and repo with third-party content — the
        // provenance columns are creation-only, but everything a user actually
        // sees is not. Re-checking inside the transaction is what makes the
        // guard at resolveName mean anything.
        const holder = await repo.findByName(name, tx);
        if (holder && holder.upstreamName !== server.upstreamName) {
          throw new NameConflictError(name);
        }

        const { package: pkg, created: packageCreated } = await repo.upsertPackage(
          {
            name,
            displayName: server.title ?? (primary.manifest.display_name as string) ?? undefined,
            description:
              server.description ?? (primary.manifest.description as string) ?? undefined,
            authorName:
              ((primary.manifest.author as Record<string, unknown>)?.name as string) ?? undefined,
            authorUrl: server.websiteUrl ?? undefined,
            homepage: server.websiteUrl ?? undefined,
            license: (primary.manifest.license as string) ?? undefined,
            iconUrl: (primary.manifest.icon as string) ?? undefined,
            serverType: primary.serverType,
            // Ingested packages are unowned and unverified by definition. They
            // remain claimable, so the real publisher can prove control of the
            // GitHub repo and take the entry over.
            verified: false,
            latestVersion: server.version,
            githubRepo: server.githubRepo,
            source: INGEST_SOURCE,
            upstreamName: server.upstreamName,
          },
          tx,
        );

        const { version, created: versionCreated } = await repo.upsertVersion(
          pkg.id,
          {
            packageId: pkg.id,
            version: server.version,
            manifest: primary.manifest,
            publishedBy: null,
            publishedByEmail: null,
            publishMethod: 'ingest',
            provenanceRepository: server.githubRepo,
            serverJson: entry.server,
          },
          tx,
        );

        if (versionCreated) {
          await repo.updateLatestVersion(pkg.id, server.version, tx);
        }

        for (const d of downloads) {
          await repo.upsertArtifact(
            {
              versionId: version.id,
              os: d.artifact.os,
              arch: d.artifact.arch,
              digest: `sha256:${d.sha256}`,
              sizeBytes: BigInt(d.size),
              storagePath: d.storagePath,
              sourceUrl: d.artifact.sourceUrl,
            },
            tx,
          );
        }

        return { packageCreated, versionCreated, versionId: version.id };
      });
    } catch (err) {
      // The name was taken between the pre-download check and the write. The
      // transaction rolled back, so nothing partial landed; report it the same
      // way the pre-check does.
      if (err instanceof NameConflictError) {
        return { matched: true, skipReason: 'name-conflict', upstreamUpdatedAt: at };
      }
      throw err;
    }

    let scanTriggered = false;

    // Gated on there being no scan row, not on the version being new. The
    // version commits before the scan is triggered, so a K8s blip here used to
    // leave the bundle permanently unscanned: the next run sees the version as
    // current, skips it as unchanged, and never reaches this line again.
    if (options.scanEnabled && !(await hasScan(prisma, written.versionId))) {
      await triggerSecurityScan(prisma, {
        versionId: written.versionId,
        bundleStoragePath: primary.storagePath,
        packageName: name,
        version: server.version,
      });
      scanTriggered = true;
    }

    return {
      matched: true,
      packageCreated: written.packageCreated,
      versionCreated: written.versionCreated,
      artifactsStored: downloads.length,
      bytesStored: downloads.reduce((n, d) => n + d.size, 0),
      scanTriggered,
      scanability: primary.scanability,
    };
  } finally {
    await Promise.all(cleanups.map((fn) => fn()));
  }
}

/**
 * Split `@scope/name` into the parts storage keys are built from.
 *
 * Total on its actual input: names come from `resolveName`, which only ever
 * returns `deriveNames` output, and that always emits a leading `@`.
 */
function splitName(name: string): { scope: string; packageName: string } {
  const m = /^@([^/]+)\/(.+)$/.exec(name);
  if (!m?.[1] || !m[2]) {
    throw new Error(`Unscoped package name reached storage layout: ${name}`);
  }
  return { scope: m[1], packageName: m[2] };
}

/** Whether this version already has a scan row of any status. */
async function hasScan(prisma: PrismaClient, versionId: string): Promise<boolean> {
  const existing = await prisma.securityScan.findFirst({ where: { versionId } });
  return existing !== null;
}

/**
 * Choose the handle to catalogue this server under.
 *
 * Prefers the short form the existing reverse-DNS lookup already guesses, and
 * falls back to the namespace-qualified form when that is taken by a different
 * server. Returns null only when both are taken, which means a genuine clash
 * with a natively published package — a case that must not be silently
 * resolved by overwriting someone's package.
 */
async function resolveName(repo: PackageRepository, server: MappedServer): Promise<string | null> {
  for (const candidate of [server.preferredName, server.qualifiedName]) {
    const holder = await repo.findByName(candidate);
    if (!holder || holder.upstreamName === server.upstreamName) return candidate;
  }
  return null;
}

/**
 * True when every artifact digest upstream declares is already stored against
 * this version. This is the check that keeps a nightly run cheap: the steady
 * state is that nothing changed, and proving that should not cost a download.
 */
async function versionIsCurrent(
  prisma: PrismaClient,
  packageId: string,
  server: MappedServer,
): Promise<boolean> {
  const version = await prisma.packageVersion.findUnique({
    where: { packageId_version: { packageId, version: server.version } },
    include: { artifacts: true },
  });
  if (!version) return false;

  const stored = new Set(version.artifacts.map((a) => a.digest.toLowerCase()));
  return server.artifacts.every((a) => stored.has(`sha256:${a.sha256}`));
}
