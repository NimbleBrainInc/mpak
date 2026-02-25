import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { ConfigManager } from "./config-manager.js";

/**
 * Provider name → default skills directory
 */
const PROVIDERS = {
  claude: () => join(homedir(), ".claude", "skills"),
  cursor: () => join(homedir(), ".cursor", "skills"),
  copilot: () => join(homedir(), ".copilot", "skills"),
  codex: () => join(homedir(), ".codex", "skills"),
  gemini: () => join(homedir(), ".gemini", "skills"),
  goose: () => join(homedir(), ".config", "agents", "skills"),
  opencode: () => join(homedir(), ".config", "opencode", "skills"),
} as const;

export type ProviderName = keyof typeof PROVIDERS;

/**
 * Provider parent directories used for detection
 */
const PROVIDER_PARENTS: Record<ProviderName, () => string> = {
  claude: () => join(homedir(), ".claude"),
  cursor: () => join(homedir(), ".cursor"),
  copilot: () => join(homedir(), ".copilot"),
  codex: () => join(homedir(), ".codex"),
  gemini: () => join(homedir(), ".gemini"),
  goose: () => join(homedir(), ".config", "agents"),
  opencode: () => join(homedir(), ".config", "opencode"),
};

/**
 * List all valid provider names
 */
export function getProviderNames(): ProviderName[] {
  return Object.keys(PROVIDERS) as ProviderName[];
}

/**
 * Check if a string is a valid provider name
 */
export function isValidProvider(name: string): name is ProviderName {
  return Object.hasOwn(PROVIDERS, name);
}

/**
 * Get the skills directory for a specific provider
 */
export function getSkillsDir(provider: ProviderName): string {
  return PROVIDERS[provider]();
}

/**
 * Detect which providers are present by checking if their parent directories exist
 */
export function detectProviders(): ProviderName[] {
  const detected: ProviderName[] = [];
  for (const [name, parentDir] of Object.entries(PROVIDER_PARENTS)) {
    if (existsSync(parentDir())) {
      detected.push(name as ProviderName);
    }
  }
  return detected;
}

/**
 * Resolution result from resolveProvider
 */
export interface ResolvedProvider {
  provider: ProviderName;
  skillsDir: string;
}

/**
 * Resolve the target provider using the priority chain:
 * 1. Explicit --provider flag
 * 2. MPAK_PROVIDER env var
 * 3. provider field in ~/.mpak/config.json
 * 4. Auto-detect: exactly 1 → use it, 0 → default to claude, multiple → error
 */
export function resolveProvider(explicit?: string): ResolvedProvider {
  // 1. Explicit --provider flag
  if (explicit) {
    if (!isValidProvider(explicit)) {
      throw new Error(
        `Unknown provider: ${explicit}\nValid providers: ${getProviderNames().join(", ")}`,
      );
    }
    return { provider: explicit, skillsDir: getSkillsDir(explicit) };
  }

  // 2. MPAK_PROVIDER env var
  const envProvider = process.env["MPAK_PROVIDER"];
  if (envProvider) {
    if (!isValidProvider(envProvider)) {
      throw new Error(
        `Unknown provider in MPAK_PROVIDER: ${envProvider}\nValid providers: ${getProviderNames().join(", ")}`,
      );
    }
    return { provider: envProvider, skillsDir: getSkillsDir(envProvider) };
  }

  // 3. Config file
  const configManager = new ConfigManager();
  const configProvider = configManager.getProvider();
  if (configProvider) {
    if (!isValidProvider(configProvider)) {
      throw new Error(
        `Unknown provider in config: ${configProvider}\nValid providers: ${getProviderNames().join(", ")}`,
      );
    }
    return {
      provider: configProvider,
      skillsDir: getSkillsDir(configProvider),
    };
  }

  // 4. Auto-detect
  const detected = detectProviders();

  if (detected.length === 1) {
    const provider = detected[0]!;
    return { provider, skillsDir: getSkillsDir(provider) };
  }

  if (detected.length === 0) {
    // Default to claude when nothing is detected
    return { provider: "claude", skillsDir: getSkillsDir("claude") };
  }

  // Multiple providers detected — ambiguous
  throw new Error(
    `Multiple providers detected: ${detected.join(", ")}\nSet a default: mpak provider set <name>\nOr specify: mpak skill install --provider <name> <skill>`,
  );
}
