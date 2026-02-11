import { ConfigManager } from "../utils/config-manager.js";
import type { PackageConfig } from "../utils/config-manager.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ConfigSetOptions {}

export interface ConfigGetOptions {
  json?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ConfigClearOptions {}

/**
 * Mask sensitive values for display (show first 4 chars, rest as *)
 */
function maskValue(value: string): string {
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }
  return value.substring(0, 4) + "*".repeat(value.length - 4);
}

/**
 * Set config value(s) for a package
 * @example mpak config set @scope/name api_key=xxx
 * @example mpak config set @scope/name api_key=xxx other_key=yyy
 */
export async function handleConfigSet(
  packageName: string,
  keyValuePairs: string[],
  _options: ConfigSetOptions = {},
): Promise<void> {
  if (keyValuePairs.length === 0) {
    process.stderr.write(
      "Error: At least one key=value pair is required\n",
    );
    process.stderr.write(
      "Usage: mpak config set <package> <key>=<value> [<key>=<value>...]\n",
    );
    process.exit(1);
  }

  const configManager = new ConfigManager();
  let setCount = 0;

  for (const pair of keyValuePairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) {
      process.stderr.write(
        `Error: Invalid format "${pair}". Expected key=value\n`,
      );
      process.exit(1);
    }

    const key = pair.substring(0, eqIndex);
    const value = pair.substring(eqIndex + 1);

    if (!key) {
      process.stderr.write(`Error: Empty key in "${pair}"\n`);
      process.exit(1);
    }

    configManager.setPackageConfigValue(packageName, key, value);
    setCount++;
  }

  console.log(`Set ${setCount} config value(s) for ${packageName}`);
}

/**
 * Get config values for a package
 * @example mpak config get @scope/name
 * @example mpak config get @scope/name --json
 */
export async function handleConfigGet(
  packageName: string,
  options: ConfigGetOptions = {},
): Promise<void> {
  const configManager = new ConfigManager();
  const config = configManager.getPackageConfig(packageName);

  if (!config || Object.keys(config).length === 0) {
    if (options.json) {
      console.log(JSON.stringify({}, null, 2));
    } else {
      console.log(`No config stored for ${packageName}`);
    }
    return;
  }

  if (options.json) {
    // Mask values in JSON output too
    const masked: PackageConfig = {};
    for (const [key, value] of Object.entries(config)) {
      masked[key] = maskValue(value);
    }
    console.log(JSON.stringify(masked, null, 2));
  } else {
    console.log(`Config for ${packageName}:`);
    for (const [key, value] of Object.entries(config)) {
      console.log(`  ${key}: ${maskValue(value)}`);
    }
  }
}

/**
 * List all packages with stored config
 * @example mpak config list
 */
export async function handleConfigList(
  options: ConfigGetOptions = {},
): Promise<void> {
  const configManager = new ConfigManager();
  const packages = configManager.listPackagesWithConfig();

  if (packages.length === 0) {
    if (options.json) {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log("No packages have stored config");
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(packages, null, 2));
  } else {
    console.log("Packages with stored config:");
    for (const pkg of packages) {
      const config = configManager.getPackageConfig(pkg);
      const keyCount = config ? Object.keys(config).length : 0;
      console.log(
        `  ${pkg} (${keyCount} value${keyCount === 1 ? "" : "s"})`,
      );
    }
  }
}

/**
 * Clear config for a package
 * @example mpak config clear @scope/name        # clears all
 * @example mpak config clear @scope/name api_key  # clears specific key
 */
export async function handleConfigClear(
  packageName: string,
  key?: string,
  _options: ConfigClearOptions = {},
): Promise<void> {
  const configManager = new ConfigManager();

  if (key) {
    // Clear specific key
    const cleared = configManager.clearPackageConfigValue(packageName, key);
    if (cleared) {
      console.log(`Cleared ${key} for ${packageName}`);
    } else {
      console.log(`No value found for ${key} in ${packageName}`);
    }
  } else {
    // Clear all config for package
    const cleared = configManager.clearPackageConfig(packageName);
    if (cleared) {
      console.log(`Cleared all config for ${packageName}`);
    } else {
      console.log(`No config found for ${packageName}`);
    }
  }
}
