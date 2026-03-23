import { spawnSync } from "node:child_process";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import type { McpbManifest } from "./cache.js";
import { BundleCache } from "./cache.js";
import { MpakClient } from "./client.js";
import { ConfigManager } from "./config-manager.js";
import type { MpakClientConfig } from "./types.js";

/**
 * Options for the {@link Mpak} facade.
 *
 * All fields are optional — sensible defaults are derived from
 * `ConfigManager` (registry URL, mpakHome) when omitted.
 */
export interface MpakSDKOptions {
	/** Root directory for mpak state. Defaults to `~/.mpak`. */
	mpakHome?: string;
	/** Registry URL override. Defaults to `ConfigManager.getRegistryUrl()`. */
	registryUrl?: string;
	/** Request timeout in milliseconds for the client. */
	timeout?: number;
	/** User-Agent string sent with every request. */
	userAgent?: string;
	/** Logger callback for cache operations. Defaults to `process.stderr.write`. */
	logger?: (msg: string) => void;
}

/**
 * Options for {@link MpakSDK.prepareServer}.
 */
export interface PrepareServerOptions {
	/** Pin to a specific version. Omit for "latest". */
	version?: string;
	/** Skip cache and re-download from registry. */
	force?: boolean;
	/** Extra environment variables merged on top of the manifest env. */
	env?: Record<string, string>;
	/**
	 * Directory for `MPAK_WORKSPACE` — where stateful bundles write
	 * project-local data (databases, logs, etc.). Defaults to `process.cwd()/.mpak`.
	 */
	workspaceDir?: string;
}

/**
 * Fully resolved server configuration, ready to spawn.
 */
export interface ServerCommand {
	/** The executable command (e.g. `"node"`, `"python3"`, or an absolute binary path). */
	command: string;
	/** Arguments to pass to the command. */
	args: string[];
	/** Environment variables (manifest env + user config substitutions + caller overrides). */
	env: Record<string, string>;
	/** Working directory for the spawned process — the extracted bundle's cache directory. */
	cwd: string;
	/** The resolved package name. */
	name: string;
	/** The resolved version string. */
	version: string;
}

/**
 * Top-level facade that wires together the SDK's core components:
 * `ConfigManager`, `MpakClient`, and `BundleCache`.
 *
 * Provides a single entry point for the common setup pattern,
 * while still exposing each component for direct use.
 *
 * @example
 * ```ts
 * import { MpakSDK } from '@nimblebrain/mpak-sdk';
 *
 * const mpak = new MpakSDK();
 *
 * // Prepare a server for spawning
 * const server = await mpak.prepareServer('@scope/pkg');
 * const child = spawn(server.command, server.args, {
 *   env: { ...server.env, ...process.env },
 *   cwd: server.cwd,
 *   stdio: 'inherit',
 * });
 *
 * // Access components directly
 * mpak.config.setPackageConfigValue('@scope/pkg', 'api_key', 'sk-...');
 * const bundles = await mpak.client.searchBundles({ q: 'mcp' });
 * ```
 */
export class MpakSDK {
	/** User configuration manager (`config.json`). */
	readonly config: ConfigManager;
	/** Registry API client. */
	readonly client: MpakClient;
	/** Local bundle cache. */
	readonly cache: BundleCache;

	constructor(options?: MpakSDKOptions) {
		// initialize config
		const configOptions: { mpakHome?: string; registryUrl?: string } = {};
		if (options?.mpakHome !== undefined)
			configOptions.mpakHome = options.mpakHome;
		if (options?.registryUrl !== undefined)
			configOptions.registryUrl = options.registryUrl;
		this.config = new ConfigManager(configOptions);

		// initialize client
		const clientConfig: MpakClientConfig = {
			registryUrl: this.config.getRegistryUrl(),
		};
		if (options?.timeout !== undefined) clientConfig.timeout = options.timeout;
		if (options?.userAgent !== undefined)
			clientConfig.userAgent = options.userAgent;
		this.client = new MpakClient(clientConfig);

		// initialize cache
		const cacheOptions: {
			mpakHome: string;
			client: MpakClient;
			logger?: (msg: string) => void;
		} = {
			mpakHome: this.config.mpakHome,
			client: this.client,
		};

		if (options?.logger !== undefined) cacheOptions.logger = options.logger;
		this.cache = new BundleCache(cacheOptions);
	}

