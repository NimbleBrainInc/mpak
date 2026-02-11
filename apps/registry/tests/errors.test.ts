/**
 * Error handling unit tests.
 *
 * Tests error types, normalization, and response formatting.
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  InternalServerError,
  DatabaseError,
  TransactionTimeoutError,
  ServiceUnavailableError,
} from '../src/errors/types.js';
import { normalizeError, formatErrorResponse } from '../src/errors/handler.js';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

describe('Error Types', () => {
  it('BadRequestError has status 400 and BAD_REQUEST code', () => {
    const err = new BadRequestError('invalid input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('invalid input');
    expect(err.isOperational).toBe(true);
  });

  it('UnauthorizedError has status 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.isOperational).toBe(true);
  });

  it('ForbiddenError has status 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('NotFoundError has status 404', () => {
    const err = new NotFoundError('not here');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('not here');
  });

  it('ConflictError has status 409', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('ValidationError has status 422', () => {
    const err = new ValidationError();
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('InternalServerError is non-operational (status 500)', () => {
    const err = new InternalServerError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.isOperational).toBe(false);
  });

  it('DatabaseError is non-operational (status 500)', () => {
    const err = new DatabaseError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('DATABASE_ERROR');
    expect(err.isOperational).toBe(false);
  });

  it('ServiceUnavailableError has status 503', () => {
    const err = new ServiceUnavailableError();
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('TransactionTimeoutError has status 500 and is operational', () => {
    const err = new TransactionTimeoutError();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('TRANSACTION_TIMEOUT');
    expect(err.isOperational).toBe(true);
  });

  it('supports optional details', () => {
    const err = new BadRequestError('bad', { field: 'name' });
    expect(err.details).toEqual({ field: 'name' });
  });

  it('AppError has proper prototype chain', () => {
    const err = new NotFoundError();
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// normalizeError
// ---------------------------------------------------------------------------

describe('normalizeError', () => {
  it('passes through AppError instances', () => {
    const original = new BadRequestError('test');
    const result = normalizeError(original);
    expect(result).toBe(original);
  });

  it('converts generic Error to InternalServerError', () => {
    const err = normalizeError(new Error('oops'));
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('converts unknown non-Error values to InternalServerError', () => {
    const err = normalizeError('string error');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
  });

  it('converts Prisma P2002 (unique constraint) to ConflictError', () => {
    const prismaError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['name'] },
      clientVersion: '5.0.0',
    });
    const err = normalizeError(prismaError);
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('converts Prisma P2025 (record not found) to NotFoundError', () => {
    const prismaError = Object.assign(new Error('Record not found'), {
      code: 'P2025',
      meta: {},
      clientVersion: '5.0.0',
    });
    const err = normalizeError(prismaError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('converts Prisma P2003 (foreign key) to BadRequestError', () => {
    const prismaError = Object.assign(new Error('Foreign key failed'), {
      code: 'P2003',
      meta: {},
      clientVersion: '5.0.0',
    });
    const err = normalizeError(prismaError);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('converts Prisma P2024 (transaction timeout) to TransactionTimeoutError', () => {
    const prismaError = Object.assign(new Error('Timed out'), {
      code: 'P2024',
      meta: {},
      clientVersion: '5.0.0',
    });
    const err = normalizeError(prismaError);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('TRANSACTION_TIMEOUT');
  });
});

// ---------------------------------------------------------------------------
// formatErrorResponse
// ---------------------------------------------------------------------------

describe('formatErrorResponse', () => {
  it('formats error without details', () => {
    const err = new NotFoundError('Bundle not found');
    const response = formatErrorResponse(err);
    expect(response).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Bundle not found',
      },
    });
  });

  it('includes details when present', () => {
    const err = new BadRequestError('Invalid', { field: 'name' });
    const response = formatErrorResponse(err);
    expect(response.error.details).toEqual({ field: 'name' });
  });

  it('omits details when empty', () => {
    const err = new BadRequestError('Invalid', {});
    const response = formatErrorResponse(err);
    expect(response.error.details).toBeUndefined();
  });
});
