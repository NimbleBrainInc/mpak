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
  BundleTooLargeError,
  BundleVerificationError,
  downloadAndVerify,
  NotABundleError,
} from './bundle.js';
import type { McpRegistryClient } from './client.js';
import type { MappedArtifact, MappedServer, RejectReason } from './mapper.js';
import { mapServer } from './mapper.js';
import type { UpstreamServerEntry } from './types.js';

export const INGEST_SOURCE = 'mcp-registry';

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
  /** Concurrent server pipelines. Downloads dominate, so this is network-bound. */
  concurrency: number;
  /** Map and verify without writing or storing anything. */
  dryRun?: boolean;
  /** Hard cap on servers processed in one run; undefined means no cap. */
  limit?: number;
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
  skipped: number;
  failed: number;
}

export interface IngestResult extends IngestCounters {
  skipReasons: Record<string, number>;
  scanability: Record<string, number>;
  failures: Array<{ server: string; error: string }>;
  watermark: Date;
}

interface ServerOutcome {
  matched: boolean;
  skipReason?: SkipReason;
  packageCreated?: boolean;
  versionCreated?: boolean;
  artifactsStored?: number;
  bytesStored?: number;
  scanTriggered?: boolean;
  scanability?: string;
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
  const { client, since, limit, logger } = options;
  const watermark = new Date();

  const counters: IngestCounters = {
    serversSeen: 0,
    serversMatched: 0,
    packagesCreated: 0,
    versionsCreated: 0,
    artifactsStored: 0,
    bytesStored: 0,
    scansTriggered: 0,
    skipped: 0,
    failed: 0,
  };
  const skipReasons: Record<string, number> = {};
  const scanability: Record<string, number> = {};
  const failures: Array<{ server: string; error: string }> = [];

