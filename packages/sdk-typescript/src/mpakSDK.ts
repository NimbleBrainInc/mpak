import { spawnSync } from 'node:child_process';
import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import type { McpbManifest } from '@nimblebrain/mpak-schemas';
import { MpakBundleCache } from './cache.js';
import { MpakClient } from './client.js';
import { MpakConfigManager } from './config-manager.js';
import { MpakCacheCorruptedError, MpakConfigError } from './errors.js';
import type { MpakClientConfig } from './types.js';
import { parsePackageSpec } from './utils.js';

/**
 * Options for the {@link Mpak} facade.
 *
 * All fields are optional — sensible defaults are derived from
 * `MpakConfigManager` (registry URL, mpakHome) when omitted.
 */
export interface MpakOptions {
  /** Root directory for mpak state. Defaults to `~/.mpak`. */
  mpakHome?: string;
  /** Registry URL override. Defaults to `MpakConfigManager.getRegistryUrl()`. */
  registryUrl?: string;
  /** Request timeout in milliseconds for the client. */
  timeout?: number;
  /** User-Agent string sent with every request. */
  userAgent?: string;
}

/**
 * Options for {@link Mpak.prepareServer}.
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
 * `MpakConfigManager`, `MpakClient`, and `BundleCache`.
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
export class Mpak {
  /** User configuration manager (`config.json`). */
  readonly configManager: MpakConfigManager;
  /** Registry API client. */
  readonly client: MpakClient;
  /** Local bundle cache. */
  readonly bundleCache: MpakBundleCache;

  constructor(options?: MpakOptions) {
    // initialize config
    const configOptions: { mpakHome?: string; registryUrl?: string } = {};
    if (options?.mpakHome !== undefined) configOptions.mpakHome = options.mpakHome;
    if (options?.registryUrl !== undefined) configOptions.registryUrl = options.registryUrl;
    this.configManager = new MpakConfigManager(configOptions);

    // initialize client
    const clientConfig: MpakClientConfig = {
      registryUrl: this.configManager.getRegistryUrl(),
    };
    if (options?.timeout !== undefined) clientConfig.timeout = options.timeout;
    if (options?.userAgent !== undefined) clientConfig.userAgent = options.userAgent;
    this.client = new MpakClient(clientConfig);

    // initialize cache
    this.bundleCache = new MpakBundleCache(this.client, {
      mpakHome: this.configManager.mpakHome,
    });
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
  async prepareServer(packageName: string, options?: PrepareServerOptions): Promise<ServerCommand> {
    const { name, version: parsedVersion } = parsePackageSpec(packageName);
    const resolvedVersion = options?.version ?? parsedVersion;

    // Ensure bundle is cached
    const loadOptions: { version?: string; force?: boolean } = {};
    if (resolvedVersion !== undefined) loadOptions.version = resolvedVersion;
    if (options?.force !== undefined) loadOptions.force = options.force;
    const loadResult = await this.bundleCache.loadBundle(name, loadOptions);

    // Read manifest
    const manifest = this.bundleCache.getBundleManifest(name);
    if (!manifest) {
      throw new MpakCacheCorruptedError(
        `Manifest file missing for ${name}`,
        join(this.bundleCache.cacheHome, name),
      );
    }

    // Gather and validate user config
    const userConfigValues = this.gatherUserConfig(name, manifest);

    // Build command/args/env
    const { command, args, env } = this.resolveCommand(
      manifest,
      loadResult.cacheDir,
      userConfigValues,
    );

    // Set MPAK_WORKSPACE
    env['MPAK_WORKSPACE'] = options?.workspaceDir ?? join(process.cwd(), '.mpak');

    // Merge caller-provided env (wins over defaults)
    if (options?.env) {
      Object.assign(env, options.env);
    }

    return {
      command,
      args,
      env,
      cwd: loadResult.cacheDir,
      name,
      version: loadResult.version,
    };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Gather stored user config values and validate that all required fields are present.
   * @throws If required config values are missing.
   */
  private gatherUserConfig(packageName: string, manifest: McpbManifest): Record<string, string> {
    if (!manifest.user_config || Object.keys(manifest.user_config).length === 0) {
      return {};
    }

    const storedConfig = this.configManager.getPackageConfig(packageName) ?? {};
    const result: Record<string, string> = {};
    const missingFields: Array<{
      key: string;
      title: string;
      sensitive: boolean;
    }> = [];

    for (const [fieldName, fieldData] of Object.entries(manifest.user_config)) {
      const storedValue = storedConfig[fieldName];

      if (storedValue !== undefined) {
        result[fieldName] = storedValue;
      } else if (fieldData.default) {
        result[fieldName] = String(fieldData.default);
      } else if (fieldData.required) {
        missingFields.push({
          key: fieldName,
          title: fieldData.title ?? fieldName,
          sensitive: fieldData.sensitive ?? false,
        });
      }
    }

    if (missingFields.length > 0) {
      throw new MpakConfigError(packageName, missingFields);
    }

    return result;
  }

  /**
   * Resolve the manifest's `server` block into a spawnable command, args, and env.
   *
   * Handles three server types:
   * - **binary** — runs the compiled executable at `entry_point`, chmod'd +x.
   * - **node** — runs `mcp_config.command` (default `"node"`) with `mcp_config.args`,
   *   or falls back to `node <entry_point>` when args are empty.
   * - **python** — like node, but resolves `python3`/`python` at runtime and
   *   prepends `<cacheDir>/deps` to `PYTHONPATH` for bundled dependencies.
   *
   * All `${__dirname}` placeholders in args are replaced with `cacheDir`.
   * All `${user_config.*}` placeholders in env are replaced with gathered user values.
   *
   * @throws For unsupported server types.
   */
  private resolveCommand(
    manifest: McpbManifest,
    cacheDir: string,
    userConfigValues: Record<string, string>,
  ): { command: string; args: string[]; env: Record<string, string> } {
    const { type, entry_point, mcp_config } = manifest.server;

    // Substitute user_config placeholders in manifest env
    const env = Mpak.substituteEnvVars(mcp_config.env, userConfigValues);

    let command: string;
    let args: string[];

    switch (type) {
      case 'binary': {
        command = join(cacheDir, entry_point);
        args = Mpak.resolveArgs(mcp_config.args ?? [], cacheDir);
        try {
          chmodSync(command, 0o755);
        } catch {
          // Ignore chmod errors on Windows
        }
        break;
      }

      case 'node': {
        command = mcp_config.command || 'node';
        args =
          mcp_config.args.length > 0
            ? Mpak.resolveArgs(mcp_config.args, cacheDir)
            : [join(cacheDir, entry_point)];
        break;
      }

      case 'python': {
        command =
          mcp_config.command === 'python'
            ? Mpak.findPythonCommand()
            : mcp_config.command || Mpak.findPythonCommand();
        args =
          mcp_config.args.length > 0
            ? Mpak.resolveArgs(mcp_config.args, cacheDir)
            : [join(cacheDir, entry_point)];

        // Set PYTHONPATH to deps/ directory
        const depsDir = join(cacheDir, 'deps');
        env['PYTHONPATH'] = env['PYTHONPATH'] ? `${depsDir}:${env['PYTHONPATH']}` : depsDir;
        break;
      }

      case 'uv': {
        command = mcp_config.command || 'uv';
        args =
          mcp_config.args.length > 0
            ? Mpak.resolveArgs(mcp_config.args, cacheDir)
            : ['run', join(cacheDir, entry_point)];
        break;
      }

      default: {
        const _exhaustive: never = type;
        throw new MpakCacheCorruptedError(
          `Unsupported server type "${_exhaustive}" in manifest for ${manifest.name}`,
          cacheDir,
        );
      }
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
    const result = spawnSync('python3', ['--version'], { stdio: 'pipe' });
    if (result.status === 0) {
      return 'python3';
    }
    return 'python';
  }
}
