/**
 * Base error class for mpak SDK errors
 */
export class MpakError extends Error {
  code: string;
  statusCode: number | undefined;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'MpakError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Thrown when a requested resource is not found (404)
 */
export class MpakNotFoundError extends MpakError {
  constructor(resource: string) {
    super(`Resource not found: ${resource}`, 'NOT_FOUND', 404);
    this.name = 'MpakNotFoundError';
  }
}

/**
 * Thrown when integrity verification fails (hash mismatch)
 * This is a fail-closed error - content is NOT returned when this is thrown
 */
export class MpakIntegrityError extends MpakError {
  expected: string;
  actual: string;

  constructor(expected: string, actual: string) {
    super(`Integrity mismatch: expected ${expected}, got ${actual}`, 'INTEGRITY_MISMATCH');
    this.name = 'MpakIntegrityError';
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Thrown for network-related failures (timeouts, connection errors)
 */
export class MpakNetworkError extends MpakError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
    this.name = 'MpakNetworkError';
  }
}
