import type { PrepareServerSpec, ServerCommand } from '@nimblebrain/mpak-sdk';
import { MpakConfigError, parsePackageSpec } from '@nimblebrain/mpak-sdk';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { mpak } from '../../utils/config.js';

export interface RunOptions {
  update?: boolean;
  local?: string; // Path to local .mcpb file
}

/**
 * Prompt user for a missing config value (interactive terminal input)
 */
async function promptForValue(field: {
  key: string;
  title: string;
  description?: string;
  sensitive: boolean;
}): Promise<string> {
  return new Promise((resolvePrompt) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    const label = field.title;
    const hint = field.description ? ` (${field.description})` : '';
    const prompt = `=> ${label}${hint}: `;

    if (field.sensitive) {
      process.stderr.write(`=> (sensitive input)\n`);
    }

    rl.question(prompt, (answer) => {
      rl.close();
      resolvePrompt(answer);
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
 * Handle MpakConfigError by prompting for missing values interactively.
 * Saves provided values to config, then retries prepareServer.
 */
async function handleMissingConfig(
  err: MpakConfigError,
  spec: PrepareServerSpec,
  options: RunOptions,
): Promise<ServerCommand> {
  if (!isInteractive()) {
    const missingKeys = err.missingFields.map((f) => f.key).join(', ');
    process.stderr.write(`=> Error: Missing required config: ${missingKeys}\n`);
    process.stderr.write(
      `=> Run 'mpak config set ${err.packageName} <key>=<value>' to set values\n`,
    );
    process.exit(1);
  }

  process.stderr.write(`=> Package requires configuration:\n`);
  for (const field of err.missingFields) {
    const value = await promptForValue(field);
    if (!value) {
      process.stderr.write(`=> Error: ${field.title} is required\n`);
      process.exit(1);
    }

    // Offer to save the value
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });
    await new Promise<void>((resolvePrompt) => {
      rl.question(`=> Save ${field.title} for future runs? [Y/n]: `, (answer) => {
        rl.close();
        if (answer.toLowerCase() !== 'n') {
          mpak.configManager.setPackageConfigValue(err.packageName, field.key, value);
          process.stderr.write(`=> Saved to ~/.mpak/config.json\n`);
        }
        resolvePrompt();
      });
    });
  }

  // Retry now that config values are saved
  return mpak.prepareServer(spec, options.update ? { force: true } : {});
}

/**
 * Run a package from the registry or a local bundle file
 */
export async function handleRun(packageSpec: string, options: RunOptions = {}): Promise<void> {
  // Validate that either --local or package spec is provided
  if (!options.local && !packageSpec) {
    process.stderr.write(`=> Error: Either provide a package name or use --local <path>\n`);
    process.exit(1);
  }

  // CLI-level validation for --local
  if (options.local) {
    const bundlePath = resolve(options.local);

    if (!existsSync(bundlePath)) {
      process.stderr.write(`=> Error: Bundle not found: ${bundlePath}\n`);
      process.exit(1);
    }

    if (!bundlePath.endsWith('.mcpb')) {
      process.stderr.write(`=> Error: Not an MCPB bundle: ${bundlePath}\n`);
      process.exit(1);
    }
  }

  // Build the spec
  const spec: PrepareServerSpec = options.local
    ? { local: resolve(options.local) }
    : parsePackageSpec(packageSpec);

  // Prepare server — handle missing config interactively
  let server: ServerCommand;
  try {
    server = await mpak.prepareServer(spec, options.update ? { force: true } : {});
  } catch (err) {
    if (err instanceof MpakConfigError) {
      server = await handleMissingConfig(err, spec, options);
    } else {
      throw err;
    }
  }

  // Spawn with stdio passthrough for MCP
  const child = spawn(server.command, server.args, {
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...server.env, ...process.env },
    cwd: server.cwd,
  });

  // Fire-and-forget update check for registry bundles
  let updateCheckPromise: Promise<void> | null = null;
  if (!options.local && !options.update) {
    updateCheckPromise = mpak.bundleCache
      .checkForUpdate(server.name)
      .then((latestVersion) => {
        if (latestVersion) {
          process.stderr.write(
            `\n=> Update available: ${server.name} ${server.version} -> ${latestVersion}\n` +
              `   Run 'mpak run ${server.name} --update' to update\n`,
          );
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`=> Debug: update check failed: ${msg}\n`);
      });
  }

  // Forward signals
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  // Wait for exit
  child.on('exit', async (code) => {
    if (updateCheckPromise) {
      try {
        await Promise.race([updateCheckPromise, new Promise((r) => setTimeout(r, 3000))]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`=> Debug: update check failed: ${msg}\n`);
      }
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    process.stderr.write(`=> Failed to start server: ${error.message}\n`);
    process.exit(1);
  });
}