	/**
	 * Prepare a registry bundle for execution.
	 *
	 * Downloads the bundle if not cached, reads its manifest, validates
	 * that all required user config values are present, and resolves the
	 * command, args, and env needed to spawn the MCP server process.
	 *
	 * @param packageName - Package name with optional version,
	 *   e.g. `@scope/name` or `@scope/name@1.0.0`.
	 * @param options - Version pinning, force re-download, extra env, and workspace dir.
	 *
	 * @throws If required user config values are missing.
	 * @throws If the manifest is missing or corrupt after download.
	 * @throws If the server type is unsupported.
	 */
	async prepareServer(
		packageName: string,
		options?: PrepareServerOptions,
	): Promise<ServerCommand> {
		const { name, version: parsedVersion } =
			MpakSDK.parsePackageSpec(packageName);
		const resolvedVersion = options?.version ?? parsedVersion;

		// Ensure bundle is cached
		const loadOptions: { version?: string; force?: boolean } = {};
		if (resolvedVersion !== undefined) loadOptions.version = resolvedVersion;
		if (options?.force !== undefined) loadOptions.force = options.force;
		const loadResult = await this.cache.loadBundle(name, loadOptions);

		// Read manifest
		const manifest = this.cache.readManifest(name);
		if (!manifest) {
			throw new Error(
				`Manifest missing or corrupt for ${name} after download`,
			);
		}

		// Gather and validate user config
		const userConfigValues = this.gatherUserConfig(name, manifest);

		// Build command/args/env
		const cacheDir = loadResult.cacheDir;
		const { command, args, env } = this.resolveCommand(
			manifest,
			cacheDir,
			userConfigValues,
		);

		// Merge caller-provided env
		if (options?.env) {
			Object.assign(env, options.env);
		}

		// Set MPAK_WORKSPACE
		env["MPAK_WORKSPACE"] =
			options?.workspaceDir ?? join(process.cwd(), ".mpak");

		return {
			command,
			args,
			env,
			cwd: cacheDir,
			name,
			version: loadResult.version,
		};
	}

	// ===========================================================================
	// Static helpers
	// ===========================================================================

	/**
	 * Parse and validate a package spec string.
	 *
	 * Accepts `@scope/name` or `@scope/name@version`. Validates that the
	 * name is a scoped package (`@scope/name` format).
	 *
	 * @throws If the package spec is not a valid scoped name.
	 *
	 * @example
	 * MpakSDK.parsePackageSpec('@scope/name')        // { name: '@scope/name' }
	 * MpakSDK.parsePackageSpec('@scope/name@1.0.0')  // { name: '@scope/name', version: '1.0.0' }
	 */
	static parsePackageSpec(spec: string): { name: string; version?: string } {
		const lastAtIndex = spec.lastIndexOf("@");

		let name: string;
		let version: string | undefined;

		if (lastAtIndex > 0) {
			name = spec.substring(0, lastAtIndex);
			version = spec.substring(lastAtIndex + 1);
		} else {
			name = spec;
		}

		if (!name.startsWith("@") || !name.includes("/")) {
			throw new Error(
				`Invalid package spec: "${spec}". Expected scoped format: @scope/name`,
			);
		}

		return version ? { name, version } : { name };
	}

	// ===========================================================================
	// Private helpers
	// ===========================================================================

