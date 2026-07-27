/**
 * Fetching and inspecting an untrusted upstream artifact.
 *
 * This is the layer that touches bytes mpak did not produce, so the assertions
 * here are about refusal: a changed artifact, an oversized one, and something
 * that is not a bundle at all must each fail loudly rather than be mirrored.
 */

import { createHash } from 'node:crypto';
import AdmZip from 'adm-zip';
import { describe, expect, it, vi } from 'vitest';
import {
  BundleDownloadError,
  BundleTooLargeError,
  BundleVerificationError,
  downloadAndVerify,
  inspectBundle,
  NotABundleError,
} from '../src/services/mcp-registry/bundle.js';

interface BuildOptions {
  manifest?: unknown;
  files?: Record<string, string>;
  omitManifest?: boolean;
}

function buildBundle(options: BuildOptions = {}): Buffer {
  const zip = new AdmZip();
  if (!options.omitManifest) {
    zip.addFile(
      'manifest.json',
      Buffer.from(
        JSON.stringify(
          options.manifest ?? {
            manifest_version: '0.3',
            name: 'widget',
            version: '1.0.0',
            server: { type: 'python' },
            tools: [{ name: 'do_thing' }],
          },
        ),
      ),
    );
  }
  for (const [name, content] of Object.entries(options.files ?? {})) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

function writeTemp(buf: Buffer): string {
  const os = require('node:os') as typeof import('node:os');
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const p = path.join(os.tmpdir(), `mpak-test-${Math.random().toString(36).slice(2)}.mcpb`);
  fs.writeFileSync(p, buf);
  return p;
}

function respondWith(buf: Buffer): Response {
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: { 'content-length': String(buf.length) },
  });
}

const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

describe('inspectBundle', () => {
  it('reads the manifest and reports a source bundle as fully scannable', () => {
    const p = writeTemp(
      buildBundle({
        files: { 'server/main.py': 'print(1)', 'requirements.txt': 'requests==2.0' },
      }),
    );

    const result = inspectBundle(p);
    expect(result.serverType).toBe('python');
    expect(result.scanability).toBe('full');
  });

  it('marks a bundle with source but no lockfile as partial', () => {
    const p = writeTemp(buildBundle({ files: { 'server/main.py': 'print(1)' } }));
    expect(inspectBundle(p).scanability).toBe('partial');
  });

  it('marks a compiled bundle opaque, since the source controls cannot run', () => {
    // The distinction that keeps a trust score meaningful: no source means the
    // secret, malicious-pattern, and static-analysis controls have nothing to
    // read. That is absence of evidence, not evidence of absence.
    const p = writeTemp(
      buildBundle({
        manifest: {
          manifest_version: '0.3',
          name: 'widget',
          server: { type: 'binary' },
        },
        files: { 'bin/widget': '\x7fELF binary payload' },
      }),
    );

    const result = inspectBundle(p);
    expect(result.serverType).toBe('binary');
    expect(result.scanability).toBe('opaque');
    expect(result.sourceFileCount).toBe(0);
  });

  it('rejects an archive with no root manifest', () => {
    const p = writeTemp(buildBundle({ omitManifest: true, files: { 'a.py': 'x' } }));
    expect(() => inspectBundle(p)).toThrow(NotABundleError);
  });

  it('rejects a file that is not an archive at all', () => {
    // 53 of the 388 upstream entries tagged `registryType: mcpb` are raw
    // executables or tarballs. They must not reach the catalog.
    const p = writeTemp(Buffer.from('MZ\x90\x00 this is a windows executable'));
    expect(() => inspectBundle(p)).toThrow(NotABundleError);
  });

  it('refuses a manifest that declares an enormous uncompressed size', () => {
    // The download cap bounds *compressed* bytes; this bounds what decompressing
    // would allocate, and an attacker picks the ratio. Measured: a 398KB archive
    // declaring a 400MB manifest costs ~1.7GB RSS on readAsText, and because
    // that is a Buffer it is external memory — --max-old-space-size does not
    // bound it, only the cgroup limit does, which means an OOMKill of a job
    // running with backoffLimit: 0. Anyone can publish to the upstream registry.
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.alloc(8 * 1024 * 1024, 0x20));
    const p = writeTemp(zip.toBuffer());

    // Throws on the declared header size, before anything is decompressed.
    expect(() => inspectBundle(p)).toThrow(/declares \d+ bytes uncompressed/);
  });

  it('rejects a manifest that is not valid JSON', () => {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from('{ not json'));
    const p = writeTemp(zip.toBuffer());
    expect(() => inspectBundle(p)).toThrow(NotABundleError);
  });
});

