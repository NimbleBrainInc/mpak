import { describe, it, expect } from 'vitest';
import {
  MpakError,
  MpakNotFoundError,
  MpakIntegrityError,
  MpakNetworkError,
} from '../src/errors.js';

describe('MpakError', () => {
  it('inherits from Error', () => {
    const error = new MpakError('test message', 'TEST_CODE');
    expect(error).toBeInstanceOf(Error);
  });

  it('can be caught as Error', () => {
    const throwAndCatch = () => {
      try {
        throw new MpakError('test', 'TEST');
      } catch (e) {
        if (e instanceof Error) {
          return e.message;
        }
        return 'not an error';
      }
    };
    expect(throwAndCatch()).toBe('test');
  });

  it('stores status code when provided', () => {
    const error = new MpakError('test', 'TEST', 500);
    expect(error.statusCode).toBe(500);
  });

  it('leaves status code undefined when not provided', () => {
    const error = new MpakError('test', 'TEST');
    expect(error.statusCode).toBeUndefined();
  });
});

describe('MpakNotFoundError', () => {
  it('formats resource name in message', () => {
    const error = new MpakNotFoundError('@nimbletools/folk-crm@1.0.0');
    expect(error.message).toContain('@nimbletools/folk-crm@1.0.0');
  });

  it('uses NOT_FOUND code', () => {
    const error = new MpakNotFoundError('test');
    expect(error.code).toBe('NOT_FOUND');
  });

  it('sets HTTP 404 status', () => {
    const error = new MpakNotFoundError('test');
    expect(error.statusCode).toBe(404);
  });

  it('can be caught as MpakError', () => {
    const throwAndCatch = () => {
      try {
        throw new MpakNotFoundError('resource');
      } catch (e) {
        if (e instanceof MpakError) {
          return e.code;
        }
        return 'not MpakError';
      }
    };
    expect(throwAndCatch()).toBe('NOT_FOUND');
  });
});

describe('MpakIntegrityError', () => {
  it('stores expected and actual hashes', () => {
    const error = new MpakIntegrityError('abc123expected', 'def456actual');
    expect(error.expected).toBe('abc123expected');
    expect(error.actual).toBe('def456actual');
  });

  it('includes both hashes in message', () => {
    const error = new MpakIntegrityError('expected', 'actual');
    expect(error.message).toContain('expected');
    expect(error.message).toContain('actual');
  });

  it('uses INTEGRITY_MISMATCH code', () => {
    const error = new MpakIntegrityError('a', 'b');
    expect(error.code).toBe('INTEGRITY_MISMATCH');
  });

  it('enables fail-closed error handling pattern', () => {
    // This test verifies the error can be used for fail-closed integrity checks
    // where content should NOT be returned on mismatch
    const performIntegrityCheck = (content: string, expectedHash: string) => {
      const actualHash = 'computed_hash';
      if (actualHash !== expectedHash) {
        throw new MpakIntegrityError(expectedHash, actualHash);
      }
      return content;
    };

    expect(() => performIntegrityCheck('secret', 'wrong_hash')).toThrow(MpakIntegrityError);
  });
});

describe('MpakNetworkError', () => {
  it('uses NETWORK_ERROR code', () => {
    const error = new MpakNetworkError('Connection refused');
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('preserves original error message', () => {
    const error = new MpakNetworkError('ETIMEDOUT');
    expect(error.message).toBe('ETIMEDOUT');
  });

  it('can be distinguished from other MpakErrors', () => {
    const networkError = new MpakNetworkError('timeout');
    const notFoundError = new MpakNotFoundError('resource');

    expect(networkError).toBeInstanceOf(MpakNetworkError);
    expect(networkError).not.toBeInstanceOf(MpakNotFoundError);
    expect(notFoundError).not.toBeInstanceOf(MpakNetworkError);
  });
});

describe('Error hierarchy', () => {
  it('all errors inherit from MpakError', () => {
    const errors = [
      new MpakNotFoundError('test'),
      new MpakIntegrityError('a', 'b'),
      new MpakNetworkError('test'),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(MpakError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it('allows catching all SDK errors with MpakError', () => {
    const errorFactories = [
      () => new MpakNotFoundError('test'),
      () => new MpakIntegrityError('a', 'b'),
      () => new MpakNetworkError('test'),
    ];

    for (const createError of errorFactories) {
      expect(() => {
        try {
          throw createError();
        } catch (e) {
          if (e instanceof MpakError) {
            throw e;
          }
        }
      }).toThrow(MpakError);
    }
  });
});
