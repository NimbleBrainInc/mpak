import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { buildMetricsServer, registerHttpMetrics } from '../src/metrics-server.js';

describe('registry metrics wiring', () => {
  it('labels live requests with the matched route pattern, scraped via the metrics server', async () => {
    const app = Fastify();
    registerHttpMetrics(app);
    app.get('/servers/:id', async () => ({ ok: true }));
    await app.ready();

    const metrics = buildMetricsServer();
    await metrics.ready();

    await app.inject({ method: 'GET', url: '/servers/abc123' });
    await app.inject({ method: 'GET', url: '/no/such/path' }); // 404

    const res = await metrics.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');

    // The load-bearing property: route is the matched PATTERN, never the raw path.
    expect(res.body).toMatch(/http_requests_total\{[^}]*route="\/servers\/:id"[^}]*\} [1-9]/);
    expect(res.body).not.toMatch(/route="\/servers\/abc123"/);
    // Unmatched requests collapse to a single /* series.
    expect(res.body).toMatch(
      /http_requests_total\{[^}]*route="\/\*"[^}]*status="404"[^}]*\} [1-9]/,
    );

    await app.close();
    await metrics.close();
  });
});