  const record = (name: string, outcome: ServerOutcome) => {
    counters.serversSeen += 1;
    if (outcome.matched) counters.serversMatched += 1;

    if (outcome.skipReason) {
      // A server with no MCPB package is the overwhelming majority of upstream
      // and is not interesting enough to count as "skipped" — that number
      // should mean "an MCPB bundle we declined", not "an npm server".
      if (outcome.skipReason !== 'no-mcpb-package') counters.skipped += 1;
      skipReasons[outcome.skipReason] = (skipReasons[outcome.skipReason] ?? 0) + 1;
    }
    if (outcome.error) {
      counters.failed += 1;
      failures.push({ server: name, error: outcome.error });
    }
    if (outcome.packageCreated) counters.packagesCreated += 1;
    if (outcome.versionCreated) counters.versionsCreated += 1;
    if (outcome.artifactsStored) counters.artifactsStored += outcome.artifactsStored;
    if (outcome.bytesStored) counters.bytesStored += outcome.bytesStored;
    if (outcome.scanTriggered) counters.scansTriggered += 1;
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
        });
        logger.warn('Server ingest failed', { server: name, err: String(err) });
      }
    })();

    const tracked = task.finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
    return tracked;
  };

  for await (const entry of client.listServers({ updatedSince: since, version: 'latest' })) {
    if (limit !== undefined && processed >= limit) break;
    processed += 1;

    launch(entry);
    if (inFlight.size >= options.concurrency) await Promise.race(inFlight);
  }

  await Promise.all(inFlight);

  logger.info('Ingest complete', { ...counters, skipReasons, scanability });

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

  const mapped = mapServer(entry);
  if (!mapped.server) {
    return { matched: mapped.reason !== 'no-mcpb-package', skipReason: mapped.reason };
  }
  const server = mapped.server;

  // Upstream marks a removed server 'deleted'. Incremental runs see these
  // because upstream flips include_deleted on whenever updated_since is set,
  // which is exactly how a takedown reaches us.
  if (server.status === 'deleted') {
    if (!dryRun) await markUpstreamStatus(prisma, server, 'deleted');
    return { matched: true, skipReason: 'upstream-deleted' };
  }

  const existing = await repo.findByUpstreamName(server.upstreamName);

  // Layer 3: a version we already hold, whose stored artifact digests match
  // every digest upstream declares, cannot have changed. Skip before the wire.
  if (existing && (await versionIsCurrent(prisma, existing.id, server))) {
    if (!dryRun) await markUpstreamStatus(prisma, server, server.status);
    return { matched: true, skipReason: 'unchanged' };
  }

  const name = await resolveName(repo, server);
  if (!name) return { matched: true, skipReason: 'name-conflict' };

  const downloads: Array<{
    artifact: MappedArtifact;
    storagePath: string | null;
    sha256: string;
    size: number;
    scanability: string;
    manifest: Record<string, unknown>;
    serverType: string;
    cleanup: () => Promise<void>;
  }> = [];

  try {
    for (const artifact of server.artifacts) {
      try {
        const bundle = await downloadAndVerify({
          url: artifact.sourceUrl,
          expectedSha256: artifact.sha256,
          maxBytes: maxBundleBytes,
        });

        let storagePath: string | null = null;
        if (!dryRun) {
          const { scope, packageName } = splitName(name);
          const platform =
            artifact.os === 'any' && artifact.arch === 'any'
              ? undefined
              : `${artifact.os}-${artifact.arch}`;

          const stored = await storage.saveBundleFromStream(
            scope,
            packageName,
            server.version,
            createReadStream(bundle.tempPath),
            bundle.sha256,
            bundle.size,
            platform,
          );
          storagePath = stored.path;
        }

        downloads.push({
          artifact,
          storagePath,
          sha256: bundle.sha256,
          size: bundle.size,
          scanability: bundle.inspection.scanability,
          manifest: bundle.inspection.manifest,
          serverType: bundle.inspection.serverType,
          cleanup: bundle.cleanup,
        });
      } catch (err) {
        // A per-artifact failure fails the whole server rather than storing a
        // partial platform set: a half-mirrored server would advertise a
        // platform matrix it cannot actually serve.
        if (err instanceof BundleTooLargeError) return { matched: true, skipReason: 'too-large' };
        if (err instanceof NotABundleError) {
          logger.warn('Upstream mcpb package is not a bundle', {
            server: server.upstreamName,
            url: artifact.sourceUrl,
            err: err.message,
          });
          return { matched: true, skipReason: 'not-a-bundle' };
        }
        if (err instanceof BundleVerificationError) {
          return { matched: true, skipReason: 'sha-mismatch' };
        }
        return { matched: true, skipReason: 'download-failed' };
      }
    }

    if (downloads.length === 0) return { matched: true, skipReason: 'bad-identifier' };
    if (dryRun) {
      return {
        matched: true,
        artifactsStored: downloads.length,
        bytesStored: downloads.reduce((n, d) => n + d.size, 0),
        scanability: downloads[0]?.scanability,
      };
    }

    const primary = downloads[0];
    if (!primary) return { matched: true, skipReason: 'bad-identifier' };

    const written = await runInTransaction(async (tx) => {
      const { package: pkg, created: packageCreated } = await repo.upsertPackage(
        {
          name,
          displayName: server.title ?? (primary.manifest.display_name as string) ?? undefined,
          description: server.description ?? (primary.manifest.description as string) ?? undefined,
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
          upstreamStatus: server.status,
          upstreamUpdatedAt: server.upstreamUpdatedAt,
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

    let scanTriggered = false;
    // Scan only what we mirrored: the scan pod reads S3 and has no network
    // reach, so an unmirrored artifact has nothing to scan.
    if (options.scanEnabled && written.versionCreated && primary.storagePath) {
      await triggerSecurityScan(prisma, {
        versionId: written.versionId,
        bundleStoragePath: primary.storagePath,
        packageName: name,
        version: server.version,
        scanability: primary.scanability,
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
    await Promise.all(downloads.map((d) => d.cleanup()));
  }
}

/** Split `@scope/name` into the parts storage keys are built from. */
function splitName(name: string): { scope: string; packageName: string } {
  const m = /^@([^/]+)\/(.+)$/.exec(name);
  if (!m) return { scope: 'unscoped', packageName: name };
  return { scope: m[1] ?? 'unscoped', packageName: m[2] ?? name };
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

/**
 * Refresh upstream lifecycle state on a version we already hold.
 *
 * Cheap, and the reason an incremental run still visits servers whose bytes
 * have not changed: a deprecation or takedown upstream is a metadata-only
 * event that must still reach the catalog.
 */
async function markUpstreamStatus(
  prisma: PrismaClient,
  server: MappedServer,
  status: string,
): Promise<void> {
  const pkg = await prisma.package.findUnique({ where: { upstreamName: server.upstreamName } });
  if (!pkg) return;

  await prisma.packageVersion.updateMany({
    where: { packageId: pkg.id, version: server.version },
    data: { upstreamStatus: status, upstreamUpdatedAt: server.upstreamUpdatedAt },
  });
}
