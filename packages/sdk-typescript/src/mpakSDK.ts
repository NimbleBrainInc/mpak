import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { McpbManifest } from '@nimblebrain/mpak-schemas';
import { McpbManifestSchema } from '@nimblebrain/mpak-schemas';
import { MpakBundleCache } from './cache.js';
import { MpakClient } from './client.js';
import { MpakConfigManager } from './config-manager.js';
import { MpakCacheCorruptedError, MpakConfigError, MpakInvalidBundleError } from './errors.js';
import { extractZip, hashBundlePath, localBundleNeedsExtract, readJsonFromFile } from './helpers.js';
import type { MpakClientConfig } from './types.js';


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
 * Specifies which bundle to prepare.
 *
 * - `{ name, version? }` — registry bundle. Omit `version` for "latest".
 * - `{ local }` — a local `.mcpb` file on disk. The caller is responsible for
 *   validating that the path exists and has a `.mcpb` extension before calling.
 */
export type PrepareServerSpec =
  | { name: string; version?: string }
  | { local: string };

/**
 * Options for {@link Mpak.prepareServer}.
 */
export interface PrepareServerOptions {
  /** Skip cache and re-download/re-extract. */
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
   * Prepare a bundle for execution.
   *
   * Accepts either a registry spec (`{ name, version? }`) or a local bundle
   * spec (`{ local }`). Downloads/extracts as needed, reads the manifest,
   * validates user config, and resolves the command, args, and env needed
   * to spawn the MCP server process.
   *
   * @param spec - Which bundle to prepare. See {@link PrepareServerSpec}.
   * @param options - Force re-download/re-extract, extra env, and workspace dir.
   *
   * @throws {MpakConfigError} If required user config values are missing.
   * @throws {MpakCacheCorruptedError} If the manifest is missing or corrupt after download.
   */
  async prepareServer(spec: PrepareServerSpec, options?: PrepareServerOptions): Promise<ServerCommand> {
    let cacheDir: string;
    let name: string;
    let version: string;
    let manifest: McpbManifest;

    if ('local' in spec) {
      ({ cacheDir, name, version, manifest } = await this.prepareLocalBundle(spec.local, options));
    } else {
      ({ cacheDir, name, version, manifest } = await this.prepareRegistryBundle(spec.name, spec.version, options));
    }

    // Gather and validate user config
    const userConfigValues = this.gatherUserConfig(name, manifest);

    // Build command/args/env
    const { command, args, env } = this.resolveCommand(
      manifest,
      cacheDir,
      userConfigValues,
    );

    // Set MPAK_WORKSPACE
    env['MPAK_WORKSPACE'] = options?.workspaceDir ?? join(process.cwd(), '.mpak');

    // Merge caller-provided env (wins over defaults)
    if (options?.env) {
      Object.assign(env, options.env);
    }

    return { command, args, env, cwd: cacheDir, name, version };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Load a registry bundle into cache and read its manifest.
   */
  private async prepareRegistryBundle(
    packageName: string,
    version: string | undefined,
    options?: PrepareServerOptions,
  ): Promise<{ cacheDir: string; name: string; version: string; manifest: McpbManifest }> {
    const loadOptions: { version?: string; force?: boolean } = {};
    if (version !== undefined) loadOptions.version = version;
    if (options?.force !== undefined) loadOptions.force = options.force;
    const loadResult = await this.bundleCache.loadBundle(packageName, loadOptions);

    const manifest = this.bundleCache.getBundleManifest(packageName);
    if (!manifest) {
      throw new MpakCacheCorruptedError(
        `Manifest file missing for ${packageName}`,
        join(this.bundleCache.cacheHome, packageName),
      );
    }

    return { cacheDir: loadResult.cacheDir, name: packageName, version: loadResult.version, manifest };
  }

  /**
   * Extract a local `.mcpb` bundle (if stale) and read its manifest.
   * Local bundles are cached under `<cacheHome>/_local/<hash>`.
   *
   * The caller is responsible for validating that `bundlePath` exists
   * and has a `.mcpb` extension before calling this method.
   */
  private async prepareLocalBundle(
    bundlePath: string,
    options?: PrepareServerOptions,
  ): Promise<{ cacheDir: string; name: string; version: string; manifest: McpbManifest }> {
    const absolutePath = resolve(bundlePath);
    const hash = hashBundlePath(absolutePath);
    const cacheDir = join(this.bundleCache.cacheHome, '_local', hash);

    const needsExtract = options?.force || localBundleNeedsExtract(absolutePath, cacheDir);

    if (needsExtract) {
      if (existsSync(cacheDir)) {
        rmSync(cacheDir, { recursive: true, force: true });
      }

      try {
        extractZip(absolutePath, cacheDir);
      } catch (err) {
        throw new MpakInvalidBundleError(
          err instanceof Error ? err.message : String(err),
          absolutePath,
          err instanceof Error ? err : undefined,
        );
      }

      writeFileSync(
        join(cacheDir, '.mpak-local-meta.json'),
        JSON.stringify({
          localPath: absolutePath,
          extractedAt: new Date().toISOString(),
        }),
      );
    }

    let manifest: McpbManifest;
    try {
      manifest = readJsonFromFile(join(cacheDir, 'manifest.json'), McpbManifestSchema);
    } catch (err) {
      throw new MpakInvalidBundleError(
        err instanceof Error ? err.message : String(err),
        absolutePath,
        err instanceof Error ? err : undefined,
      );
    }

    return { cacheDir, name: manifest.name, version: manifest.version, manifest };
  }

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
      description?: string;
      sensitive: boolean;
    }> = [];

    for (const [fieldName, fieldData] of Object.entries(manifest.user_config)) {
      const storedValue = storedConfig[fieldName];

      if (storedValue !== undefined) {
        result[fieldName] = storedValue;
      } else if (fieldData.default) {
        result[fieldName] = String(fieldData.default);
      } else if (fieldData.required) {
        const field: (typeof missingFields)[number] = {
          key: fieldName,
          title: fieldData.title ?? fieldName,
          sensitive: fieldData.sensitive ?? false,
        };
        if (fieldData.description !== undefined) {
          field.description = fieldData.description;
        }
        missingFields.push(field);
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
