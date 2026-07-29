import { apiUrl } from './siteConfig';

/**
 * Fetch JSON from the registry, treating an unreachable registry the same as an
 * error response.
 *
 * `fetch` rejects rather than resolving when the connection fails, so guarding
 * only on `res.ok` leaves a rolling registry restart free to turn every
 * server-rendered route into a 500. Callers get `null` and decide how to
 * degrade.
 */
export async function fetchRegistry<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(apiUrl(path), { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Distinguishes "no such package" from "could not ask". */
export type PackageLookup<T> =
  | { status: 'found'; value: T }
  | { status: 'missing' }
  | { status: 'unavailable' };

export async function fetchPackage<T>(name: string): Promise<PackageLookup<T>> {
  try {
    const res = await fetch(apiUrl(`/app/packages/${name}`), {
      headers: { accept: 'application/json' },
    });
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'unavailable' };
    return { status: 'found', value: (await res.json()) as T };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Package names are `@scope/name`. The route captures the rest of the path as a
 * splat, so without this an encoded traversal walks out of `/app/packages/` and
 * into another registry endpoint, which answers 200 with a shape the page
 * cannot render.
 */
const PACKAGE_NAME = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;

export function isPackageName(name: string): boolean {
  return PACKAGE_NAME.test(name);
}
