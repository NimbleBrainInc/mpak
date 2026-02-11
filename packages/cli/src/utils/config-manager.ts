import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Current config schema version
 */
export const CONFIG_VERSION = "1.0.0";

/**
 * Per-package user configuration (stores user_config values)
 */
export interface PackageConfig {
  [key: string]: string;
}

/**
 * Configuration structure (v1.0.0)
 */
export interface MpakConfig {
  version: string;
  lastUpdated: string;
  registryUrl?: string;
  packages?: Record<string, PackageConfig>;
}

/**
 * Error thrown when config file is corrupted or invalid
 */
export class ConfigCorruptedError extends Error {
  constructor(
    message: string,
    public readonly configPath: string,
    public override readonly cause?: Error,
  ) {
    super(message);
    this.name = "ConfigCorruptedError";
  }
}

/**
 * Validates that a parsed object conforms to the MpakConfig schema
 */
function validateConfig(data: unknown, configPath: string): MpakConfig {
  if (typeof data !== "object" || data === null) {
    throw new ConfigCorruptedError(
      "Config file must be a JSON object",
      configPath,
    );
  }

  const obj = data as Record<string, unknown>;

  // Required fields
  if (typeof obj["version"] !== "string") {
    throw new ConfigCorruptedError(
      "Config missing required field: version (string)",
      configPath,
    );
  }

  if (typeof obj["lastUpdated"] !== "string") {
    throw new ConfigCorruptedError(
      "Config missing required field: lastUpdated (string)",
      configPath,
    );
  }

  // Optional fields with type validation
  if (
    obj["registryUrl"] !== undefined &&
    typeof obj["registryUrl"] !== "string"
  ) {
    throw new ConfigCorruptedError(
      "Config field registryUrl must be a string",
      configPath,
    );
  }

  if (obj["packages"] !== undefined) {
    if (typeof obj["packages"] !== "object" || obj["packages"] === null) {
      throw new ConfigCorruptedError(
        "Config field packages must be an object",
        configPath,
      );
    }

    // Validate each package config
    for (const [pkgName, pkgConfig] of Object.entries(
      obj["packages"] as Record<string, unknown>,
    )) {
      if (typeof pkgConfig !== "object" || pkgConfig === null) {
        throw new ConfigCorruptedError(
          `Config packages.${pkgName} must be an object`,
          configPath,
        );
      }

      for (const [key, value] of Object.entries(
        pkgConfig as Record<string, unknown>,
      )) {
        if (typeof value !== "string") {
          throw new ConfigCorruptedError(
            `Config packages.${pkgName}.${key} must be a string`,
            configPath,
          );
        }
      }
    }
  }

  // Check for unknown fields (additionalProperties: false in schema)
  const knownFields = new Set([
    "version",
    "lastUpdated",
    "registryUrl",
    "packages",
  ]);
  for (const key of Object.keys(obj)) {
    if (!knownFields.has(key)) {
      throw new ConfigCorruptedError(
        `Config contains unknown field: ${key}`,
        configPath,
      );
    }
  }

  return data as MpakConfig;
}

/**
 * Configuration manager for CLI settings in ~/.mpak/config.json
 */
export class ConfigManager {
  private configDir: string;
  private configFile: string;
  private config: MpakConfig | null = null;

  constructor() {
    this.configDir = join(homedir(), ".mpak");
    this.configFile = join(this.configDir, "config.json");
    this.ensureConfigDir();
  }

  private ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true, mode: 0o700 });
    }
  }

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

    let configJson: string;
    try {
      configJson = readFileSync(this.configFile, "utf8");
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

    // Validate structure against schema
    this.config = validateConfig(parsed, this.configFile);
    return this.config;
  }

  private saveConfig(): void {
    if (!this.config) {
      return;
    }
    this.config.lastUpdated = new Date().toISOString();
    const configJson = JSON.stringify(this.config, null, 2);
    writeFileSync(this.configFile, configJson, { mode: 0o600 });
  }

  setRegistryUrl(url: string): void {
    const config = this.loadConfig();
    config.registryUrl = url;
    this.saveConfig();
  }

  getRegistryUrl(): string {
    const config = this.loadConfig();
    return (
      config.registryUrl ||
      process.env["MPAK_REGISTRY_URL"] ||
      "https://registry.mpak.dev"
    );
  }

  /**
   * Get all stored config values for a package
   */
  getPackageConfig(packageName: string): PackageConfig | undefined {
    const config = this.loadConfig();
    return config.packages?.[packageName];
  }

  /**
   * Get a specific config value for a package
   */
  getPackageConfigValue(
    packageName: string,
    key: string,
  ): string | undefined {
    const packageConfig = this.getPackageConfig(packageName);
    return packageConfig?.[key];
  }

  /**
   * Set a config value for a package
   */
  setPackageConfigValue(
    packageName: string,
    key: string,
    value: string,
  ): void {
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
   * Clear all config values for a package
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
   * Clear a specific config value for a package
   */
  clearPackageConfigValue(packageName: string, key: string): boolean {
    const config = this.loadConfig();
    if (config.packages?.[packageName]?.[key] !== undefined) {
      delete config.packages[packageName][key];
      // Clean up empty package entries
      if (Object.keys(config.packages[packageName]).length === 0) {
        delete config.packages[packageName];
      }
      this.saveConfig();
      return true;
    }
    return false;
  }

  /**
   * List all packages with stored config
   */
  listPackagesWithConfig(): string[] {
    const config = this.loadConfig();
    return Object.keys(config.packages || {});
  }
}
