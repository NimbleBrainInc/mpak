import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';

/**
 * Current config schema version.
 */
export const CONFIG_VERSION = '1.0.0';

/**
 * Zod schema for per-package user configuration.
 * Each key-value pair represents a user-supplied config value
 * (e.g. API keys, workspace IDs) referenced via `${user_config.*}` in manifests.
 */
const PackageConfigSchema = z.record(z.string(), z.string());

/**
 * Zod schema for the mpak config file (`config.json`).
 *
 * `.strict()` rejects unknown fields — if the file contains keys we don't
 * recognise, it's treated as corrupted rather than silently ignored.
 */
const MpakConfigSchema = z
  .object({
    version: z.string(),
    lastUpdated: z.string(),
    registryUrl: z.string().optional(),
    packages: z.record(z.string(), PackageConfigSchema).optional(),
  })
  .strict();

/**
 * Per-package user configuration — a string-to-string map of values
 * that bundles reference via `${user_config.*}` placeholders.
 */
export type PackageConfig = z.infer<typeof PackageConfigSchema>;

/**
 * The full shape of the mpak config file.
 *
 * - `version` — schema version (always {@link CONFIG_VERSION})
 * - `lastUpdated` — ISO timestamp, updated on every write
 * - `registryUrl` — optional registry URL override
 * - `packages` — per-package user config values keyed by scoped package name
 */
export type MpakConfig = z.infer<typeof MpakConfigSchema>;

/**
 * Thrown when the config file cannot be read, parsed, or validated.
 *
 * @param message - Human-readable description of what went wrong
 * @param configPath - Absolute path to the config file that failed
 * @param cause - The underlying error (parse failure, read error, etc.)
 */
export class ConfigCorruptedError extends Error {
  constructor(
    message: string,
    public readonly configPath: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ConfigCorruptedError';
  }
}


/**
 * Manages the mpak user configuration file (`config.json`).
 *
 * Handles:
 * - **Registry URL** — custom registry endpoint with env var fallback
 * - **Per-package config** — key-value pairs for `${user_config.*}` substitution
 *
 * The config is lazy-loaded on first access and cached in memory.
 * All writes update the `lastUpdated` timestamp and flush to disk
 * with `0o600` permissions (owner read/write only).
 *
 * @example
 * ```ts
 * // Default: ~/.mpak/config.json
 * const config = new ConfigManager();
 *
 * // Custom home and registry URL
 * const config = new ConfigManager({ mpakHome: '/tmp/test-mpak', registryUrl: 'https://custom.registry.dev' });
 *
 * // Registry URL (config > env var > default)
 * config.getRegistryUrl();
 *
 * // Per-package user config for ${user_config.*} substitution
 * config.setPackageConfigValue('@scope/bundle', 'api_key', 'sk-...');
 * config.getPackageConfigValue('@scope/bundle', 'api_key'); // 'sk-...'
 * ```
 */
export class ConfigManager {
  readonly mpakHome: string;
  private configFile: string;
  private config: MpakConfig | null = null;

  constructor(options?: { mpakHome?: string; registryUrl?: string }) {
    this.mpakHome = resolve(options?.mpakHome ?? join(homedir(), '.mpak'));
    this.configFile = join(this.mpakHome, 'config.json');
    this.ensureConfigDir();
    if (options?.registryUrl !== undefined) {
      this.setRegistryUrl(options.registryUrl);
    }
  }

  // ===========================================================================
  // Public methods
  // ===========================================================================

  /**
   * Load the config from disk, or create a fresh one if the file doesn't exist yet.
   * The result is cached — subsequent calls return the in-memory copy without
   * re-reading the file.
   *
   * @returns The validated config object
   * @throws {ConfigCorruptedError} If the file exists but contains invalid JSON or fails schema validation
   */
  loadConfig(): MpakConfig {
    if (this.config) {
      return this.config;
    }

    if (!existsSync(this.configFile)) {
      this.config = {
        version: CONFIG_VERSION,
        lastUpdated: new Date().toISOString(),
      };
      this.saveConfig();
      return this.config;
    }

    this.config = this.readAndValidate();
    return this.config;
  }

  /**
   * Persist a custom registry URL to the config file.
   *
   * @param url - The registry URL to save (e.g. `https://registry.example.com`)
   */
  setRegistryUrl(url: string): void {
    const config = this.loadConfig();
    config.registryUrl = url;
    this.saveConfig();
  }

