import { execFileSync, spawn, spawnSync } from "child_process";
import { createInterface } from "readline";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  rmSync,
  statSync,
} from "fs";
import { createHash } from "crypto";
import { homedir } from "os";
import { join, dirname, resolve, basename } from "path";
import { MpakClient } from "@nimblebrain/mpak-sdk";
import { createClient } from "../../utils/client.js";
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

interface CacheMetadata {
  version: string;
  pulledAt: string;
  platform: { os: string; arch: string };
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
 * Get cache directory for a package
 * @example getCacheDir('@scope/name') => '~/.mpak/cache/scope-name'
 */
export function getCacheDir(packageName: string): string {
  const cacheBase = join(homedir(), ".mpak", "cache");
  // @scope/name -> scope/name
  const safeName = packageName.replace("@", "").replace("/", "-");
  return join(cacheBase, safeName);
}

/**
 * Read cache metadata
 */
function getCacheMetadata(cacheDir: string): CacheMetadata | null {
  const metaPath = join(cacheDir, ".mpak-meta.json");
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Write cache metadata
 */
function writeCacheMetadata(
  cacheDir: string,
  metadata: CacheMetadata,
): void {
  const metaPath = join(cacheDir, ".mpak-meta.json");
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
}

/**
 * Maximum allowed uncompressed size for a bundle (500MB).
 * Protects against zip bombs that could exhaust disk space.
 */
const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024;

/**
 * Extract ZIP file to directory (simple implementation without external deps)
 */
async function extractZip(
  zipPath: string,
  destDir: string,
): Promise<void> {
  // Use native unzip command (available on macOS, Linux, and Windows with WSL)
  // Check uncompressed size before extraction to prevent zip bombs
  try {
    const listOutput = execFileSync('unzip', ['-l', zipPath], {
      stdio: "pipe",
      encoding: "utf8",
    });
    const totalMatch = listOutput.match(/^\s*(\d+)\s+\d+\s+files?$/m);
    if (totalMatch) {
      const totalSize = parseInt(totalMatch[1]!, 10);
      if (totalSize > MAX_UNCOMPRESSED_SIZE) {
        throw new Error(
          `Bundle uncompressed size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds maximum allowed (${MAX_UNCOMPRESSED_SIZE / (1024 * 1024)}MB)`,
        );
      }
    }
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes("exceeds maximum allowed")
    ) {
      throw error;
    }
    // Fail closed: if we can't verify the size, don't extract
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot verify bundle size before extraction: ${message}`);
  }

  // Ensure destination exists
  mkdirSync(destDir, { recursive: true });

  try {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', destDir], {
      stdio: "pipe",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract bundle: ${message}`);
  }
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
 * Download a bundle to a file path
 */
async function downloadBundle(
  downloadUrl: string,
  outputPath: string,
): Promise<void> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download bundle: ${response.statusText}`,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(outputPath, Buffer.from(arrayBuffer));
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
      mkdirSync(cacheDir, { recursive: true });

      process.stderr.write(
        `=> Extracting ${basename(bundlePath)}...\n`,
      );
      await extractZip(bundlePath, cacheDir);

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
    const client = createClient();
    const platform = MpakClient.detectPlatform();
    cacheDir = getCacheDir(name);

    let needsPull = true;
    const cachedMeta = getCacheMetadata(cacheDir);

    // Check if we have a cached version
    if (cachedMeta && !options.update) {
      if (requestedVersion) {
        // Specific version requested - check if cached version matches
        needsPull = cachedMeta.version !== requestedVersion;
      } else {
        // Latest requested - use cache (user can --update to refresh)
        needsPull = false;
      }
    }

    if (needsPull) {
      // Fetch download info
      const downloadInfo = await client.getBundleDownload(
        name,
        requestedVersion || "latest",
        platform,
      );
      const bundle = downloadInfo.bundle;

      // Check if cached version is already the latest
      if (
        cachedMeta &&
        cachedMeta.version === bundle.version &&
        !options.update
      ) {
        needsPull = false;
      }

      if (needsPull) {
        // Download to temp file
        const tempPath = join(
          homedir(),
          ".mpak",
          "tmp",
          `${Date.now()}.mcpb`,
        );
        mkdirSync(dirname(tempPath), { recursive: true });

        process.stderr.write(
          `=> Pulling ${name}@${bundle.version}...\n`,
        );
        await downloadBundle(downloadInfo.url, tempPath);

        // Clear old cache and extract
        if (existsSync(cacheDir)) {
          rmSync(cacheDir, { recursive: true, force: true });
        }
        mkdirSync(cacheDir, { recursive: true });

        await extractZip(tempPath, cacheDir);

        // Write metadata
        writeCacheMetadata(cacheDir, {
          version: bundle.version,
          pulledAt: new Date().toISOString(),
          platform: bundle.platform,
        });

        // Cleanup temp file
        rmSync(tempPath, { force: true });

        process.stderr.write(
          `=> Cached ${name}@${bundle.version}\n`,
        );
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

  // Spawn with stdio passthrough for MCP
  const child = spawn(command, args, {
    stdio: ["inherit", "inherit", "inherit"],
    env,
    cwd: cacheDir,
  });

  // Forward signals
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));

  // Wait for exit
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    process.stderr.write(
      `=> Failed to start server: ${error.message}\n`,
    );
    process.exit(1);
  });
}
