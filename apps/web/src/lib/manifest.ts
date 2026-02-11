/**
 * MCPB Manifest types and utilities
 *
 * These types represent the structure of manifest.json in MCPB bundles.
 * See: https://github.com/modelcontextprotocol/mcpb
 */

// User config field definition
export interface UserConfigField {
  type: 'string' | 'number' | 'boolean';
  title?: string;
  description?: string;
  required?: boolean;
  sensitive?: boolean;
  default?: string | number | boolean;
}

// MCP server configuration
export interface MCPConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// Server configuration
export interface ManifestServer {
  type: 'python' | 'node' | 'binary';
  entry_point?: string;
  mcp_config?: MCPConfig;
}

// Author information
export interface ManifestAuthor {
  name: string;
  email?: string;
  url?: string;
}

// Full manifest structure
export interface MCPBManifest {
  manifest_version: string;
  name: string;
  version: string;
  description?: string;
  author?: ManifestAuthor;
  homepage?: string;
  license?: string;
  icon?: string;
  user_config?: Record<string, UserConfigField>;
  server?: ManifestServer;
  tools?: Array<{ name: string; description?: string }>;
  prompts?: Array<{ name: string; description?: string }>;
  resources?: Array<{ name: string; description?: string }>;
}

// Claude Code MCP server configuration
export interface ClaudeCodeMCPServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ClaudeCodeConfig {
  mcpServers: Record<string, ClaudeCodeMCPServer>;
}

/**
 * Generate Claude Code MCP configuration from package name and manifest.
 *
 * Parses user_config and server.mcp_config.env to determine which
 * environment variables the user needs to provide.
 *
 * @param pkgName - Full package name (e.g., "@nimblebraininc/ipinfo")
 * @param manifest - Package manifest (can be null/undefined or raw JSON)
 * @returns JSON string of Claude Code configuration
 */
export function generateMcpConfig(
  pkgName: string,
  manifest: Record<string, unknown> | MCPBManifest | null | undefined
): string {
  const serverName = pkgName.split('/').pop() || pkgName;

  // Build env vars from user_config + server.mcp_config.env mapping
  const env: Record<string, string> = {};
  const userConfig = manifest?.user_config as Record<string, UserConfigField> | undefined;
  const server = manifest?.server as ManifestServer | undefined;
  const mcpEnv = server?.mcp_config?.env || {};

  if (userConfig && Object.keys(userConfig).length > 0) {
    for (const [key] of Object.entries(userConfig)) {
      // Find the env var that maps to this user_config key
      const envEntry = Object.entries(mcpEnv).find(
        ([, val]) => val === `\${user_config.${key}}`
      );
      if (envEntry) {
        env[envEntry[0]] = 'YOUR_VALUE_HERE';
      }
    }
  }

  const config: ClaudeCodeConfig = {
    mcpServers: {
      [serverName]: {
        command: 'mpak',
        args: ['run', pkgName],
        ...(Object.keys(env).length > 0 ? { env } : {}),
      },
    },
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate base MCP config WITHOUT env vars.
 * Used for the CLI approach where mpak handles env vars internally.
 *
 * @param pkgName - Full package name (e.g., "@nimblebraininc/ipinfo")
 * @returns JSON string of Claude Code configuration without env
 */
export function generateBaseMcpConfig(pkgName: string): string {
  const serverName = pkgName.split('/').pop() || pkgName;

  const config: ClaudeCodeConfig = {
    mcpServers: {
      [serverName]: {
        command: 'mpak',
        args: ['run', pkgName],
      },
    },
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate CLI commands for configuring a package.
 *
 * Uses the user_config field names as keys for `mpak config set`.
 *
 * @param pkgName - Full package name (e.g., "@nimblebraininc/ipinfo")
 * @param manifest - Package manifest (can be null/undefined or raw JSON)
 * @returns Array of CLI commands to run
 */
export function generateCliCommands(
  pkgName: string,
  manifest: Record<string, unknown> | MCPBManifest | null | undefined
): string[] {
  const commands: string[] = [];
  const userConfig = manifest?.user_config as Record<string, UserConfigField> | undefined;

  if (userConfig && Object.keys(userConfig).length > 0) {
    // Build key=value pairs for the config set command
    const pairs = Object.keys(userConfig)
      .map(key => `${key}=YOUR_VALUE_HERE`)
      .join(' ');
    commands.push(`mpak config set ${pkgName} ${pairs}`);
  }

  return commands;
}

/**
 * Generate Claude Code `claude mcp add` command.
 *
 * @param pkgName - Full package name (e.g., "@nimblebraininc/ipinfo")
 * @param manifest - Package manifest (can be null/undefined or raw JSON)
 * @returns The claude mcp add command string
 */
export function generateClaudeCodeCommand(
  pkgName: string,
  manifest: Record<string, unknown> | MCPBManifest | null | undefined
): string {
  const serverName = pkgName.split('/').pop() || pkgName;

  // Build env flags from user_config + server.mcp_config.env mapping
  const envFlags: string[] = [];
  const userConfig = manifest?.user_config as Record<string, UserConfigField> | undefined;
  const server = manifest?.server as ManifestServer | undefined;
  const mcpEnv = server?.mcp_config?.env || {};

  if (userConfig && Object.keys(userConfig).length > 0) {
    for (const [key] of Object.entries(userConfig)) {
      // Find the env var that maps to this user_config key
      const envEntry = Object.entries(mcpEnv).find(
        ([, val]) => val === `\${user_config.${key}}`
      );
      if (envEntry) {
        envFlags.push(`--env ${envEntry[0]}=YOUR_VALUE_HERE`);
      }
    }
  }

  const envPart = envFlags.length > 0 ? ` ${envFlags.join(' ')}` : '';
  return `claude mcp add --transport stdio${envPart} ${serverName} -- mpak run ${pkgName}`;
}
