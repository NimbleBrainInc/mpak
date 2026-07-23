import { Command } from 'commander';
import { handleCompletion } from './commands/completion.js';
import {
  handleConfigClear,
  handleConfigGet,
  handleConfigList,
  handleConfigSet,
} from './commands/config.js';
import { handleOutdated } from './commands/packages/outdated.js';
import { handlePull } from './commands/packages/pull.js';
import { handleRun } from './commands/packages/run.js';
import { handleSearch } from './commands/packages/search.js';
import { handleShow } from './commands/packages/show.js';
import { handleUpdate } from './commands/packages/update.js';
import { handleUnifiedSearch } from './commands/search.js';
import { getVersion } from './utils/version.js';

/**
 * Creates and configures the CLI program
 *
 * Command structure:
 * - mpak search <query>    - Search bundles
 * - mpak bundle <command>  - MCP bundle commands
 * - mpak config <command>  - Configuration commands
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('mpak')
    .description('CLI for MCP bundles')
    .version(getVersion(), '-v, --version', 'Output the current version');

  // ==========================================================================
  // Search (bundles)
  // ==========================================================================

  program
    .command('search <query>')
    .description('Search bundles')
    .option('--sort <field>', 'Sort by: downloads, recent, name')
    .option('--limit <number>', 'Limit results', parseInt)
    .option('--offset <number>', 'Pagination offset', parseInt)
    .option('--json', 'Output as JSON')
    .action(async (query, options) => {
      await handleUnifiedSearch(query, options);
    });

  // ==========================================================================
  // Top-level run alias (for Claude Code integration)
  // ==========================================================================

  program
    .command('run [package]')
    .description('Run an MCP server (alias for "bundle run")')
    .option('--update', 'Force re-download even if cached')
    .option('-l, --local <path>', 'Run a local .mcpb bundle file')
    .action(async (packageSpec, options) => {
      await handleRun(packageSpec || '', options);
    });

  // ==========================================================================
  // Top-level outdated / update aliases
  // ==========================================================================

  program
    .command('outdated')
    .description('Check cached bundles for updates (alias for "bundle outdated")')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await handleOutdated(options);
    });

  program
    .command('update [package]')
    .description('Update cached bundles (alias for "bundle update")')
    .option('--json', 'Output as JSON')
    .action(async (packageName, options) => {
      await handleUpdate(packageName, options);
    });

  // ==========================================================================
  // Bundle namespace (MCP bundles)
  // ==========================================================================

  const bundle = program.command('bundle').description('MCP bundle commands');

  bundle
    .command('search <query>')
    .description('Search public bundles')
    .option('--type <type>', 'Filter by server type (node, python, binary)')
    .option('--sort <field>', 'Sort by: downloads, recent, name')
    .option('--limit <number>', 'Limit results', parseInt)
    .option('--offset <number>', 'Pagination offset', parseInt)
    .option('--json', 'Output as JSON')
    .action(async (query, options) => {
      await handleSearch(query, options);
    });

  bundle
    .command('show <package>')
    .description('Show detailed information about a bundle')
    .option('--json', 'Output as JSON')
    .action(async (packageName, options) => {
      await handleShow(packageName, options);
    });

  bundle
    .command('pull <package>')
    .description('Download a bundle from the registry')
    .option('-o, --output <path>', 'Output file path')
    .option('--os <os>', 'Target OS (darwin, linux, win32)')
    .option('--arch <arch>', 'Target architecture (x64, arm64)')
    .option('--json', 'Output download info as JSON')
    .action(async (packageSpec, options) => {
      await handlePull(packageSpec, options);
    });

  bundle
    .command('run [package]')
    .description('Run an MCP server from the registry')
    .option('--update', 'Force re-download even if cached')
    .option('-l, --local <path>', 'Run a local .mcpb bundle file')
    .action(async (packageSpec, options) => {
      await handleRun(packageSpec || '', options);
    });

  bundle
    .command('outdated')
    .description('Check cached bundles for available updates')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await handleOutdated(options);
    });

  bundle
    .command('update [package]')
    .description('Update cached bundles to latest versions')
    .option('--json', 'Output as JSON')
    .action(async (packageName, options) => {
      await handleUpdate(packageName, options);
    });

  // ==========================================================================
  // Config commands
  // ==========================================================================

  const configCmd = program
    .command('config')
    .description('Manage per-package configuration values');

  configCmd
    .command('set <package> <key=value...>')
    .description('Set config value(s) for a package')
    .action(async (packageName, keyValuePairs) => {
      await handleConfigSet(packageName, keyValuePairs);
    });

  configCmd
    .command('get <package>')
    .description('Show stored config for a package (values are masked)')
    .option('--json', 'Output as JSON')
    .action(async (packageName, options) => {
      await handleConfigGet(packageName, options);
    });

  configCmd
    .command('list')
    .description('List all packages with stored config')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      await handleConfigList(options);
    });

  configCmd
    .command('clear <package> [key]')
    .description('Clear config for a package (all values or specific key)')
    .action(async (packageName, key) => {
      await handleConfigClear(packageName, key);
    });

  // ==========================================================================
  // Shell completion
  // ==========================================================================

  program
    .command('completion <shell>')
    .description('Generate shell completion script (bash, zsh, fish)')
    .action((shell) => {
      handleCompletion(shell);
    });

  return program;
}
