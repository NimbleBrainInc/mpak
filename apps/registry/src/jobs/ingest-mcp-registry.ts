/**
 * Entrypoint for the MCP Registry ingest job.
 *
 * Runs as a K8s CronJob (nightly) or by hand. Owns the run lifecycle: claim a
 * window, do the work, and record the outcome. The pipeline itself lives in
 * `services/mcp-registry/ingest.ts`.
 *
 *   npm run ingest:mcp-registry -- --dry-run --limit 50
 */

import { config, validateConfig, validateIngestMemory } from '../config.js';
import { disconnectDatabase, getPrismaClient } from '../db/client.js';
import { createStorageService } from '../plugins/storage.js';
import { McpRegistryClient } from '../services/mcp-registry/client.js';
import type { IngestLogger, IngestResult } from '../services/mcp-registry/ingest.js';
import { runIngest } from '../services/mcp-registry/ingest.js';

interface CliArgs {
  dryRun: boolean;
  full: boolean;
  limit?: number;
  maxBundles?: number;
  concurrency?: number;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false, full: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--dry-run':
        args.dryRun = true;
        break;
      // Ignore the stored watermark and re-read the whole upstream catalog.
      // The recovery path when a bug caused a window to be processed wrongly:
      // the watermark says "done", and only a full pass disagrees.
      case '--full':
        args.full = true;
        break;
      case '--limit': {
        const value = Number(argv[++i]);
        if (!Number.isInteger(value) || value <= 0) {
          throw new Error('--limit requires a positive integer');
        }
        args.limit = value;
        break;
      }
      // The bound you want for a trial run. `--limit` counts servers read from
      // upstream, of which only ~2% carry a bundle, so `--limit 10` reliably
      // finds none.
      case '--max-bundles': {
        const value = Number(argv[++i]);
        if (!Number.isInteger(value) || value <= 0) {
          throw new Error('--max-bundles requires a positive integer');
        }
        args.maxBundles = value;
        break;
      }
      case '--concurrency': {
        const value = Number(argv[++i]);
        if (!Number.isInteger(value) || value <= 0) {
          throw new Error('--concurrency requires a positive integer');
        }
        args.concurrency = value;
        break;
      }
      default:
        if (arg?.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return args;
}

/**
 * How a finished run is recorded.
 *
 * Extracted because it is the decision this job exists to get right, and it
 * lived untested inside main() for five review rounds — which is how the
 * watermark freeze above survived that long.
 */
export function summarizeRun(result: Pick<IngestResult, 'failed' | 'watermark'>): {
  status: 'completed' | 'failed';
  watermark: Date | null;
} {
  return {
    status: result.failed > 0 ? 'failed' : 'completed',
    // Written through as-is, `null` included. A run that stopped short of the
    // end of its window has no instant it is safe to resume from, and stores
    // none; `resolveSince` selects the newest row that has one, so the next run
    // re-reads from wherever the last *complete* pass reached. Status stays
    // independent of this — a bounded run did its work and is not a failure.
    watermark: result.watermark,
  };
}

const logger: IngestLogger = {
  info: (msg, fields) => console.log(JSON.stringify({ level: 'info', msg, ...fields })),
  warn: (msg, fields) => console.warn(JSON.stringify({ level: 'warn', msg, ...fields })),
  error: (msg, fields) => console.error(JSON.stringify({ level: 'error', msg, ...fields })),
};

/**
 * Resolve the lower bound for this run.
 *
 * Only a completed run may advance the watermark, so a crash mid-window leaves
 * the next run reading that same window rather than stepping over servers it
 * never stored. The overlap is subtracted on top of that: upstream's
 * `updated_since` filter and our clock need not agree to the millisecond, and
 * re-reading is cheap while a gap is invisible.
 */
async function resolveSince(full: boolean): Promise<Date | undefined> {
  if (full) return undefined;

  const prisma = getPrismaClient();
  // Any run that recorded a watermark, not just a clean one. Status answers
  // "was this run clean"; the watermark answers "how far did it get", and
  // conflating them let a single recurring failure freeze the window forever —
  // every subsequent run marked failed, every one re-reading an ever-widening
  // span. A run that got somewhere is worth resuming from even if it also had
  // failures, which is why runIngest floors the watermark rather than
  // discarding it.
  const last = await prisma.registrySync.findFirst({
    where: { source: config.ingest.sourceId, watermark: { not: null } },
    orderBy: { completedAt: 'desc' },
  });

  if (!last?.watermark) return undefined;
  return new Date(last.watermark.getTime() - config.ingest.overlapMinutes * 60_000);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);

