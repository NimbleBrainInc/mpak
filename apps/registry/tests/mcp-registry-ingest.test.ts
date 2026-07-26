/**
 * Ingest pipeline behaviour, with upstream, storage, and the database faked.
 *
 * The property that matters for a nightly job is idempotence: a second run over
 * an unchanged window must do no work, and must prove that without paying for a
 * download. These tests assert on what the pipeline *fetched*, not just what it
 * returned, because "did nothing" and "did the work again and overwrote it with
 * the same values" are indistinguishable from the counters alone.
 */

import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { McpRegistryClient } from '../src/services/mcp-registry/client.js';
import type { IngestLogger } from '../src/services/mcp-registry/ingest.js';
import { runIngest } from '../src/services/mcp-registry/ingest.js';

const silentLogger: IngestLogger = { info: () => {}, warn: () => {}, error: () => {} };

function bundleBuffer(serverType = 'python'): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    'manifest.json',
    Buffer.from(
      JSON.stringify({
        manifest_version: '0.3',
        name: 'widget',
        version: '1.0.0',
        server: { type: serverType },
        tools: [{ name: 'do_thing' }],
      }),
    ),
  );
  zip.addFile('main.py', Buffer.from('print(1)'));
  zip.addFile('requirements.txt', Buffer.from('requests==2.0'));
  return zip.toBuffer();
}

const BUNDLE = bundleBuffer();
const BUNDLE_SHA = createHash('sha256').update(BUNDLE).digest('hex');
const BUNDLE_URL = 'https://github.com/acme/widget/releases/download/v1.0.0/widget.mcpb';

function upstreamEntry(
  over: Record<string, unknown> = {},
  status = 'active',
  updatedAt = '2026-07-01T00:00:00Z',
) {
  return {
    server: {
      name: 'io.github.acme/widget',
      version: '1.0.0',
      description: 'A widget',
      repository: { url: 'https://github.com/acme/widget', source: 'github' },
      packages: [{ registryType: 'mcpb', identifier: BUNDLE_URL, fileSha256: BUNDLE_SHA }],
      ...over,
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': { status, updatedAt },
    },
  };
}