  /**
   * Resolve the registry URL with a 3-tier fallback:
   * 1. Saved value in config file
   * 2. `MPAK_REGISTRY_URL` environment variable
   * 3. Default: `https://registry.mpak.dev`
   *
   * @returns The resolved registry URL
   */
  getRegistryUrl(): string {
    const config = this.loadConfig();
    return config.registryUrl || process.env['MPAK_REGISTRY_URL'] || 'https://registry.mpak.dev';
  }

  /**
   * Get all stored user config values for a package.
   *
   * @param packageName - Scoped package name (e.g. `@scope/bundle`)
   * @returns The key-value map, or `undefined` if the package has no stored config
   */
  getPackageConfig(packageName: string): PackageConfig | undefined {
    const config = this.loadConfig();
    return config.packages?.[packageName];
  }

  /**
   * Get a single user config value for a package.
   *
   * @param packageName - Scoped package name (e.g. `@scope/bundle`)
   * @param key - The config key (e.g. `api_key`)
   * @returns The value, or `undefined` if not set
   */
  getPackageConfigValue(packageName: string, key: string): string | undefined {
    const packageConfig = this.getPackageConfig(packageName);
    return packageConfig?.[key];
  }

  /**
   * Store a user config value for a package. Creates the package entry if needed.
   *
   * @param packageName - Scoped package name (e.g. `@scope/bundle`)
   * @param key - The config key (e.g. `api_key`)
   * @param value - The value to store
   */
  setPackageConfigValue(packageName: string, key: string, value: string): void {
    const config = this.loadConfig();
    if (!config.packages) {
      config.packages = {};
    }
    if (!config.packages[packageName]) {
      config.packages[packageName] = {};
    }
    config.packages[packageName][key] = value;
    this.saveConfig();
  }

  /**
   * Remove all stored config for a package.
   *
   * @param packageName - Scoped package name (e.g. `@scope/bundle`)
   * @returns `true` if the package had config that was removed, `false` if it didn't exist
   */
  clearPackageConfig(packageName: string): boolean {
    const config = this.loadConfig();
    if (config.packages?.[packageName]) {
      delete config.packages[packageName];
      this.saveConfig();
      return true;
    }
    return false;
  }

  /**
   * Remove a single config value for a package. If this was the last key,
   * the package entry is cleaned up entirely.
   *
   * @param packageName - Scoped package name (e.g. `@scope/bundle`)
   * @param key - The config key to remove
   * @returns `true` if the key existed and was removed, `false` otherwise
   */
  clearPackageConfigValue(packageName: string, key: string): boolean {
    const config = this.loadConfig();
    if (config.packages?.[packageName]?.[key] !== undefined) {
      delete config.packages[packageName][key];
      if (Object.keys(config.packages[packageName]).length === 0) {
        delete config.packages[packageName];
      }
      this.saveConfig();
      return true;
    }
    return false;
  }

  /**
   * List all package names that have stored user config.
   *
   * @returns Array of scoped package names (e.g. `['@scope/pkg1', '@scope/pkg2']`)
   */
  listPackagesWithConfig(): string[] {
    const config = this.loadConfig();
    return Object.keys(config.packages || {});
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /**
   * Read the config file from disk, parse JSON, and validate against the schema.
   *
   * @returns The validated config object
   * @throws {ConfigCorruptedError} If the file can't be read, contains invalid JSON,
   *   or doesn't match the expected schema
   */
  private readAndValidate(): MpakConfig {
    let configJson: string;
    try {
      configJson = readFileSync(this.configFile, 'utf8');
    } catch (err) {
      throw new ConfigCorruptedError(
        `Failed to read config file: ${err instanceof Error ? err.message : String(err)}`,
        this.configFile,
        err instanceof Error ? err : undefined,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(configJson);
    } catch (err) {
      throw new ConfigCorruptedError(
        `Config file contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
        this.configFile,
        err instanceof Error ? err : undefined,
      );
    }

    const result = MpakConfigSchema.safeParse(parsed);
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Invalid config';
      throw new ConfigCorruptedError(message, this.configFile);
    }
    return result.data;
  }

  /**
   * Create the config directory if it doesn't exist (mode `0o700`).
   */
  private ensureConfigDir(): void {
    if (!existsSync(this.mpakHome)) {
      mkdirSync(this.mpakHome, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Flush the in-memory config to disk. Updates `lastUpdated` and writes
   * with mode `0o600` (owner read/write only — config may contain secrets).
   */
  private saveConfig(): void {
    if (!this.config) {
      return;
    }
    this.config.lastUpdated = new Date().toISOString();
    const configJson = JSON.stringify(this.config, null, 2);
    writeFileSync(this.configFile, configJson, { mode: 0o600 });
  }
}