describe('downloadAndVerify', () => {
  it('accepts an artifact whose bytes match the declared digest', async () => {
    const buf = buildBundle({ files: { 'main.py': 'print(1)' } });
    const fetchImpl = vi.fn().mockResolvedValue(respondWith(buf));

    const result = await downloadAndVerify({
      url: 'https://example.com/widget.mcpb',
      expectedSha256: sha(buf),
      maxBytes: 10_000_000,
      fetchImpl,
    });

    expect(result.size).toBe(buf.length);
    expect(result.inspection.serverType).toBe('python');
    await result.cleanup();
  });

  it('refuses an artifact whose contents changed after publication', async () => {
    // Upstream is a metaregistry and never holds the bytes; a GitHub release
    // asset can be replaced in place. This check is the only thing between that
    // and a mirrored copy mpak would vouch for.
    const buf = buildBundle();
    const fetchImpl = vi.fn().mockResolvedValue(respondWith(buf));

    await expect(
      downloadAndVerify({
        url: 'https://example.com/widget.mcpb',
        expectedSha256: 'f'.repeat(64),
        maxBytes: 10_000_000,
        fetchImpl,
      }),
    ).rejects.toThrow(BundleVerificationError);
  });

  it('refuses an oversized artifact from its declared length', async () => {
    const buf = buildBundle();
    const fetchImpl = vi.fn().mockResolvedValue(respondWith(buf));

    await expect(
      downloadAndVerify({
        url: 'https://example.com/widget.mcpb',
        expectedSha256: sha(buf),
        maxBytes: 10,
        fetchImpl,
      }),
    ).rejects.toThrow(BundleTooLargeError);
  });

  it('enforces the size cap mid-stream when no length is declared', async () => {
    // A server is free to omit or misreport Content-Length, so the cap cannot
    // rely on it.
    const buf = buildBundle({ files: { 'big.py': 'x'.repeat(5000) } });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array(buf), { status: 200 }));

    await expect(
      downloadAndVerify({
        url: 'https://example.com/widget.mcpb',
        expectedSha256: sha(buf),
        maxBytes: 100,
        fetchImpl,
      }),
    ).rejects.toThrow(BundleTooLargeError);
  });

  it('reports a dead release asset as a download failure, not a digest mismatch', async () => {
    // Observed live: an upstream mcpb package pointing at a deleted GitHub
    // release asset. GitHub answers 404 with a 9-byte "Not Found" body. Calling
    // that a digest mismatch would bury real tampering signal under routine
    // upstream churn.
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));

    const err = await downloadAndVerify({
      url: 'https://example.com/widget.mcpb',
      expectedSha256: 'a'.repeat(64),
      maxBytes: 10_000_000,
      fetchImpl,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(BundleDownloadError);
    expect(err).not.toBeInstanceOf(BundleVerificationError);
    expect((err as BundleDownloadError).status).toBe(404);
  });

  it('rejects a verified download that is not a bundle', async () => {
    // Hash-correct and still not ingestable: the digest proves provenance, not
    // that the file is what it claims to be.
    const buf = Buffer.from('MZ\x90\x00 windows executable');
    const fetchImpl = vi.fn().mockResolvedValue(respondWith(buf));

    await expect(
      downloadAndVerify({
        url: 'https://example.com/widget.exe',
        expectedSha256: sha(buf),
        maxBytes: 10_000_000,
        fetchImpl,
      }),
    ).rejects.toThrow(NotABundleError);
  });
});
