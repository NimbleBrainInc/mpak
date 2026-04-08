import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** Absolute path to the built CLI entry point. */
export const CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run the mpak CLI with the given args and return stdout, stderr, and exit code.
 * Never throws — non-zero exits are returned as exitCode.
 */
export async function run(args: string): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execAsync(`node ${CLI} ${args}`);
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
    };
  }
}