  // The job is a separate entrypoint from the API server, so it does not
  // inherit index.ts's startup validation. Without this the memory budget the
  // chart advertises would never be enforced anywhere the ingest actually runs.
  validateConfig();

  // Re-checked against the *resolved* concurrency: --concurrency overrides the
  // config value after validateConfig has already passed on it.
  const concurrency = args.concurrency ?? config.ingest.concurrency;
  const memoryError = validateIngestMemory(concurrency);
  if (memoryError) {
    logger.error('Refusing to start', { err: memoryError });
    return 1;
  }

  const prisma = getPrismaClient();

  const since = await resolveSince(args.full);
  const { storage, description } = await createStorageService();
  logger.info('Storage resolved', { storage: description });

  const client = new McpRegistryClient({
    baseUrl: config.ingest.registryUrl,
    requestTimeoutMs: config.ingest.requestTimeoutMs,
  });

  // Claim the run before doing any work. A dry run deliberately writes no row:
  // it must not look like a completed window, or it would advance the watermark
  // past servers it never actually ingested.
  const run = args.dryRun
    ? null
    : await prisma.registrySync.create({
        data: { source: config.ingest.sourceId, status: 'running', since },
      });

  let result: IngestResult | undefined;
  try {
    result = await runIngest({
      client,
      storage,
      prisma,
      since,
      maxBundleBytes: config.ingest.maxBundleSizeMB * 1024 * 1024,
      maxHoldbackMs: config.ingest.maxHoldbackHours * 60 * 60 * 1000,
      concurrency,
      downloadTimeoutMs: config.ingest.downloadTimeoutMs,
      dryRun: args.dryRun,
      limit: args.limit,
      maxBundles: args.maxBundles,
      scanEnabled: config.scanner.enabled,
      sourceId: config.ingest.sourceId,
      logger,
    });

    if (run) {
      await prisma.registrySync.update({
        where: { id: run.id },
        data: {
          // Status is for the operator; the watermark is for the next run.
          // Recorded independently — see resolveSince.
          ...summarizeRun(result),
          completedAt: new Date(),
          serversSeen: result.serversSeen,
          serversMatched: result.serversMatched,
          packagesCreated: result.packagesCreated,
          versionsCreated: result.versionsCreated,
          artifactsStored: result.artifactsStored,
          bytesStored: BigInt(result.bytesStored),
          scansTriggered: result.scansTriggered,
          mirrorsRemoved: result.mirrorsRemoved,
          skipped: result.skipped,
          failed: result.failed,
          report: {
            skipReasons: result.skipReasons,
            scanability: result.scanability,
            // Bounded: the point is a representative sample for triage, not an
            // unbounded blob in a row every other query has to read past.
            failures: result.failures.slice(0, 100),
          },
        },
      });
    }

    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Ingest run failed', { err: message });

    if (run) {
      await prisma.registrySync
        .update({
          where: { id: run.id },
          data: { status: 'failed', completedAt: new Date(), error: message },
        })
        .catch(() => {});
    }

    return 1;
  }
}

// Only self-execute as a program, so tests can import parseArgs/main freely.
if (process.argv[1]?.includes('ingest-mcp-registry')) {
  main()
    .then(async (code) => {
      await disconnectDatabase();
      process.exit(code);
    })
    .catch(async (err) => {
      console.error(err);
      await disconnectDatabase();
      process.exit(1);
    });
}
