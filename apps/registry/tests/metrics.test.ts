import { describe, expect, it } from 'vitest';
import { enableDefaultMetrics, metricsRegistry, recordHttpRequest } from '../src/metrics.js';

describe('registry metrics', () => {
  it('records http_requests_total + duration by method/route/status', async () => {
    recordHttpRequest('GET', '/servers/:id', 200, 0.012);
    const out = await metricsRegistry.metrics();
    expect(out).toMatch(
      /http_requests_total\{[^}]*method="GET"[^}]*route="\/servers\/:id"[^}]*status="200"[^}]*\} [1-9]/,
    );
    expect(out).toMatch(
      /http_request_duration_seconds_count\{[^}]*route="\/servers\/:id"[^}]*\} [1-9]/,
    );
  });

  it('clamps non-standard methods to OTHER', async () => {
    recordHttpRequest('PROPFIND', '/x', 200, 0.01);
    const out = await metricsRegistry.metrics();
    expect(out).toMatch(/http_requests_total\{[^}]*method="OTHER"[^}]*\}/);
  });

  it('collapses an empty route to /*', async () => {
    recordHttpRequest('GET', '', 404, 0.001);
    const out = await metricsRegistry.metrics();
    expect(out).toMatch(/route="\/\*"/);
  });

  it('exposes default process metrics once enabled', async () => {
    enableDefaultMetrics();
    const out = await metricsRegistry.metrics();
    expect(out).toContain('process_');
  });
});
