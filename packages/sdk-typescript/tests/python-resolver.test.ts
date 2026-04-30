import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  abiMatches,
  findRequiredAbi,
  parseCpythonTag,
  PythonResolutionError,
  resolvePython,
  satisfiesPythonRange,
} from "../src/python-resolver.js";

describe("parseCpythonTag", () => {
  it("recognizes the canonical specific cpython tag", () => {
    expect(parseCpythonTag("rpds.cpython-313-darwin.so")).toEqual({
      tag: "cpython-313",
      abi3: false,
    });
  });

  it("recognizes a Linux extension with arch + libc in the platform tag", () => {
    expect(parseCpythonTag("_pydantic_core.cpython-311-x86_64-linux-gnu.so")).toEqual({
      tag: "cpython-311",
      abi3: false,
    });
  });

  it("recognizes Windows .pyd extensions", () => {
    expect(parseCpythonTag("rpds.cpython-313-win_amd64.pyd")).toEqual({
      tag: "cpython-313",
      abi3: false,
    });
  });

  it("recognizes abi3 with explicit floor", () => {
    expect(
      parseCpythonTag("_brotli.cpython-3.7-abi3-x86_64-linux-gnu.so"),
    ).toEqual({
      tag: "abi3",
      abi3: true,
      floor: { major: 3, minor: 7 },
    });
  });

  it("recognizes bare abi3 with implicit 3.7 floor", () => {
    expect(parseCpythonTag("_lib.abi3.so")).toEqual({
      tag: "abi3",
      abi3: true,
      floor: { major: 3, minor: 7 },
    });
  });

  it("returns null for non-extension files", () => {
    expect(parseCpythonTag("module.py")).toBeNull();
    expect(parseCpythonTag("README.md")).toBeNull();
  });
});

describe("findRequiredAbi", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "mpak-python-resolver-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns null when there is no deps/ directory (pure-Python bundle)", () => {
    expect(findRequiredAbi(testDir)).toBeNull();
  });

  it("returns null when deps/ has no compiled extensions", () => {
    mkdirSync(join(testDir, "deps", "pure_pkg"), { recursive: true });
    writeFileSync(join(testDir, "deps", "pure_pkg", "__init__.py"), "");
    expect(findRequiredAbi(testDir)).toBeNull();
  });

  it("finds the cpython tag of a vendored compiled extension", () => {
    mkdirSync(join(testDir, "deps", "rpds"), { recursive: true });
    writeFileSync(join(testDir, "deps", "rpds", "rpds.cpython-313-darwin.so"), "");
    expect(findRequiredAbi(testDir)).toEqual({ tag: "cpython-313", abi3: false });
  });

  it("prefers a specific cpython tag over an abi3 tag in the same bundle", () => {
    // A bundle that mixes a version-pinned extension (e.g. pydantic_core) with
    // an abi3-only extension is pinned by the version-specific one, since the
    // host interpreter has to satisfy both.
    mkdirSync(join(testDir, "deps", "a"), { recursive: true });
    mkdirSync(join(testDir, "deps", "b"), { recursive: true });
    writeFileSync(join(testDir, "deps", "a", "specific.cpython-313-darwin.so"), "");
    writeFileSync(join(testDir, "deps", "b", "stable.abi3.so"), "");
    expect(findRequiredAbi(testDir)).toEqual({ tag: "cpython-313", abi3: false });
  });

  it("returns abi3 when the bundle ships only stable-ABI extensions", () => {
    mkdirSync(join(testDir, "deps", "c"), { recursive: true });
    writeFileSync(join(testDir, "deps", "c", "stable.abi3.so"), "");
    expect(findRequiredAbi(testDir)).toEqual({
      tag: "abi3",
      abi3: true,
      floor: { major: 3, minor: 7 },
    });
  });
});

describe("abiMatches", () => {
  it("requires exact match for version-specific cpython tags", () => {
    expect(abiMatches("cpython-313", { tag: "cpython-313", abi3: false })).toBe(true);
    expect(abiMatches("cpython-311", { tag: "cpython-313", abi3: false })).toBe(false);
  });

  it("accepts any cpython >= floor for abi3", () => {
    const required = { tag: "abi3", abi3: true, floor: { major: 3, minor: 7 } };
    expect(abiMatches("cpython-313", required)).toBe(true);
    expect(abiMatches("cpython-37", required)).toBe(true);
    expect(abiMatches("cpython-36", required)).toBe(false);
  });

  it("rejects non-cpython probed tags", () => {
    expect(abiMatches("pypy3", { tag: "cpython-313", abi3: false })).toBe(false);
  });
});

