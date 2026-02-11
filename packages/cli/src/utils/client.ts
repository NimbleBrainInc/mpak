import { MpakClient } from "@nimblebrain/mpak-sdk";
import { ConfigManager } from "./config-manager.js";
import { getVersion } from "./version.js";

/**
 * Create an MpakClient with standard CLI configuration
 * (registry URL from config, User-Agent with CLI version).
 */
export function createClient(): MpakClient {
  const configManager = new ConfigManager();
  const version = getVersion();
  return new MpakClient({
    registryUrl: configManager.getRegistryUrl(),
    userAgent: `mpak-cli/${version}`,
  });
}
