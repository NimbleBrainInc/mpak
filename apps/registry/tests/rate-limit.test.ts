/**
 * A rate-limited request answers 429, not 500.
 *
 * @fastify/rate-limit throws a plain Error carrying statusCode 429 after it has
 * set the rate-limit headers on the reply. The global error handler must keep
 * that status and those headers rather than treating the error as a server fault.
 */

import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeError } from '../src/errors/handler.js';
import { errorHandler } from '../src/errors/middleware.js';
import { createTestApp } from './helpers.js';

describe('rate limiting', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  async function appLimitedTo(max: number): Promise<FastifyInstance> {
    const instance = await createTestApp();
    instance.setErrorHandler(errorHandler);
    await instance.register(rateLimit, { max, timeWindow: '1 minute' });
    instance.get('/limited', async () => ({ ok: true }));
    await instance.ready();
    return instance;
  }

  it('answers 429 RATE_LIMITED with retry-after once the limit is exceeded', async () => {
    app = await appLimitedTo(2);

    for (let i = 0; i < 2; i++) {
      const ok = await app.inject({ method: 'GET', url: '/limited' });
      expect(ok.statusCode).toBe(200);
    }

    const limited = await app.inject({ method: 'GET', url: '/limited' });

    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.headers['x-ratelimit-limit']).toBe('2');
    expect(limited.headers['x-ratelimit-remaining']).toBe('0');
  });
});

describe('normalizeError with a client status', () => {
  function errorWithStatus(message: string, statusCode: number): Error {
    return Object.assign(new Error(message), { statusCode });
  }

  it('keeps a 4xx status a plugin raised', () => {
    const err = normalizeError(errorWithStatus('Request body is too large', 413));
    expect(err.statusCode).toBe(413);
    expect(err.code).toBe('PAYLOAD_TOO_LARGE');
    expect(err.isOperational).toBe(true);
  });

  it('still hides a 5xx status behind INTERNAL_ERROR', () => {
    const err = normalizeError(errorWithStatus('upstream exploded', 502));
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).not.toContain('upstream');
  });
});
