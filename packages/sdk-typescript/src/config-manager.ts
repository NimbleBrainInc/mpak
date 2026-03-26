import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { MpakConfigCorruptedError } from "./errors.js";

/**
 * Current config schema version.
 */
export const CONFIG_VERSION = "1.0.0";

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
 * Manages the mpak user configuration file (`config.json`).
 *
 * Handles:
 * - **Registry URL** — custom registry endpoint with hardcoded default fallback
 * - **Per-package config** — key-value pairs for `${user_config.*}` substitution
 *
 * The config is lazy-loaded on first access and cached in memory.
 * The config directory is created lazily on first write — read-only usage
 * never touches the filesystem.
 * All writes are validated against the schema before flushing to disk
 * with `0o600` permissions (owner read/write only).
 *
 * @example
 * ```ts
 * // Default: ~/.mpak/config.json
 * const config = new MpakConfigManager();
 *
 * // Custom home and registry URL
 * const config = new MpakConfigManager({ mpakHome: '/tmp/test-mpak', registryUrl: 'https://custom.registry.dev' });
 *
 * // Registry URL (config > default)
 * config.getRegistryUrl();
 *
 * // Per-package user config for ${user_config.*} substitution
 * config.setPackageConfigValue('@scope/bundle', 'api_key', 'sk-...');
 * config.getPackageConfig('@scope/bundle'); // { api_key: 'sk-...' }
 * ```
 */
export interface MpakConfigManagerOptions {
	mpakHome?: string;
	registryUrl?: string;
}

export class MpakConfigManager {
	readonly mpakHome: string;
	private configFile: string;
	private config: MpakConfig | null = null;

	constructor(options?: MpakConfigManagerOptions) {
		this.mpakHome = resolve(options?.mpakHome ?? join(homedir(), ".mpak"));
		this.configFile = join(this.mpakHome, "config.json");
		if (options?.registryUrl !== undefined) {
			this.setRegistryUrl(options.registryUrl);
		}
	}

	// ===========================================================================
	// Public methods
	// ===========================================================================

	/**
	 * Resolve the registry URL with a 2-tier fallback:
	 * 1. Saved value in config file
	 * 2. Default: `https://registry.mpak.dev`
	 *
	 * @returns The resolved registry URL
	 */
	getRegistryUrl(): string {
		const config = this.loadConfig();
		return config.registryUrl || "https://registry.mpak.dev";
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
	getPackageNames(): string[] {
		const config = this.loadConfig();
		return Object.keys(config.packages || {});
	}

	// ===========================================================================
	// Private methods
	// ===========================================================================

	/**
	 * Load the config from disk, or create a fresh one if the file doesn't exist yet.
	 * The result is cached — subsequent calls return the in-memory copy without
	 * re-reading the file.
	 *
	 * @returns The validated config object
	 * @throws {MpakConfigCorruptedError} If the file exists but contains invalid JSON or fails schema validation
	 */
	private loadConfig(): MpakConfig {
		if (this.config) {
			return this.config;
		}

		if (!existsSync(this.configFile)) {
			this.config = {
				version: CONFIG_VERSION,
				lastUpdated: new Date().toISOString(),
			};
			return this.config;
		}

		this.config = this.readAndValidateConfig();
		return this.config;
	}

	/**
	 * Read the config file from disk, parse JSON, and validate against the schema.
	 *
	 * @returns The validated config object
	 * @throws {MpakConfigCorruptedError} If the file can't be read, contains invalid JSON,
	 *   or doesn't match the expected schema
	 */
	private readAndValidateConfig(): MpakConfig {
		let configJson: string;
		try {
			configJson = readFileSync(this.configFile, "utf8");
		} catch (err) {
			throw new MpakConfigCorruptedError(
				`Failed to read config file: ${err instanceof Error ? err.message : String(err)}`,
				this.configFile,
				err instanceof Error ? err : undefined,
			);
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(configJson);
		} catch (err) {
			throw new MpakConfigCorruptedError(
				`Config file contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
				this.configFile,
				err instanceof Error ? err : undefined,
			);
		}

		const result = MpakConfigSchema.safeParse(parsed);
		if (!result.success) {
			const message = result.error.issues[0]?.message ?? "Invalid config";
			throw new MpakConfigCorruptedError(message, this.configFile);
		}
		return result.data;
	}

	/**
	 * Flush the in-memory config to disk. Creates the config directory if needed,
	 * validates against the schema, updates `lastUpdated`, and writes
	 * with mode `0o600` (owner read/write only — config may contain secrets).
	 *
	 * @throws {MpakConfigCorruptedError} If the in-memory config fails schema validation
	 */
	private saveConfig(): void {
		if (!this.config) {
			throw new MpakConfigCorruptedError(
				`saveConfig called before config was loaded`,
				this.configFile,
			);
		}
		if (!existsSync(this.mpakHome)) {
			mkdirSync(this.mpakHome, { recursive: true, mode: 0o700 });
		}
		this.config.lastUpdated = new Date().toISOString();
		const result = MpakConfigSchema.safeParse(this.config);
		if (!result.success) {
			const message = result.error.issues[0]?.message ?? "Invalid config";
			throw new MpakConfigCorruptedError(message, this.configFile);
		}
		const configJson = JSON.stringify(result.data, null, 2);
		writeFileSync(this.configFile, configJson, { mode: 0o600 });
	}

	/**
	 * Persist a custom registry URL to the config file.
	 *
	 * @param url - The registry URL to save (e.g. `https://registry.example.com`)
	 */
	private setRegistryUrl(url: string): void {
		const config = this.loadConfig();
		config.registryUrl = url;
		this.saveConfig();
	}
}
