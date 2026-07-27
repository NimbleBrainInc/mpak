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
import { fetchGithubReadme, releaseTagFromAssetUrl } from './readme.js';
import { officialMeta, type UpstreamServerEntry } from './types.js';

/**
 * Default identity for the upstream this job mirrors.
 *
 * Overridable per deployment (`INGEST_SOURCE_ID`) because it partitions state
 * rather than merely labelling it — see the note in config.ts.
 */
export const INGEST_SOURCE = 'mcp-registry';

/**
 * The row this write would land on is not this job's to write.
 *
 * One class with two reasons, because the recovery differs and the reason is
 * what encodes it: `name-conflict` is another publisher holding the handle,
 * which may free up and is therefore retried; `claimed` is this mirror having
 * been taken over through the claim flow, which is permanent and must never
 * drag the watermark back.
 *
 * Thrown from inside the transaction so the write rolls back rather than
 * half-applying.
 */
class NotWritableError extends Error {
  constructor(
    packageName: string,
    readonly reason: 'name-conflict' | 'claimed',
  ) {
    super(`Package ${packageName} is not ingest's to write: ${reason}`);
    this.name = 'NotWritableError';
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
  | 'claimed'
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
  /** Identity of the upstream being mirrored; partitions rows and the watermark. */
  sourceId: string;
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
 * holding the watermark for those would freeze it permanently. `claimed` is
 * likewise absent on purpose: it is not a failure at all but a permanent
 * handover, and holding for it would drag the window back every night for as
 * long as the claim stands.
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

  // Furthest back any hold may reach. A retryable failure pulls the next window
  // back to its own timestamp so it gets another attempt, but a permanently
  // dead asset would otherwise pin the window there forever and every later run
  // would re-read an ever-widening span until activeDeadlineSeconds truncated
  // it. Clamping each hold as it is taken is the same answer as clamping the
  // minimum afterwards, and leaves one bound rather than two.
  const holdbackFloor = new Date(
    runStarted.getTime() - (options.maxHoldbackMs ?? DEFAULT_MAX_HOLDBACK_MS),
  );

  const holdWatermark = (at?: Date) => {
    // A failure carrying no upstream timestamp still has to be re-read, so it
    // falls back to this run's own lower bound — holding there re-reads the
    // window the failure was in. On a full backfill there is no bound to fall
    // back to, and the floor is what keeps the hold from being unbounded.
    const candidate = at ?? since ?? holdbackFloor;
    const held = candidate > holdbackFloor ? candidate : holdbackFloor;
    if (!oldestRetryableFailure || held < oldestRetryableFailure) oldestRetryableFailure = held;
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
      // `failed > 0` marks the run failed for the operator but does not stop the
      // watermark advancing — status and watermark are recorded independently,
      // so the hold is the only thing that gets this entry re-read.
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

  // Each hold was already floored as it was taken, so the oldest one is the
  // answer — capped at the run's start, since a hold in the future would step
  // the window over servers nobody read.
  const watermark =
    oldestRetryableFailure && oldestRetryableFailure < runStarted
      ? oldestRetryableFailure
      : runStarted;

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
    const removed = dryRun ? 0 : await repo.deleteMirror(entry.server.name, options.sourceId);
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

  const existing = await repo.findByUpstreamName(server.upstreamName);

  // A claimed mirror stops being this job's to write, for the same reason
  // deleteMirror refuses one: claiming writes `claimedBy` and never touches
  // `source` or `upstreamName`, so provenance goes on matching forever and only
  // ownership can say whether ingest may still act. Without this, the next
  // upstream release rewrites every field a user actually sees — display name,
  // description, author, homepage, license, icon — plus `latestVersion`, with
  // content from whoever holds the *upstream* entry, who need not be the person
  // who proved GitHub control here.
  if (existing?.claimedBy) {
    return { matched: true, skipReason: 'claimed', upstreamUpdatedAt: at };
  }

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
    readme: string | null;
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

          // createReadStream opens lazily, on the next tick. If the save
          // returns without consuming it — or rejects first — the open lands
          // after cleanup has unlinked the temp file and fails with ENOENT.
          //
          // destroy() does NOT cover that: with no fd yet it defers to the
          // pending open, and the failure surfaces through the stream's error
          // channel regardless. Verified directly — create, don't read,
          // destroy, unlink, and Node raises an uncaught ENOENT, which on a
          // nightly job means one artifact ends the whole run.
          //
          // The save's rejection is our error channel; the stream's is noise
          // about a file we already decided to discard. A real mid-read failure
          // still propagates, because the save rejects on it.
          const body = createReadStream(bundle.tempPath);
          body.on('error', () => {});
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
          readme: bundle.inspection.readme,
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

    // A README the archive shipped wins: it is the description of the exact
    // bytes whose digest was verified. Any artifact in the platform set will
    // do — they are the same server built for different targets, and a
    // Windows-only build is no less authoritative about what the server is.
    //
    // Resolved out here, before the transaction, because the fallback is a
    // network call and nothing is worth holding a write transaction open for.
    let readme = downloads.find((d) => d.readme)?.readme ?? null;
    if (!readme && server.githubRepo) {
      readme = await fetchGithubReadme({
        githubRepo: server.githubRepo,
        ref: releaseTagFromAssetUrl(primary.artifact.sourceUrl),
      });
    }

    let written: { packageCreated: boolean; versionCreated: boolean; versionId: string };
    try {
      written = await runInTransaction(async (tx) => {
        // Both ownership checks ran before a download that can take minutes, so
        // both are re-run here. upsertPackage's update clause would otherwise
        // overwrite the holder's display name, description, author, homepage,
        // license, icon, and repo with third-party content — the provenance
        // columns are creation-only, but everything a user actually sees is
        // not. Re-checking inside the transaction is what makes the earlier
        // guards mean anything.
        const holder = await repo.findByName(name, tx);
        if (holder && holder.upstreamName !== server.upstreamName) {
          throw new NotWritableError(name, 'name-conflict');
        }
        if (holder?.claimedBy) throw new NotWritableError(name, 'claimed');

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
            source: options.sourceId,
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
            readme: readme ?? undefined,
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
      // The row stopped being ours between the pre-download checks and the
      // write. The transaction rolled back, so nothing partial landed; report
      // it under the same reason the corresponding pre-check uses.
      if (err instanceof NotWritableError) {
        return { matched: true, skipReason: err.reason, upstreamUpdatedAt: at };
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
