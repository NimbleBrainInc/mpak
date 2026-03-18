import { spawn, spawnSync } from "child_process";
import { createInterface } from "readline";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  rmSync,
  statSync,
} from "fs";
import { createHash } from "crypto";
import { homedir } from "os";
import { join, resolve, basename } from "path";
import { createClient } from "../../utils/client.js";
import {
  getCacheDir,
  getCacheMetadata,
  checkForUpdateAsync,
  extractZip,
  resolveBundle,
  downloadAndExtract,
  isSemverEqual,
} from "../../utils/cache.js";
import type { CacheMetadata } from "../../utils/cache.js";
import { ConfigManager } from "../../utils/config-manager.js";

export interface RunOptions {
  update?: boolean;
  local?: string; // Path to local .mcpb file
}

interface McpConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * User configuration field definition (MCPB v0.3 spec)
 */
interface UserConfigField {
  type: "string" | "number" | "boolean";
  title?: string;
  description?: string;
  sensitive?: boolean;
  required?: boolean;
  default?: string | number | boolean;
}

interface McpbManifest {
  manifest_version: string;
  name: string;
  version: string;
  description: string;
  user_config?: Record<string, UserConfigField>;
  server: {
    type: "node" | "python" | "binary";
    entry_point: string;
    mcp_config: McpConfig;
  };
}

/**
 * Parse package specification into name and version
 * @example parsePackageSpec('@scope/name') => { name: '@scope/name' }
 * @example parsePackageSpec('@scope/name@1.0.0') => { name: '@scope/name', version: '1.0.0' }
 */
export function parsePackageSpec(spec: string): {
  name: string;
  version?: string;
} {
  const lastAtIndex = spec.lastIndexOf("@");

  if (lastAtIndex <= 0) {
    return { name: spec };
  }

  const name = spec.substring(0, lastAtIndex);
  const version = spec.substring(lastAtIndex + 1);

  if (!name.startsWith("@")) {
    return { name: spec };
  }

  return { name, version };
}

/**
 * Read manifest from extracted bundle
 */
