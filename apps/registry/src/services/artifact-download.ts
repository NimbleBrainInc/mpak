/**
 * Where to send a caller for an artifact's bytes.
 *
 * mpak holds two kinds of artifact. A mirrored one has a copy in our storage
 * and is served from there, signed. A pointer-only one was catalogued but never
 * copied — the case for a bundle too large to mirror — and the only address for
 * it is the upstream URL it was published at.
 *
 * The rule lives here rather than at each call site because the fallback is
 * easy to forget, and forgetting it turns a listable package into a download
 * that throws.
 */

import type { StorageService } from '../plugins/storage.js';

export interface DownloadableArtifact {
  /** Our storage key, or null when the artifact was never mirrored. */
  storagePath: string | null;
  /** The upstream URL the artifact was published at. */
  sourceUrl: string;
}

export interface ResolvedArtifactUrl {
  url: string;
  /**
   * 'mirror' — served from mpak storage, hash-verified at ingest or publish.
   * 'upstream' — a redirect to the publisher; mpak has not verified these bytes
   * and cannot have scanned them.
   */
  origin: 'mirror' | 'upstream';
}

/**
 * Resolve an artifact to a URL, preferring our verified copy.
 *
 * Returns null when neither a mirror nor a source URL exists, which callers
 * should treat as "this artifact is not retrievable" rather than as an error to
 * throw past — the catalog entry itself is still valid.
 */
export async function resolveArtifactUrl(
  storage: StorageService,
  artifact: DownloadableArtifact,
): Promise<ResolvedArtifactUrl | null> {
  if (artifact.storagePath) {
    return {
      url: await storage.getSignedDownloadUrlFromPath(artifact.storagePath),
      origin: 'mirror',
    };
  }
  if (artifact.sourceUrl) {
    return { url: artifact.sourceUrl, origin: 'upstream' };
  }
  return null;
}
