import { SECURITY_HEADERS } from '../lib/meta';

/**
 * Liveness and readiness probe. The chart's `healthCheck.path` and the ALB's
 * `healthcheck-path` both point here, so this route existing is what lets a pod
 * go ready — nginx served it before the app rendered on the server.
 *
 * Deliberately does not touch the registry: this reports whether this process
 * can serve, and failing it during a registry blip would restart healthy pods.
 */
export function loader() {
  return Response.json(
    { status: 'ok', service: 'mpak-web' },
    { headers: { ...SECURITY_HEADERS, 'Cache-Control': 'no-store' } },
  );
}