function readManifest(cacheDir: string): McpbManifest {
  const manifestPath = join(cacheDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found in bundle: ${manifestPath}`);
  }
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

/**
 * Resolve placeholders in args (e.g., ${__dirname})
 * @example resolveArgs(['${__dirname}/index.js'], '/cache') => ['/cache/index.js']
 */
export function resolveArgs(args: string[], cacheDir: string): string[] {
  return args.map((arg) =>
    arg.replace(/\$\{__dirname\}/g, cacheDir),
  );
}

/**
 * Resolve the MPAK_WORKSPACE value.
 * If an override is provided (via env), use it. Otherwise default to $cwd/.mpak.
 */
export function resolveWorkspace(
  override: string | undefined,
  cwd: string,
): string {
  return override || join(cwd, ".mpak");
}

/**
 * Substitute ${user_config.*} placeholders in a string
 * @example substituteUserConfig('${user_config.api_key}', { api_key: 'secret' }) => 'secret'
 */
export function substituteUserConfig(
  value: string,
  userConfigValues: Record<string, string>,
): string {
  return value.replace(
    /\$\{user_config\.([^}]+)\}/g,
    (match, key: string) => {
      return userConfigValues[key] ?? match;
    },
  );
}

/**
 * Substitute ${user_config.*} placeholders in env vars
 */
export function substituteEnvVars(
  env: Record<string, string> | undefined,
  userConfigValues: Record<string, string>,
): Record<string, string> {
  if (!env) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    result[key] = substituteUserConfig(value, userConfigValues);
  }
  return result;
}

/**
 * Get cache directory for a local bundle.
 * Uses hash of absolute path to avoid collisions.
 */
export function getLocalCacheDir(bundlePath: string): string {
  const absolutePath = resolve(bundlePath);
  const hash = createHash("md5")
    .update(absolutePath)
    .digest("hex")
    .slice(0, 12);
  return join(homedir(), ".mpak", "cache", "_local", hash);
}

/**
 * Check if local bundle needs re-extraction.
 * Returns true if cache doesn't exist or bundle was modified after extraction.
 */
export function localBundleNeedsExtract(
  bundlePath: string,
  cacheDir: string,
): boolean {
  const metaPath = join(cacheDir, ".mpak-meta.json");
  if (!existsSync(metaPath)) return true;

  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    const bundleStat = statSync(bundlePath);
    return bundleStat.mtimeMs > new Date(meta.extractedAt).getTime();
  } catch {
    return true;
  }
}

/**
 * Prompt user for a config value (interactive terminal input)
 */
async function promptForValue(
  field: UserConfigField,
  key: string,
): Promise<string> {
  return new Promise((resolvePrompt) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    const label = field.title || key;
    const hint = field.description ? ` (${field.description})` : "";
    const defaultHint =
      field.default !== undefined ? ` [${field.default}]` : "";
    const prompt = `=> ${label}${hint}${defaultHint}: `;

    // For sensitive fields, we'd ideally hide input, but Node's readline
    // doesn't support this natively. We'll just note it's sensitive.
    if (field.sensitive) {
      process.stderr.write(`=> (sensitive input)\n`);
    }

    rl.question(prompt, (answer) => {
      rl.close();
      // Use default if empty and default exists
      if (!answer && field.default !== undefined) {
        resolvePrompt(String(field.default));
      } else {
        resolvePrompt(answer);
      }
    });
  });
}

/**
 * Check if we're in an interactive terminal
 */
function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

/**
 * Gather user config values from stored config
 * Prompts for missing required values if interactive
 */
async function gatherUserConfigValues(
  packageName: string,
  userConfig: Record<string, UserConfigField>,
  configManager: ConfigManager,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const storedConfig = configManager.getPackageConfig(packageName) || {};
  const missingRequired: Array<{ key: string; field: UserConfigField }> =
    [];

  for (const [key, field] of Object.entries(userConfig)) {
    // Priority: 1) stored config, 2) default value
    const storedValue = storedConfig[key];

    if (storedValue !== undefined) {
      result[key] = storedValue;
    } else if (field.default !== undefined) {
      result[key] = String(field.default);
    } else if (field.required) {
      missingRequired.push({ key, field });
    }
  }

  // Prompt for missing required values if interactive
  if (missingRequired.length > 0) {
    if (!isInteractive()) {
      const missingKeys = missingRequired
        .map((m) => m.key)
        .join(", ");
      process.stderr.write(
        `=> Error: Missing required config: ${missingKeys}\n`,
      );
      process.stderr.write(
        `=> Run 'mpak config set ${packageName} <key>=<value>' to set values\n`,
      );
      process.exit(1);
    }

    process.stderr.write(`=> Package requires configuration:\n`);
    for (const { key, field } of missingRequired) {
      const value = await promptForValue(field, key);
      if (!value && field.required) {
        process.stderr.write(
          `=> Error: ${field.title || key} is required\n`,
        );
        process.exit(1);
      }
      result[key] = value;

      // Offer to save the value
      if (value) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stderr,
          terminal: true,
        });
        await new Promise<void>((resolvePrompt) => {
          rl.question(
            `=> Save ${field.title || key} for future runs? [Y/n]: `,
            (answer) => {
              rl.close();
              if (answer.toLowerCase() !== "n") {
                configManager.setPackageConfigValue(
                  packageName,
                  key,
                  value,
                );
                process.stderr.write(
                  `=> Saved to ~/.mpak/config.json\n`,
                );
              }
              resolvePrompt();
            },
          );
        });
      }
    }
  }

  return result;
}

/**
 * Find Python executable (tries python3 first, then python)
 */
function findPythonCommand(): string {
  // Try python3 first (preferred on macOS/Linux)
  const result = spawnSync("python3", ["--version"], { stdio: "pipe" });
  if (result.status === 0) {
    return "python3";
  }
  // Fall back to python
  return "python";
}

/**
 * Run a package from the registry or a local bundle file
 */
export async function handleRun(
  packageSpec: string,
  options: RunOptions = {},
): Promise<void> {
  // Validate that either --local or package spec is provided
  if (!options.local && !packageSpec) {
    process.stderr.write(
      `=> Error: Either provide a package name or use --local <path>\n`,
    );
    process.exit(1);
  }

  let cacheDir: string;
  let packageName: string;
  let registryClient: ReturnType<typeof createClient> | null = null;
  let cachedMeta: CacheMetadata | null = null;

  if (options.local) {
    // === LOCAL BUNDLE MODE ===
    const bundlePath = resolve(options.local);

    // Validate bundle exists
    if (!existsSync(bundlePath)) {
      process.stderr.write(
        `=> Error: Bundle not found: ${bundlePath}\n`,
      );
      process.exit(1);
    }

    // Validate .mcpb extension
    if (!bundlePath.endsWith(".mcpb")) {
      process.stderr.write(
        `=> Error: Not an MCPB bundle: ${bundlePath}\n`,
      );
      process.exit(1);
    }

    cacheDir = getLocalCacheDir(bundlePath);
    const needsExtract =
      options.update ||
      localBundleNeedsExtract(bundlePath, cacheDir);

    if (needsExtract) {
      // Clear old extraction
      if (existsSync(cacheDir)) {
        rmSync(cacheDir, { recursive: true, force: true });
      }

      process.stderr.write(
        `=> Extracting ${basename(bundlePath)}...\n`,
      );
      extractZip(bundlePath, cacheDir);

      // Write local metadata
      writeFileSync(
        join(cacheDir, ".mpak-meta.json"),
        JSON.stringify({
          localPath: bundlePath,
          extractedAt: new Date().toISOString(),
        }),
      );
    }

    // Read manifest to get package name for config lookup
    const manifest = readManifest(cacheDir);
    packageName = manifest.name;
    process.stderr.write(`=> Running ${packageName} (local)\n`);
  } else {
    // === REGISTRY MODE ===
    const { name, version: requestedVersion } =
      parsePackageSpec(packageSpec);
    packageName = name;
    registryClient = createClient();
    cacheDir = getCacheDir(name);

    let needsPull = true;
    cachedMeta = getCacheMetadata(cacheDir);

    // Check if we have a cached version
    if (cachedMeta && !options.update) {
      if (requestedVersion) {
        // Specific version requested - check if cached version matches
        needsPull = !isSemverEqual(cachedMeta.version, requestedVersion);
      } else {
        // Latest requested - use cache (user can --update to refresh)
        needsPull = false;
      }
    }

    if (needsPull) {
      const downloadInfo = await resolveBundle(name, registryClient, requestedVersion);

      // Check if cached version is already the latest
      if (
        cachedMeta &&
        isSemverEqual(cachedMeta.version, downloadInfo.bundle.version) &&
        !options.update
      ) {
        needsPull = false;
      }

      if (needsPull) {
        ({ cacheDir } = await downloadAndExtract(name, downloadInfo));
      }
    }
  }

  // Read manifest and execute
  const manifest = readManifest(cacheDir);
  const { type, entry_point, mcp_config } = manifest.server;

  // Handle user_config substitution
  let userConfigValues: Record<string, string> = {};
  if (
    manifest.user_config &&
    Object.keys(manifest.user_config).length > 0
  ) {
    const configManager = new ConfigManager();
    userConfigValues = await gatherUserConfigValues(
      packageName,
      manifest.user_config,
      configManager,
    );
  }

  // Substitute user_config placeholders in env vars
  // Priority: process.env (from parent like Claude Desktop) > substituted values (from mpak config)
  const substitutedEnv = substituteEnvVars(
    mcp_config.env,
    userConfigValues,
  );

  let command: string;
  let args: string[];
  const env: Record<string, string | undefined> = {
    ...substitutedEnv,
    ...process.env,
  };

  switch (type) {
    case "binary": {
      // For binary, the entry_point is the executable path relative to bundle
      command = join(cacheDir, entry_point);
      args = resolveArgs(mcp_config.args || [], cacheDir);

      // Ensure binary is executable
      try {
        chmodSync(command, 0o755);
      } catch {
        // Ignore chmod errors on Windows
      }
      break;
    }

    case "node": {
      command = mcp_config.command || "node";
      // Use mcp_config.args directly if provided, otherwise fall back to entry_point
      if (mcp_config.args && mcp_config.args.length > 0) {
        args = resolveArgs(mcp_config.args, cacheDir);
      } else {
        args = [join(cacheDir, entry_point)];
      }
      break;
    }

    case "python": {
      // Use manifest command if specified, otherwise auto-detect python
      command =
        mcp_config.command === "python"
          ? findPythonCommand()
          : mcp_config.command || findPythonCommand();

      // Use mcp_config.args directly if provided, otherwise fall back to entry_point
      if (mcp_config.args && mcp_config.args.length > 0) {
        args = resolveArgs(mcp_config.args, cacheDir);
      } else {
        args = [join(cacheDir, entry_point)];
      }

      // Set PYTHONPATH to deps/ directory for dependency resolution
      const depsDir = join(cacheDir, "deps");
      const existingPythonPath = process.env["PYTHONPATH"];
      env["PYTHONPATH"] = existingPythonPath
        ? `${depsDir}:${existingPythonPath}`
        : depsDir;
      break;
    }

    default:
      throw new Error(`Unsupported server type: ${type as string}`);
  }

  // Provide a project-local workspace directory for stateful bundles.
  // Defaults to $CWD/.mpak — user can override via MPAK_WORKSPACE in their environment.
  env["MPAK_WORKSPACE"] = resolveWorkspace(env["MPAK_WORKSPACE"], process.cwd());

  // Spawn with stdio passthrough for MCP
  const child = spawn(command, args, {
    stdio: ["inherit", "inherit", "inherit"],
    env,
    cwd: cacheDir,
  });

  // Fire-and-forget update check for registry bundles
  let updateCheckPromise: Promise<void> | null = null;
  if (!options.local && registryClient && cachedMeta) {
    updateCheckPromise = checkForUpdateAsync(packageName, cachedMeta, cacheDir, registryClient);
  }

  // Forward signals
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  // Wait for exit
  child.on("exit", async (code) => {
    // Let the update check finish before exiting (but don't block indefinitely)
    if (updateCheckPromise) {
      try {
        await Promise.race([updateCheckPromise, new Promise((r) => setTimeout(r, 3000))]);
      } catch {
        // Silently swallow — update check is best-effort and should not affect UX
      }
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    process.stderr.write(
      `=> Failed to start server: ${error.message}\n`,
    );
    process.exit(1);
  });
}
