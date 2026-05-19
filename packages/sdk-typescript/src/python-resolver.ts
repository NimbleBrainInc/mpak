import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Required Python ABI inferred from a bundle's vendored extension modules.
 *
 * - `tag: "cpython-313"`, `abi3: false` — pinned to one major.minor.
 * - `tag: "abi3"`, `abi3: true`, `floor: { major: 3, minor: 7 }` — stable ABI;
 *   any cpython >= floor satisfies it.
 * - `null` from {@link findRequiredAbi} means a pure-Python bundle (no `.so`/
 *   `.pyd` files); any interpreter satisfying the manifest's declared range
 *   will do.
 */
export interface RequiredAbi {
  tag: string;
  abi3: boolean;
  floor?: { major: number; minor: number };
}

/**
 * Parse the cpython ABI tag from a single compiled-extension filename.
 *
 * Recognized shapes (per PEP 425 and the abi3 stable-ABI convention):
 *   - `<mod>.cpython-313-darwin.so`            → `{ tag: "cpython-313" }`
 *   - `<mod>.cpython-313-x86_64-linux-gnu.so`  → `{ tag: "cpython-313" }`
 *   - `<mod>.cpython-3.7-abi3-<plat>.so`       → `{ tag: "abi3", floor: 3.7 }`
 *   - `<mod>.abi3.so`                          → `{ tag: "abi3", floor: 3.2 }`
 *
 * Returns `null` for filenames that don't match any known pattern (e.g.
 * pure-Python `.py` files, vendor metadata) so the caller can keep scanning.
 */
export function parseCpythonTag(filename: string): RequiredAbi | null {
  // abi3 with explicit floor: cpython-3.7-abi3-<plat>.so
  const abi3WithFloor = /\.cpython-(\d+)\.(\d+)-abi3[-.]/.exec(filename);
  if (abi3WithFloor) {
    return {
      tag: 'abi3',
      abi3: true,
      floor: {
        major: Number(abi3WithFloor[1]),
        minor: Number(abi3WithFloor[2]),
      },
    };
  }
  // Bare abi3 (no floor declared in name): historically any 3.2+, but in
  // practice cpython has only shipped abi3 wheels from 3.7+. Use 3.7 as the
  // pragmatic floor — narrower than the spec, broader than any modern host.
  if (/\.abi3\.(so|pyd|dylib)$/.test(filename)) {
    return { tag: 'abi3', abi3: true, floor: { major: 3, minor: 7 } };
  }
  // Specific: cpython-XY-... or cpython-XYZ-... (concatenated major+minor)
  const specific = /\.cpython-(\d{2,3})[-.]/.exec(filename);
  if (specific) {
    return { tag: `cpython-${specific[1]}`, abi3: false };
  }
  return null;
}

/**
 * Walk `<cacheDir>/deps/` and return the first compiled-extension ABI
 * requirement found. A single specific (`cpython-XYZ`) tag wins over abi3 —
 * if the bundle ships *any* version-specific extension, the whole bundle is
 * pinned to that interpreter regardless of what other extensions claim.
 *
 * Returns `null` for pure-Python bundles (no `.so`/`.pyd`/`.dylib` found).
 */
export function findRequiredAbi(cacheDir: string): RequiredAbi | null {
  const depsDir = join(cacheDir, 'deps');
  if (!existsSync(depsDir)) return null;

  let abi3Hit: RequiredAbi | null = null;

  // Bounded recursive walk — bundles can nest deps a few levels for
  // namespace packages, but we cap depth defensively to avoid runaway
  // traversal on a malformed bundle.
  const walk = (dir: string, depth: number): RequiredAbi | null => {
    if (depth > 8) return null;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return null;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        const found = walk(full, depth + 1);
        if (found && !found.abi3) return found;
        if (found && found.abi3 && !abi3Hit) abi3Hit = found;
        continue;
      }
      if (!/\.(so|pyd|dylib)$/.test(name)) continue;
      const parsed = parseCpythonTag(name);
      if (!parsed) continue;
      if (!parsed.abi3) return parsed;
      if (!abi3Hit) abi3Hit = parsed;
    }
    return null;
  };

  return walk(depsDir, 0) ?? abi3Hit;
}

/**
 * Probe a Python executable for its ABI cache tag and version string.
 *
 * Returns `null` if the binary doesn't exist, errors out, or doesn't print
 * the expected two-line output. We don't distinguish "not found" from
 * "broken" — both reduce to "this interpreter cannot serve the bundle."
 */
