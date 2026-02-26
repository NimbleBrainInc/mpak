import { Command } from "commander";
import { getVersion } from "./utils/version.js";
import { handleUnifiedSearch } from "./commands/search.js";
import { handleSearch } from "./commands/packages/search.js";
import { handleShow } from "./commands/packages/show.js";
import { handlePull } from "./commands/packages/pull.js";
import { handleRun } from "./commands/packages/run.js";
import {
  handleConfigSet,
  handleConfigGet,
  handleConfigList,
  handleConfigClear,
} from "./commands/config.js";
import { handleCompletion } from "./commands/completion.js";
import {
  handleSkillValidate,
  handleSkillPack,
  handleSkillSearch,
  handleSkillShow,
  handleSkillPull,
  handleSkillInstall,
  handleSkillList,
} from "./commands/skills/index.js";
import {
  handleProviderList,
  handleProviderSet,
  handleProviderShow,
} from "./commands/provider.js";

/**
 * Creates and configures the CLI program
 *
 * Command structure:
 * - mpak search <query>    - Unified search (bundles + skills)
 * - mpak bundle <command>  - MCP bundle commands
 * - mpak skill <command>   - Agent skill commands
 * - mpak config <command>  - Configuration commands
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name("mpak")
    .description("CLI for MCP bundles and Agent Skills")
    .version(getVersion(), "-v, --version", "Output the current version");

  // ==========================================================================
  // Unified search (bundles + skills)
  // ==========================================================================

  program
    .command("search <query>")
    .description("Search bundles and skills")
    .option("--type <type>", "Filter by type (bundle, skill)")
    .option("--sort <field>", "Sort by: downloads, recent, name")
    .option("--limit <number>", "Limit results", parseInt)
    .option("--offset <number>", "Pagination offset", parseInt)
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
      await handleUnifiedSearch(query, options);
    });

  // ==========================================================================
  // Top-level run alias (for Claude Code integration)
  // ==========================================================================

  program
    .command("run [package]")
    .description('Run an MCP server (alias for "bundle run")')
    .option("--update", "Force re-download even if cached")
    .option("-l, --local <path>", "Run a local .mcpb bundle file")
    .action(async (packageSpec, options) => {
      await handleRun(packageSpec || "", options);
    });

  // ==========================================================================
  // Bundle namespace (MCP bundles)
  // ==========================================================================

  const bundle = program.command("bundle").description("MCP bundle commands");

  bundle
    .command("search <query>")
    .description("Search public bundles")
    .option("--type <type>", "Filter by server type (node, python, binary)")
    .option("--sort <field>", "Sort by: downloads, recent, name")
    .option("--limit <number>", "Limit results", parseInt)
    .option("--offset <number>", "Pagination offset", parseInt)
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
      await handleSearch(query, options);
    });

  bundle
    .command("show <package>")
    .description("Show detailed information about a bundle")
    .option("--json", "Output as JSON")
    .action(async (packageName, options) => {
      await handleShow(packageName, options);
    });

  bundle
    .command("pull <package>")
    .description("Download a bundle from the registry")
    .option("-o, --output <path>", "Output file path")
    .option("--os <os>", "Target OS (darwin, linux, win32)")
    .option("--arch <arch>", "Target architecture (x64, arm64)")
    .option("--json", "Output download info as JSON")
    .action(async (packageSpec, options) => {
      await handlePull(packageSpec, options);
    });

  bundle
    .command("run [package]")
    .description("Run an MCP server from the registry")
    .option("--update", "Force re-download even if cached")
    .option("-l, --local <path>", "Run a local .mcpb bundle file")
    .action(async (packageSpec, options) => {
      await handleRun(packageSpec || "", options);
    });

  // ==========================================================================
  // Skill namespace (Agent Skills)
  // ==========================================================================

  const skill = program.command("skill").description("Agent skill commands");

  skill
    .command("validate <path>")
    .description("Validate a skill directory against the Agent Skills spec")
    .option("--json", "Output as JSON")
    .action(async (path, options) => {
      await handleSkillValidate(path, options);
    });

  skill
    .command("pack <path>")
    .description("Create a .skill bundle from a skill directory")
    .option("-o, --output <path>", "Output file path")
    .option("--json", "Output as JSON")
    .action(async (path, options) => {
      await handleSkillPack(path, options);
    });

  skill
    .command("search <query>")
    .description("Search skills in the registry")
    .option("--tags <tags>", "Filter by tags (comma-separated)")
    .option("--category <category>", "Filter by category")
    .option(
      "--surface <surface>",
      "Filter by surface (claude-code, claude-api, claude-ai)",
    )
    .option("--sort <field>", "Sort by: downloads, recent, name")
    .option("--limit <number>", "Limit results", parseInt)
    .option("--offset <number>", "Pagination offset", parseInt)
    .option("--json", "Output as JSON")
    .action(async (query, options) => {
      await handleSkillSearch(query, options);
    });

  skill
    .command("show <name>")
    .description("Show detailed information about a skill")
    .option("--json", "Output as JSON")
    .action(async (name, options) => {
      await handleSkillShow(name, options);
    });

  skill
    .command("pull <name>")
    .description("Download a .skill bundle from the registry")
    .option("-o, --output <path>", "Output file path")
    .option("--json", "Output as JSON")
    .action(async (name, options) => {
      await handleSkillPull(name, options);
    });

  skill
    .command("install <name>")
    .description("Install a skill to the target provider's skills directory")
    .option("--force", "Overwrite existing installation")
    .option("--json", "Output as JSON")
    .option(
      "-p, --provider <name>",
      "Target provider (claude, cursor, copilot, codex, gemini, goose, opencode)",
    )
    .action(async (name, options) => {
      await handleSkillInstall(name, options);
    });

  skill
    .command("list")
    .description("List installed skills")
    .option("--json", "Output as JSON")
    .option(
      "-p, --provider <name>",
      "Target provider (claude, cursor, copilot, codex, gemini, goose, opencode)",
    )
    .action(async (options) => {
      await handleSkillList(options);
    });

  // ==========================================================================
  // Config commands (shared for bundles and skills)
  // ==========================================================================

  const configCmd = program
    .command("config")
    .description("Manage per-package configuration values");

  configCmd
    .command("set <package> <key=value...>")
    .description("Set config value(s) for a package")
    .action(async (packageName, keyValuePairs) => {
      await handleConfigSet(packageName, keyValuePairs);
    });

  configCmd
    .command("get <package>")
    .description("Show stored config for a package (values are masked)")
    .option("--json", "Output as JSON")
    .action(async (packageName, options) => {
      await handleConfigGet(packageName, options);
    });

  configCmd
    .command("list")
    .description("List all packages with stored config")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      await handleConfigList(options);
    });

  configCmd
    .command("clear <package> [key]")
    .description("Clear config for a package (all values or specific key)")
    .action(async (packageName, key) => {
      await handleConfigClear(packageName, key);
    });

  // ==========================================================================
  // Provider commands
  // ==========================================================================

  const providerCmd = program
    .command("provider")
    .description("Manage skill provider (claude, cursor, copilot, etc.)");

  providerCmd
    .command("list")
    .description("List supported providers and show which are detected")
    .action(async () => {
      await handleProviderList();
    });

  providerCmd
    .command("set <name>")
    .description("Set the default provider")
    .action(async (name) => {
      await handleProviderSet(name);
    });

  providerCmd
    .command("show")
    .description("Show the current resolved provider and skills directory")
    .action(async () => {
      await handleProviderShow();
    });

  // ==========================================================================
  // Shell completion
  // ==========================================================================

  program
    .command("completion <shell>")
    .description("Generate shell completion script (bash, zsh, fish)")
    .action((shell) => {
      handleCompletion(shell);
    });

  return program;
}