	/**
	 * Gather stored user config values and validate that all required fields are present.
	 * @throws If required config values are missing.
	 */
	private gatherUserConfig(
		packageName: string,
		manifest: McpbManifest,
	): Record<string, string> {
		if (
			!manifest.user_config ||
			Object.keys(manifest.user_config).length === 0
		) {
			return {};
		}

		const storedConfig = this.config.getPackageConfig(packageName) ?? {};
		const result: Record<string, string> = {};
		const missingRequired: string[] = [];

		for (const [key, field] of Object.entries(manifest.user_config)) {
			const storedValue = storedConfig[key];

			if (storedValue !== undefined) {
				result[key] = storedValue;
			} else if (field.default !== undefined) {
				result[key] = String(field.default);
			} else if (field.required) {
				missingRequired.push(field.title ?? key);
			}
		}

		if (missingRequired.length > 0) {
			throw new Error(
				`Missing required config for ${packageName}: ${missingRequired.join(", ")}. ` +
					`Use config.setPackageConfigValue() to set values.`,
			);
		}

		return result;
	}

	/**
	 * Resolve the manifest's server definition into a concrete command, args, and env.
	 */
	private resolveCommand(
		manifest: McpbManifest,
		cacheDir: string,
		userConfigValues: Record<string, string>,
	): { command: string; args: string[]; env: Record<string, string> } {
		const { type, entry_point, mcp_config } = manifest.server;

		// Substitute user_config placeholders in manifest env
		const env = MpakSDK.substituteEnvVars(mcp_config.env, userConfigValues);

		let command: string;
		let args: string[];

		switch (type) {
			case "binary": {
				command = join(cacheDir, entry_point);
				args = MpakSDK.resolveArgs(mcp_config.args ?? [], cacheDir);
				try {
					chmodSync(command, 0o755);
				} catch {
					// Ignore chmod errors on Windows
				}
				break;
			}

			case "node": {
				command = mcp_config.command || "node";
				args =
					mcp_config.args.length > 0
						? MpakSDK.resolveArgs(mcp_config.args, cacheDir)
						: [join(cacheDir, entry_point)];
				break;
			}

			case "python": {
				command =
					mcp_config.command === "python"
						? MpakSDK.findPythonCommand()
						: mcp_config.command || MpakSDK.findPythonCommand();
				args =
					mcp_config.args.length > 0
						? MpakSDK.resolveArgs(mcp_config.args, cacheDir)
						: [join(cacheDir, entry_point)];

				// Set PYTHONPATH to deps/ directory
				const depsDir = join(cacheDir, "deps");
				env["PYTHONPATH"] = env["PYTHONPATH"]
					? `${depsDir}:${env["PYTHONPATH"]}`
					: depsDir;
				break;
			}

			default:
				throw new Error(`Unsupported server type: ${type as string}`);
		}

		return { command, args, env };
	}

	/**
	 * Substitute `${__dirname}` placeholders in args.
	 */
	private static resolveArgs(args: string[], cacheDir: string): string[] {
		return args.map((arg) => arg.replace(/\$\{__dirname\}/g, cacheDir));
	}

	/**
	 * Substitute `${user_config.*}` placeholders in env vars.
	 */
	private static substituteEnvVars(
		env: Record<string, string> | undefined,
		userConfigValues: Record<string, string>,
	): Record<string, string> {
		if (!env) return {};
		const result: Record<string, string> = {};
		for (const [key, value] of Object.entries(env)) {
			result[key] = value.replace(
				/\$\{user_config\.([^}]+)\}/g,
				(match, configKey: string) => userConfigValues[configKey] ?? match,
			);
		}
		return result;
	}

	/**
	 * Find a working Python executable. Tries `python3` first, falls back to `python`.
	 */
	private static findPythonCommand(): string {
		const result = spawnSync("python3", ["--version"], { stdio: "pipe" });
		if (result.status === 0) {
			return "python3";
		}
		return "python";
	}
}