export function probeInterpreter(command: string): { cacheTag: string; version: string } | null {
  const probe = spawnSync(
    command,
    [
      '-c',
      "import sys; print(sys.implementation.cache_tag); print('.'.join(map(str, sys.version_info[:3])))",
    ],
    { stdio: 'pipe', timeout: 5_000 },
  );
  if (probe.status !== 0) return null;
  const lines = probe.stdout.toString().trim().split('\n');
  if (lines.length < 2) return null;
  const [cacheTag, version] = lines as [string, string];
  if (!cacheTag || !version) return null;
  return { cacheTag, version };
}

/**
 * Compare a probed cpython tag against the bundle's required ABI.
 */
export function abiMatches(probedTag: string, required: RequiredAbi): boolean {
  if (!required.abi3) {
    return probedTag === required.tag;
  }
  // abi3: probed interpreter must be cpython >= floor.
  const m = /^cpython-(\d+)$/.exec(probedTag);
  if (!m) return false;
  const probedDigits = m[1]!;
  // `cpython-313` packs major+minor as digits; `cpython-3.7` would split on a
  // dot, but Python's cache_tag joins them. We treat `313` → 3.13, `37` → 3.7.
  const major = Number(probedDigits[0]);
  const minor = Number(probedDigits.slice(1));
  if (!required.floor) return major === 3;
  if (major !== required.floor.major) return major > required.floor.major;
  return minor >= required.floor.minor;
}

/**
 * Minimal satisfier for `compatibility.runtimes.python`-style ranges.
 *
 * Supported clauses (comma-separated, ANDed): `>=X.Y`, `>X.Y`, `<=X.Y`,
 * `<X.Y`, `==X.Y` / `=X.Y` / `X.Y` (exact). Patches optional. Whitespace
 * tolerated. No `^`/`~` — those aren't standard for Python `requires-python`
 * and we don't want to invent semantics.
 *
 * Returns `true` when the version satisfies *all* clauses, `false` when any
 * clause rejects it, and `true` for an empty/unparseable range (caller should
 * treat unparseable input as "no constraint" rather than crashing the host).
 */
export function satisfiesPythonRange(version: string, range: string): boolean {
  const v = parseVersion(version);
  if (!v) return true;
  const clauses = range
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (clauses.length === 0) return true;
  for (const clause of clauses) {
    if (!evaluateClause(v, clause)) return false;
  }
  return true;
}

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

function parseVersion(raw: string): SemVer | null {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(raw.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: m[3] ? Number(m[3]) : 0,
  };
}

function compareVersions(a: SemVer, b: SemVer): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

function evaluateClause(v: SemVer, clause: string): boolean {
  const m = /^(>=|<=|>|<|==|=)?\s*(\d+\.\d+(?:\.\d+)?)$/.exec(clause);
  if (!m) return true; // unparseable clause → don't reject
  const op = m[1] ?? '==';
  const target = parseVersion(m[2]!)!;
  const cmp = compareVersions(v, target);
  switch (op) {
    case '>=':
      return cmp >= 0;
    case '>':
      return cmp > 0;
    case '<=':
      return cmp <= 0;
    case '<':
      return cmp < 0;
    case '==':
    case '=':
      // Exact-on-major.minor when patch wasn't specified in target — treats
      // `==3.13` as "any 3.13.x".
      if (!/\.\d+\.\d+/.test(m[2]!)) {
        return v.major === target.major && v.minor === target.minor;
      }
      return cmp === 0;
    default:
      return true;
  }
}

/**
 * Resolution input.
 */
export interface ResolvePythonOptions {
  /** Bundle cache directory (contains `deps/`). */
  cacheDir: string;
  /** `mcp_config.command` from the manifest, if declared. */
  manifestCommand: string | undefined;
  /** `compatibility.runtimes.python` range from the manifest, if declared. */
  declaredRange: string | undefined;
  /**
   * Process env, used to read `MPAK_PYTHON`. Caller passes `process.env` in
   * production; tests inject a synthetic record.
   */
  env: NodeJS.ProcessEnv;
  /**
   * Override the interpreter probe. Production callers omit this and the
   * resolver spawns the real binary. Tests inject a stub so the suite
   * doesn't depend on which Python happens to be on the test runner.
   */
  probe?: (command: string) => { cacheTag: string; version: string } | null;
}

/**
 * Resolution result — the spawnable command plus diagnostics for the caller
 * to log.
 */
export interface ResolvedPython {
  command: string;
  cacheTag: string;
  version: string;
  source: 'MPAK_PYTHON' | 'manifest' | 'default';
}

