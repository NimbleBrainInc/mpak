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

/**
 * Thrown when the config file cannot be read, parsed, or validated.
 *
 * @param message - Human-readable description of what went wrong
 * @param configPath - Absolute path to the config file that failed
 * @param cause - The underlying error (parse failure, read error, etc.)
 */
export class MpakConfigCorruptedError extends MpakError {
  constructor(
    message: string,
    public readonly configPath: string,
    public override readonly cause?: Error,
  ) {
    super(message, 'CONFIG_CORRUPTED');
    this.name = 'MpakConfigCorruptedError';
  }
}

/**
 * Thrown when required user config fields are missing for a package.
 *
 * @param packageName - The package that requires config
 * @param missingFields - Structured list of missing fields
 */
/**
 * Thrown when cache metadata or manifest is missing, corrupt, or fails validation.
 *
 * @param message - Human-readable description of what went wrong
 * @param filePath - Absolute path to the file that failed
 * @param cause - The underlying error (parse failure, validation error, etc.)
 */
export class MpakCacheCorruptedError extends MpakError {
  constructor(
    message: string,
    public readonly filePath: string,
    public override readonly cause?: Error,
  ) {
    super(message, 'CACHE_CORRUPTED');
    this.name = 'MpakCacheCorruptedError';
  }
}

/**
 * Thrown when a local `.mcpb` bundle is invalid — e.g. manifest is missing,
 * contains invalid JSON, or fails schema validation.
 *
 * @param message - Human-readable description of what went wrong
 * @param bundlePath - Absolute path to the `.mcpb` file
 * @param cause - The underlying error
 */
export class MpakInvalidBundleError extends MpakError {
  constructor(
    message: string,
    public readonly bundlePath: string,
    public override readonly cause?: Error,
  ) {
    super(message, 'INVALID_BUNDLE');
    this.name = 'MpakInvalidBundleError';
  }
}

export class MpakConfigError extends MpakError {
  constructor(
    public readonly packageName: string,
    /**
     * The fields that could not be satisfied by any of the SDK's resolution
     * tiers (override, stored config, env alias, manifest default).
     *
     * `envAliases` lists the host env var names the bundle declared as
     * satisfying this field in its `server.mcp_config.env`. Empty when the
     * bundle has no `${user_config.<field>}` mapping. Always present —
     * consumers never need to re-derive this from the manifest. A friendly
     * error-translator can render a `export ANTHROPIC_API_KEY=...` hint
     * directly from the error without reaching back into the manifest.
     */
    public readonly missingFields: Array<{
      key: string;
      title: string;
      description?: string;
      sensitive: boolean;
      envAliases: string[];
    }>,
  ) {
    const fieldNames = missingFields.map((f) => f.title).join(', ');
    super(`Missing required config for ${packageName}: ${fieldNames}`, 'CONFIG_MISSING');
    this.name = 'MpakConfigError';
  }
}
