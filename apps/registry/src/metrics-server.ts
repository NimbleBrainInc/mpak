/**
 * Fastify glue for the registry metrics (kept separate from the prom-client
 * registry in metrics.ts so that module stays framework-free and importing it
 * has no side effects).
 */
import Fastify, { type FastifyInstance } from 'fastify';
import { metricsRegistry, recordHttpRequest } from './metrics.js';

/**
 * Register the RED-metrics onResponse hook on the main app. The `route` label
 * is the matched route pattern (`request.routeOptions.url`, e.g. /servers/:id),
 * never the raw path, so path params don't explode cardinality; unmatched
 * requests collapse to `/*`.
 */
export function registerHttpMetrics(app: FastifyInstance): void {
  app.addHook('onResponse', async (request, reply) => {
    recordHttpRequest(
      request.method,
      request.routeOptions?.url ?? '/*',
      reply.statusCode,
      reply.elapsedTime / 1000,
    );
  });
}

/**
 * Build the internal-only server that serves GET /metrics. It is listened on a
 * separate port (not the public app port), so /metrics is reachable only by the
 * in-cluster scraper, never through the catch-all ingress.
 */
export function buildMetricsServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/metrics', async (_request, reply) => {
    reply.header('Content-Type', metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
  return app;
}