/**
 * One probe, no candidate parade.
 *
 * Resolution order: `MPAK_PYTHON` env var → `mcp_config.command` →
 * literal `"python3"`. We pick exactly one command, probe it once, and
 * either return it (on ABI + range match) or throw with an actionable
 * message. The contract is "tell me which Python to use; if it doesn't fit,
 * I'll explain why and stop."
 */
export function resolvePython(options: ResolvePythonOptions): ResolvedPython {
  const { cacheDir, manifestCommand, declaredRange, env, probe = probeInterpreter } = options;

  let command: string;
  let source: ResolvedPython['source'];
  if (env['MPAK_PYTHON'] && env['MPAK_PYTHON'].trim().length > 0) {
    command = env['MPAK_PYTHON'];
    source = 'MPAK_PYTHON';
  } else if (manifestCommand && manifestCommand.length > 0) {
    command = manifestCommand;
    source = 'manifest';
  } else {
    command = 'python3';
    source = 'default';
  }

  const probed = probe(command);
  if (!probed) {
    throw new PythonResolutionError(formatNotFoundMessage(command, source, cacheDir));
  }

  const required = findRequiredAbi(cacheDir);
  if (required && !abiMatches(probed.cacheTag, required)) {
    throw new PythonResolutionError(formatAbiMismatchMessage(command, source, probed, required));
  }

  if (declaredRange && !satisfiesPythonRange(probed.version, declaredRange)) {
    throw new PythonResolutionError(
      formatRangeMismatchMessage(command, source, probed, declaredRange),
    );
  }

  return { command, cacheTag: probed.cacheTag, version: probed.version, source };
}

/**
 * Surfaced when the resolver cannot pick a Python interpreter that runs the
 * bundle. Callers translate this to a CLI-friendly error.
 */
export class PythonResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PythonResolutionError';
  }
}

function formatNotFoundMessage(
  command: string,
  source: ResolvedPython['source'],
  _cacheDir: string,
): string {
  const origin =
    source === 'MPAK_PYTHON'
      ? 'MPAK_PYTHON env var'
      : source === 'manifest'
        ? 'bundle manifest'
        : 'default';
  return [
    `Python interpreter '${command}' (from ${origin}) is not runnable.`,
    `  Set MPAK_PYTHON to a working interpreter:`,
    `    export MPAK_PYTHON=$(which python3)`,
    `  Or install Python: https://www.python.org/downloads/`,
  ].join('\n');
}

function formatAbiMismatchMessage(
  command: string,
  source: ResolvedPython['source'],
  probed: { cacheTag: string; version: string },
  required: RequiredAbi,
): string {
  const requiredHuman = required.abi3
    ? `Python ${required.floor!.major}.${required.floor!.minor}+ (stable ABI)`
    : `Python ${cpythonTagToHuman(required.tag)} (${required.tag})`;
  const originLabel =
    source === 'MPAK_PYTHON'
      ? 'MPAK_PYTHON'
      : source === 'manifest'
        ? 'manifest mcp_config.command'
        : "default 'python3'";
  return [
    `Bundle requires ${requiredHuman}.`,
    `  Found: ${command} = ${probed.version} (${probed.cacheTag}), via ${originLabel}.`,
    `  Fix: export MPAK_PYTHON=$(which ${suggestBinary(required)})`,
    `  Or install: pyenv install ${suggestVersion(required)} | brew install python@${suggestVersion(required)} | uv python install ${suggestVersion(required)}`,
  ].join('\n');
}

function formatRangeMismatchMessage(
  command: string,
  source: ResolvedPython['source'],
  probed: { cacheTag: string; version: string },
  range: string,
): string {
  const originLabel =
    source === 'MPAK_PYTHON'
      ? 'MPAK_PYTHON'
      : source === 'manifest'
        ? 'manifest mcp_config.command'
        : "default 'python3'";
  return [
    `Bundle declares compatibility.runtimes.python: '${range}'.`,
    `  Found: ${command} = ${probed.version}, via ${originLabel}.`,
    `  Fix: install a satisfying Python and set MPAK_PYTHON to its path.`,
  ].join('\n');
}

function cpythonTagToHuman(tag: string): string {
  const m = /^cpython-(\d+)$/.exec(tag);
  if (!m) return tag;
  const digits = m[1]!;
  return `${digits[0]}.${digits.slice(1)}`;
}

function suggestVersion(required: RequiredAbi): string {
  if (required.abi3 && required.floor) {
    return `${required.floor.major}.${required.floor.minor}`;
  }
  return cpythonTagToHuman(required.tag);
}

function suggestBinary(required: RequiredAbi): string {
  return `python${suggestVersion(required)}`;
}
