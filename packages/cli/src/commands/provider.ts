import { ConfigManager } from "../utils/config-manager.js";
import {
  detectProviders,
  getProviderNames,
  getSkillsDir,
  isValidProvider,
  resolveProvider,
} from "../utils/providers.js";

/**
 * List all supported providers and indicate which are detected
 */
export async function handleProviderList(): Promise<void> {
  const detected = detectProviders();
  const all = getProviderNames();

  console.log("");
  console.log("Supported providers:");
  console.log("");

  for (const name of all) {
    const isDetected = detected.includes(name);
    const marker = isDetected ? "\u2713" : " ";
    const dir = getSkillsDir(name);
    console.log(`  ${marker} ${name.padEnd(10)} ${dir}`);
  }

  console.log("");
  if (detected.length > 0) {
    console.log(`Detected: ${detected.join(", ")}`);
  } else {
    console.log("No providers detected. Defaulting to claude.");
  }
}

/**
 * Set the default provider
 */
export async function handleProviderSet(name: string): Promise<void> {
  if (!isValidProvider(name)) {
    process.stderr.write(
      `Error: Unknown provider: ${name}\n`,
    );
    process.stderr.write(
      `Valid providers: ${getProviderNames().join(", ")}\n`,
    );
    process.exit(1);
  }

  const configManager = new ConfigManager();
  configManager.setProvider(name);

  console.log(
    `Default provider set to: ${name} (${getSkillsDir(name)})`,
  );
}

/**
 * Show the current resolved provider and skills directory
 */
export async function handleProviderShow(): Promise<void> {
  try {
    const { provider, skillsDir } = resolveProvider();
    console.log(`Provider: ${provider}`);
    console.log(`Skills directory: ${skillsDir}`);
  } catch (err) {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}
