import type { Artifact } from '@prisma/client';
import { BadRequestError } from '../errors/index.js';

/**
 * Resolve the correct artifact given optional platform query params.
 *
 * - Neither os nor arch → return the any/any (universal) artifact, or null
 * - Only one of os/arch → throws BadRequestError
 * - Both os and arch → return exact match, or null
 *
 * Shared between the legacy `/v1/bundles/.../download` route and the
 * new `/servers/.../download` route so both implement identical
 * platform-selection semantics.
 */
export function resolveArtifact(
  artifacts: Artifact[],
  os?: string,
  arch?: string,
): Artifact | null {
  if ((os && !arch) || (!os && arch)) {
    throw new BadRequestError('Both os and arch are required when specifying platform');
  }

  if (os && arch) {
    return artifacts.find((a) => a.os === os && a.arch === arch) ?? null;
  }

  // No platform params: return universal artifact only
  return artifacts.find((a) => a.os === 'any' && a.arch === 'any') ?? null;
}