describe("satisfiesPythonRange", () => {
  it("treats an unparseable range as 'no constraint' (don't crash the host)", () => {
    expect(satisfiesPythonRange("3.13.1", "")).toBe(true);
    expect(satisfiesPythonRange("3.13.1", "garbage")).toBe(true);
  });

  it("evaluates `>=` floors", () => {
    expect(satisfiesPythonRange("3.13.0", ">=3.10")).toBe(true);
    expect(satisfiesPythonRange("3.9.0", ">=3.10")).toBe(false);
  });

  it("evaluates compound ranges (AND)", () => {
    expect(satisfiesPythonRange("3.13.1", ">=3.10,<4.0")).toBe(true);
    expect(satisfiesPythonRange("4.0.0", ">=3.10,<4.0")).toBe(false);
  });

  it("treats `==3.13` as 'any 3.13.x' (major.minor exact)", () => {
    expect(satisfiesPythonRange("3.13.5", "==3.13")).toBe(true);
    expect(satisfiesPythonRange("3.12.0", "==3.13")).toBe(false);
  });
});

describe("resolvePython", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "mpak-python-resolver-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function probeOk(tag = "cpython-313", version = "3.13.0") {
    return () => ({ cacheTag: tag, version });
  }

  it("honors `mcp_config.command` verbatim — no silent rewrite (issue #90)", () => {
    const seen: string[] = [];
    const resolved = resolvePython({
      cacheDir: testDir,
      manifestCommand: "python",
      declaredRange: undefined,
      env: {},
      probe: (cmd) => {
        seen.push(cmd);
        return { cacheTag: "cpython-313", version: "3.13.0" };
      },
    });
    expect(seen).toEqual(["python"]); // no rewrite to 'python3'
    expect(resolved.command).toBe("python");
    expect(resolved.source).toBe("manifest");
  });

  it("prefers MPAK_PYTHON over the manifest command", () => {
    const resolved = resolvePython({
      cacheDir: testDir,
      manifestCommand: "python",
      declaredRange: undefined,
      env: { MPAK_PYTHON: "/opt/homebrew/bin/python3.13" },
      probe: probeOk(),
    });
    expect(resolved.command).toBe("/opt/homebrew/bin/python3.13");
    expect(resolved.source).toBe("MPAK_PYTHON");
  });

  it("falls back to `python3` when the manifest declares no command", () => {
    const resolved = resolvePython({
      cacheDir: testDir,
      manifestCommand: undefined,
      declaredRange: undefined,
      env: {},
      probe: probeOk(),
    });
    expect(resolved.command).toBe("python3");
    expect(resolved.source).toBe("default");
  });

  it("throws PythonResolutionError when the chosen interpreter cannot be probed", () => {
    expect(() =>
      resolvePython({
        cacheDir: testDir,
        manifestCommand: "python",
        declaredRange: undefined,
        env: {},
        probe: () => null,
      }),
    ).toThrow(PythonResolutionError);
  });

  it("throws an actionable ABI error when the bundle's compiled deps don't match", () => {
    // Bundle pins cpython-313 via a vendored .so file...
    mkdirSync(join(testDir, "deps", "rpds"), { recursive: true });
    writeFileSync(join(testDir, "deps", "rpds", "rpds.cpython-313-darwin.so"), "");

    // ...but the chosen interpreter is 3.11.
    let err: unknown;
    try {
      resolvePython({
        cacheDir: testDir,
        manifestCommand: "python3",
        declaredRange: undefined,
        env: {},
        probe: () => ({ cacheTag: "cpython-311", version: "3.11.9" }),
      });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PythonResolutionError);
    const msg = (err as Error).message;
    expect(msg).toContain("Bundle requires");
    expect(msg).toContain("cpython-313");
    expect(msg).toContain("3.11.9");
    expect(msg).toContain("MPAK_PYTHON"); // explicit override is the fix
  });

  it("throws when probed interpreter doesn't satisfy compatibility.runtimes.python", () => {
    expect(() =>
      resolvePython({
        cacheDir: testDir,
        manifestCommand: "python3",
        declaredRange: ">=3.13,<4.0",
        env: {},
        probe: () => ({ cacheTag: "cpython-311", version: "3.11.9" }),
      }),
    ).toThrow(/compatibility\.runtimes\.python/);
  });

  it("succeeds when ABI tag matches and range is satisfied", () => {
    mkdirSync(join(testDir, "deps", "rpds"), { recursive: true });
    writeFileSync(join(testDir, "deps", "rpds", "rpds.cpython-313-darwin.so"), "");

    const resolved = resolvePython({
      cacheDir: testDir,
      manifestCommand: "python3",
      declaredRange: ">=3.13",
      env: {},
      probe: () => ({ cacheTag: "cpython-313", version: "3.13.1" }),
    });
    expect(resolved.command).toBe("python3");
    expect(resolved.cacheTag).toBe("cpython-313");
    expect(resolved.version).toBe("3.13.1");
  });

  it("succeeds for pure-Python bundles regardless of interpreter ABI tag", () => {
    // No deps/ in cacheDir → no ABI requirement to check.
    const resolved = resolvePython({
      cacheDir: testDir,
      manifestCommand: "python3",
      declaredRange: ">=3.10",
      env: {},
      probe: () => ({ cacheTag: "cpython-311", version: "3.11.9" }),
    });
    expect(resolved.command).toBe("python3");
  });
});
