import { spawnSync } from 'node:child_process';

/**
 * Probe `uv` (or any uv-compatible binary path) for its version.
 *
 * Returns `null` if the binary doesn't exist or doesn't respond to
 * `--version`. We don't distinguish "not installed" from "broken" — both
 * collapse to "this uv cannot serve the bundle."
 */
export function probeUv(command: string): { version: string } | null {
  const probe = spawnSync(command, ['--version'], {
    stdio: 'pipe',
    timeout: 5_000,
  });
  if (probe.status !== 0) return null;
  const out = probe.stdout.toString().trim();
  // `uv --version` prints e.g. "uv 0.4.22 (3f6f4f9 2024-10-17)" — peel off
  // the leading word and take the version token. Fall back to the full
  // string if the format ever changes; the caller only uses this for log
  // output, not parsing.
  const m = /\b(\d+\.\d+\.\d+\S*)/.exec(out);
  return { version: m ? m[1]! : out };
}

/**
 * Surfaced when uv isn't reachable on the host.
 */
export class UvResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UvResolutionError';
  }
}

export interface ResolveUvOptions {
  /** Bundle cache directory — passed to `uv run --directory`. */
  cacheDir: string;
  /** Bundle entry point (relative to cacheDir). */
  entryPoint: string;
  /** `mcp_config.command` from the manifest. Defaults to `"uv"`. */
  manifestCommand: string | undefined;
  /**
   * Manifest-supplied args, post-substitution. When non-empty the resolver
   * defers to them; when empty the resolver supplies the spec-canonical
   * `run --directory <cacheDir> <entry_point>` form.
   */
  userArgs: string[];
  /**
   * Probe override for tests. Production callers omit this and the resolver
   * spawns the real binary.
   */
  probe?: (command: string) => { version: string } | null;
}

export interface ResolvedUv {
  command: string;
  args: string[];
  version: string;
}

/**
 * Resolve the `uv` invocation for a `type: "uv"` bundle.
 *
 * Two responsibilities:
 *
 *   1. **Preflight uv.** If the chosen binary isn't reachable, throw a clear
 *      error with install instructions. Without this, the user sees a raw
 *      ENOENT mid-spawn and has to know that "uv" is the missing piece.
 *
 *   2. **Default args to the spec-canonical form.** When the manifest doesn't
 *      provide its own args, default to
 *      `run --directory <cacheDir> <entry_point>` — matching the upstream
 *      hello-world-uv example. The `--directory` flag makes the invocation
 *      cwd-independent so embedders that don't honor `server.cwd` still find
 *      `pyproject.toml` correctly.
 */
export function resolveUv(options: ResolveUvOptions): ResolvedUv {
  const { cacheDir, entryPoint, manifestCommand, userArgs, probe = probeUv } = options;

  const command = manifestCommand && manifestCommand.length > 0 ? manifestCommand : 'uv';

  const probed = probe(command);
  if (!probed) {
    throw new UvResolutionError(
      [
        `\`${command}\` is required to run this bundle but is not on PATH.`,
        `  Install uv:`,
        `    macOS / Linux: curl -LsSf https://astral.sh/uv/install.sh | sh`,
        `    Windows:       irm https://astral.sh/uv/install.ps1 | iex`,
        `  Docs: https://docs.astral.sh/uv/`,
      ].join('\n'),
    );
  }

  const args = userArgs.length > 0 ? userArgs : ['run', '--directory', cacheDir, entryPoint];

  return { command, args, version: probed.version };
}