/** Upstream that serves one page of the given entries, then the artifact bytes. */
function fakeUpstream(entries: unknown[], artifact: Buffer | null = BUNDLE) {
  const calls = { list: 0, download: 0 };

  const listFetch = vi.fn().mockImplementation(() => {
    calls.list += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ servers: entries, metadata: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  const downloadFetch = vi.fn().mockImplementation(() => {
    calls.download += 1;
    if (!artifact) return Promise.resolve(new Response('gone', { status: 404 }));
    return Promise.resolve(
      new Response(new Uint8Array(artifact), {
        status: 200,
        headers: { 'content-length': String(artifact.length) },
      }),
    );
  });

  // The pipeline builds its own downloader off global fetch, so the download
  // side is stubbed globally while the client gets its own injected impl.
  vi.stubGlobal('fetch', downloadFetch);

  return {
    client: new McpRegistryClient({ baseUrl: 'https://reg.test/v0', fetchImpl: listFetch }),
    calls,
  };
}

interface FakeState {
  packages: Map<string, { id: string; name: string; upstreamName: string | null }>;
  versions: Map<string, { id: string; packageId: string; version: string; artifacts: unknown[] }>;
}

/**
 * Minimal Prisma stand-in covering only what the pipeline touches. Deliberately
 * hand-written rather than auto-mocked so a query the pipeline starts making
 * shows up as a failure here instead of silently returning undefined.
 */
function fakePrisma(state: FakeState) {
  return {
    packageVersion: {
      findUnique: vi.fn(async ({ where }: never) => {
        const w = (where as { packageId_version: { packageId: string; version: string } })
          .packageId_version;
        return state.versions.get(`${w.packageId}@${w.version}`) ?? null;
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    package: {
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async ({ where }: never) => {
        const w = where as { upstreamName?: string };
        if (!w.upstreamName) return null;
        for (const p of state.packages.values()) {
          if (p.upstreamName === w.upstreamName) return p;
        }
        return null;
      }),
    },
    securityScan: {
      create: vi.fn(async () => ({})),
      // No prior scan by default, so the scan-trigger gate is open.
      findFirst: vi.fn(async () => null),
    },
  } as never;
}

function fakeStorage() {
  return {
    // Drains the stream, like every real implementation does. A fake that
    // accepts the stream and ignores it is not a cheaper stand-in, it is a
    // different contract — the read would open after the temp file is gone and
    // surface as an unhandled error unrelated to what the test asserts.
    saveBundleFromStream: vi.fn(async (_s, _p, _v, stream: NodeJS.ReadableStream) => {
      for await (const _chunk of stream) {
        // discard
      }
      return {
        path: 'acme/widget/1.0.0/widget.mcpb',
        sha256: BUNDLE_SHA,
        size: BUNDLE.length,
      };
    }),
    saveBundle: vi.fn(),
    getBundle: vi.fn(),
    getBundleUrl: vi.fn(),
    getSignedDownloadUrl: vi.fn(),
    getSignedDownloadUrlFromPath: vi.fn(),
    deleteBundle: vi.fn(),
  } as never;
}

const repoMocks = vi.hoisted(() => ({
  findByUpstreamName: vi.fn(),
  findByName: vi.fn(),
  deleteMirror: vi.fn(),
  upsertPackage: vi.fn(),
  upsertVersion: vi.fn(),
  upsertArtifact: vi.fn(),
  updateLatestVersion: vi.fn(),
}));

vi.mock('../src/db/repositories/package.repository.js', () => ({
  PackageRepository: class {
    findByUpstreamName = repoMocks.findByUpstreamName;
    findByName = repoMocks.findByName;
    deleteMirror = repoMocks.deleteMirror;
    upsertPackage = repoMocks.upsertPackage;
    upsertVersion = repoMocks.upsertVersion;
    upsertArtifact = repoMocks.upsertArtifact;
    updateLatestVersion = repoMocks.updateLatestVersion;
  },
}));

vi.mock('../src/db/client.js', () => ({
  runInTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));

function baseOptions(client: McpRegistryClient, prisma: unknown) {
  return {
    client,
    storage: fakeStorage(),
    prisma: prisma as never,
    maxBundleBytes: 10_000_000,
    concurrency: 2,
    scanEnabled: false,
    logger: silentLogger,
  };
}

describe('runIngest', () => {
  let state: FakeState;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    state = { packages: new Map(), versions: new Map() };

    repoMocks.findByUpstreamName.mockResolvedValue(null);
    repoMocks.findByName.mockResolvedValue(null);
    repoMocks.upsertPackage.mockResolvedValue({
      package: { id: 'pkg-1', name: '@acme/widget' },
      created: true,
    });
    repoMocks.upsertVersion.mockResolvedValue({ version: { id: 'ver-1' }, created: true });
    repoMocks.upsertArtifact.mockResolvedValue({});
    repoMocks.updateLatestVersion.mockResolvedValue({});
  });

  it('ingests a new server: downloads, verifies, stores, and records it', async () => {
    const { client, calls } = fakeUpstream([upstreamEntry()]);
    const options = baseOptions(client, fakePrisma(state));

    const result = await runIngest(options);

    expect(calls.download).toBe(1);
    expect(result.packagesCreated).toBe(1);
    expect(result.versionsCreated).toBe(1);
    expect(result.artifactsStored).toBe(1);
    // The histogram is kept for the run report; nothing persists it per-bundle.
    expect(result.scanability).toEqual({ full: 1 });

    // Ingested packages are unowned and unverified, and keep upstream identity.
    const pkgArg = repoMocks.upsertPackage.mock.calls[0]?.[0];
    expect(pkgArg).toMatchObject({
      source: 'mcp-registry',
      upstreamName: 'io.github.acme/widget',
      verified: false,
      githubRepo: 'acme/widget',
    });
    expect(pkgArg.createdBy).toBeUndefined();
    expect(pkgArg.claimedBy).toBeUndefined();

    expect(repoMocks.upsertVersion.mock.calls[0]?.[1]).toMatchObject({
      publishMethod: 'ingest',
    });
    expect(pkgArg.upstreamStatus).toBeUndefined();
  });

  it('skips a server it already holds without downloading anything', async () => {
    // The property that makes a nightly run cheap. Every artifact digest
    // upstream declares is already stored, so the bytes cannot have changed and
    // proving it must not cost a fetch.
    state.packages.set('pkg-1', {
      id: 'pkg-1',
      name: '@acme/widget',
      upstreamName: 'io.github.acme/widget',
    });
    state.versions.set('pkg-1@1.0.0', {
      id: 'ver-1',
      packageId: 'pkg-1',
      version: '1.0.0',
      artifacts: [{ digest: `sha256:${BUNDLE_SHA}` }],
    });
    repoMocks.findByUpstreamName.mockResolvedValue({ id: 'pkg-1', name: '@acme/widget' });

    const { client, calls } = fakeUpstream([upstreamEntry()]);
    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(calls.download).toBe(0);
    expect(result.skipReasons.unchanged).toBe(1);
    expect(result.artifactsStored).toBe(0);
    expect(repoMocks.upsertPackage).not.toHaveBeenCalled();
  });

  it('re-downloads when upstream publishes a different digest for the same version', async () => {
    // A version we hold, but upstream now declares different bytes for it.
    // Trusting the version number alone would pin a stale artifact forever.
    state.packages.set('pkg-1', {
      id: 'pkg-1',
      name: '@acme/widget',
      upstreamName: 'io.github.acme/widget',
    });
    state.versions.set('pkg-1@1.0.0', {
      id: 'ver-1',
      packageId: 'pkg-1',
      version: '1.0.0',
      artifacts: [{ digest: `sha256:${'0'.repeat(64)}` }],
    });
    repoMocks.findByUpstreamName.mockResolvedValue({ id: 'pkg-1', name: '@acme/widget' });

    const { client, calls } = fakeUpstream([upstreamEntry()]);
    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(calls.download).toBe(1);
    expect(result.artifactsStored).toBe(1);
  });

  it('deletes the mirror when upstream takes a server down', async () => {
    // Deleting rather than flagging is the whole point: a route added later
    // cannot serve a taken-down bundle if the row is gone. Scoped to the
    // mirror, so a natively published package is unreachable from here.
    repoMocks.deleteMirror.mockResolvedValue(1);

    const { client, calls } = fakeUpstream([upstreamEntry({}, 'deleted')]);
    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(calls.download).toBe(0);
    expect(result.skipReasons['upstream-deleted']).toBe(1);
    expect(result.mirrorsRemoved).toBe(1);
    expect(repoMocks.deleteMirror).toHaveBeenCalledWith('io.github.acme/widget');
  });

  it('does not delete anything on a dry run', async () => {
    const { client } = fakeUpstream([upstreamEntry({}, 'deleted')]);
    const result = await runIngest({
      ...baseOptions(client, fakePrisma(state)),
      dryRun: true,
    });

    expect(result.skipReasons['upstream-deleted']).toBe(1);
    expect(repoMocks.deleteMirror).not.toHaveBeenCalled();
  });

  it('refuses to overwrite a package another publisher already owns', async () => {
    // Both the short and the qualified handle are taken by rows that are not
    // this upstream server. Claiming one would silently hijack someone's
    // package, so the server is skipped and counted instead.
    repoMocks.findByName.mockResolvedValue({
      id: 'other',
      name: '@acme/widget',
      upstreamName: null,
    });

    const { client, calls } = fakeUpstream([upstreamEntry()]);
    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(result.skipReasons['name-conflict']).toBe(1);
    expect(calls.download).toBe(0);
    expect(repoMocks.upsertPackage).not.toHaveBeenCalled();
  });

  it('rejects an upstream mcpb package that is not a bundle', async () => {
    const notABundle = Buffer.from('MZ\x90\x00 windows executable');
    const sha = createHash('sha256').update(notABundle).digest('hex');

    const { client } = fakeUpstream(
      [
        upstreamEntry({
          packages: [{ registryType: 'mcpb', identifier: BUNDLE_URL, fileSha256: sha }],
        }),
      ],
      notABundle,
    );

    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(result.skipReasons['not-a-bundle']).toBe(1);
    expect(repoMocks.upsertPackage).not.toHaveBeenCalled();
  });

  it('ignores the thousands of upstream servers that ship no MCPB bundle', async () => {
    const npmOnly = upstreamEntry({
      packages: [{ registryType: 'npm', identifier: 'widget-mcp' }],
    });

    const { client, calls } = fakeUpstream([npmOnly, npmOnly, upstreamEntry()]);
    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(result.serversSeen).toBe(3);
    expect(result.serversMatched).toBe(1);
    expect(calls.download).toBe(1);
    // Not counted as "skipped": that number should mean an MCPB bundle we
    // declined, not an npm server that was never in scope.
    expect(result.skipped).toBe(0);
  });

  it('keeps going when one server fails', async () => {
    const bad = upstreamEntry({ name: 'io.github.acme/broken', version: undefined });

    const { client } = fakeUpstream([bad, upstreamEntry()]);
    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(result.skipReasons['no-version']).toBe(1);
    expect(result.packagesCreated).toBe(1);
  });

  it('spends the bundle budget before starting work, not after', async () => {
    // `--max-bundles 2` must mean two downloads, not "two, plus whatever the
    // concurrency window had already started". The check is pure metadata, so
    // the budget is spent before any I/O is launched.
    const entries = Array.from({ length: 5 }, (_, i) => ({
      ...upstreamEntry(),
      server: { ...upstreamEntry().server, name: `io.github.acme/widget-${i}` },
    }));

    const { client, calls } = fakeUpstream(entries);
    const result = await runIngest({ ...baseOptions(client, fakePrisma(state)), maxBundles: 2 });

    expect(calls.download).toBe(2);
    expect(result.serversMatched).toBe(2);
  });

  it('does not let a bundle budget stop a catalog with no bundles in it', async () => {
    // Servers without an MCPB package never touch the budget, so a trial run
    // walks past them rather than terminating on the first page of npm servers.
    const npmOnly = upstreamEntry({
      packages: [{ registryType: 'npm', identifier: 'widget-mcp' }],
    });

    const { client } = fakeUpstream([npmOnly, npmOnly, npmOnly, upstreamEntry()]);
    const result = await runIngest({ ...baseOptions(client, fakePrisma(state)), maxBundles: 1 });

    expect(result.serversSeen).toBe(4);
    expect(result.serversMatched).toBe(1);
    expect(result.packagesCreated).toBe(1);
  });

  it('holds the watermark back to a recent failure so it is retried', async () => {
    // Without this the next window opens after the failure, so the server falls
    // outside every later window — one transient 503 drops a bundle until
    // someone runs --full. backoffLimit: 0 means no job retry covers it.
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { client } = fakeUpstream([upstreamEntry({}, 'active', recent)], null);

    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(result.skipReasons['download-failed']).toBe(1);
    expect(result.watermark.toISOString()).toBe(recent);
  });

  it('stops holding once the failure is older than the bound', async () => {
    // The other half. 21 of the 388 upstream MCPB URLs do not resolve, so
    // without a floor the first backfill pins the window at a dead asset's
    // timestamp and every later run re-reads an ever-widening span.
    const ancient = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { client } = fakeUpstream([upstreamEntry({}, 'active', ancient)], null);

    const before = Date.now();
    const result = await runIngest({
      ...baseOptions(client, fakePrisma(state)),
      maxHoldbackMs: 72 * 60 * 60 * 1000,
    });

    expect(result.skipReasons['download-failed']).toBe(1);
    // Clamped to the floor, not pinned at the failure's own timestamp.
    expect(result.watermark.getTime()).toBeGreaterThan(before - 73 * 60 * 60 * 1000);
    expect(result.watermark.toISOString()).not.toBe(ancient);
  });

  it('does not hold the watermark for a permanently broken bundle', async () => {
    // Not-a-bundle fails identically forever; holding for it would freeze the
    // watermark and make every run re-read the whole catalog.
    const notABundle = Buffer.from('MZ\x90\x00 windows executable');
    const sha = createHash('sha256').update(notABundle).digest('hex');
    const { client } = fakeUpstream(
      [
        upstreamEntry({
          packages: [{ registryType: 'mcpb', identifier: BUNDLE_URL, fileSha256: sha }],
        }),
      ],
      notABundle,
    );

    const before = new Date();
    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(result.skipReasons['not-a-bundle']).toBe(1);
    expect(result.watermark.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('refuses to overwrite a package claimed during the download window', async () => {
    // resolveName sees the name free, then a real publisher claims it while the
    // bundle downloads. Without the in-transaction re-check, upsertPackage's
    // update clause would rewrite their display name, description, author, and
    // repo with third-party content.
    repoMocks.findByName.mockResolvedValueOnce(null); // pre-download check: free
    repoMocks.findByName.mockResolvedValue({
      id: 'other',
      name: '@acme/widget',
      upstreamName: null,
    });

    const { client } = fakeUpstream([upstreamEntry()]);
    const result = await runIngest(baseOptions(client, fakePrisma(state)));

    expect(result.skipReasons['name-conflict']).toBe(1);
    expect(repoMocks.upsertPackage).not.toHaveBeenCalled();
  });

  it('writes nothing in dry-run mode', async () => {
    const { client, calls } = fakeUpstream([upstreamEntry()]);
    const options = { ...baseOptions(client, fakePrisma(state)), dryRun: true };

    const result = await runIngest(options);

    // Still fetches and verifies — a dry run that skipped the download would
    // not tell you whether the corpus is actually ingestable.
    expect(calls.download).toBe(1);
    expect(result.artifactsStored).toBe(1);
    expect(repoMocks.upsertPackage).not.toHaveBeenCalled();
    expect(options.storage.saveBundleFromStream).not.toHaveBeenCalled();
  });
});
