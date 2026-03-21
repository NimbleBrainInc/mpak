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
 * Top-level facade that wires together the SDK's core components:
 * `ConfigManager`, `MpakClient`, and `BundleCache`.
 *
 * Provides a single entry point for the common setup pattern,
 * while still exposing each component for direct use.
 *
 * @example
 * ```ts
 * const mpak = new Mpak();
 *
 * // Access components directly
 * mpak.config.setPackageConfigValue('@scope/pkg', 'api_key', 'sk-...');
 * const result = await mpak.cache.loadBundle('@scope/pkg');
 *
 * // Search via client
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
		if (options?.mpakHome !== undefined) configOptions.mpakHome = options.mpakHome;
		if (options?.registryUrl !== undefined) configOptions.registryUrl = options.registryUrl;
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
}
