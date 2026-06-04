/**
 * Prometheus metrics for the registry API.
 *
 * Served at GET /metrics on a SEPARATE internal port (see index.ts), never on
 * the public app: the registry's ingress is a catch-all (`/` -> registry), so
 * exposing /metrics on the main app would publish request volumes, latencies,
 * and the route inventory at registry.mpak.dev/metrics. The metrics port is not
 * on the ingress; only the in-cluster ServiceMonitor reaches it.
 *
 * Metric names and labels deliberately match the agent runtime's /metrics so
 * dashboards and alert rules query both services identically.
 *
 * Dedicated Registry (not the global default) so importing this module has no
 * global side effects; default process metrics are opt-in via
 * enableDefaultMetrics().
 */
import { Counter, collectDefaultMetrics, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

let defaultMetricsEnabled = false;

/** Enable process/runtime metrics (CPU, memory, GC). Idempotent. */
export function enableDefaultMetrics(): void {
  if (defaultMetricsEnabled) return;
  collectDefaultMetrics({ register: metricsRegistry });
  defaultMetricsEnabled = true;
}

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled by the registry API.',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

// `method` is the one label sourced from the raw request. The verb set is
// effectively fixed, but the HTTP grammar allows arbitrary method tokens, so
// clamp to the standard verbs to keep cardinality bounded; bucket the rest.
const STANDARD_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

/**
 * Record one finished request. `route` must be the matched route pattern
 * (e.g. `/servers/:id`), never the raw path, so path params don't explode
 * label cardinality; unmatched requests collapse to `/*`.
 */
export function recordHttpRequest(
  method: string,
  route: string,
  status: number,
  seconds: number,
): void {
  const labels = {
    method: STANDARD_METHODS.has(method) ? method : 'OTHER',
    route: route || '/*',
    status: String(status),
  };
  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, seconds);
}
