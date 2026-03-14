import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync } from "fs";
import {
  parsePackageSpec,
  getCacheDir,
  resolveArgs,
  resolveWorkspace,
  substituteUserConfig,
  substituteEnvVars,
  getLocalCacheDir,
  localBundleNeedsExtract,
  scanNativeExtensions,
  extractDepsRequirements,
  getPythonCpythonTag,
  installCompatibleDeps,
} from "./run.js";

describe("parsePackageSpec", () => {
  describe("scoped packages", () => {
    it("parses @scope/name without version", () => {
      expect(parsePackageSpec("@scope/name")).toEqual({
        name: "@scope/name",
      });
    });

    it("parses @scope/name@1.0.0", () => {
      expect(parsePackageSpec("@scope/name@1.0.0")).toEqual({
        name: "@scope/name",
        version: "1.0.0",
      });
    });

    it("parses prerelease versions @scope/name@1.0.0-beta.1", () => {
      expect(
        parsePackageSpec("@scope/name@1.0.0-beta.1"),
      ).toEqual({
        name: "@scope/name",
        version: "1.0.0-beta.1",
      });
    });

    it("parses version with build metadata @scope/name@1.0.0+build.123", () => {
      expect(
        parsePackageSpec("@scope/name@1.0.0+build.123"),
      ).toEqual({
        name: "@scope/name",
        version: "1.0.0+build.123",
      });
    });
  });

  describe("edge cases", () => {
    it("handles package name with multiple slashes @org/sub/name", () => {
      // This is technically invalid per npm spec, but we should handle gracefully
      const result = parsePackageSpec("@org/sub/name");
      expect(result.name).toBe("@org/sub/name");
    });

    it("handles unscoped package name", () => {
      expect(parsePackageSpec("simple-name")).toEqual({
        name: "simple-name",
      });
    });

    it("treats unscoped@version as invalid (mpak requires scoped packages)", () => {
      // mpak only supports scoped packages (@scope/name)
      // An unscoped name with @ is treated as the full name, not name@version
      expect(parsePackageSpec("unscoped@1.0.0")).toEqual({
        name: "unscoped@1.0.0",
      });
    });

    it("handles empty string", () => {
      expect(parsePackageSpec("")).toEqual({ name: "" });
    });

    it("handles @ only", () => {
      expect(parsePackageSpec("@")).toEqual({ name: "@" });
    });
  });
});

describe("getCacheDir", () => {
  const expectedBase = join(homedir(), ".mpak", "cache");

  it("converts @scope/name to scope-name", () => {
    expect(getCacheDir("@nimblebraininc/echo")).toBe(
      join(expectedBase, "nimblebraininc-echo"),
    );
  });

  it("handles simple scoped names", () => {
    expect(getCacheDir("@foo/bar")).toBe(
      join(expectedBase, "foo-bar"),
    );
  });

  it("handles unscoped names", () => {
    expect(getCacheDir("simple")).toBe(
      join(expectedBase, "simple"),
    );
  });
});

describe("resolveArgs", () => {
  const cacheDir = "/Users/test/.mpak/cache/scope-name";

  it("resolves ${__dirname} placeholder", () => {
    expect(
      resolveArgs(["${__dirname}/dist/index.js"], cacheDir),
    ).toEqual([`${cacheDir}/dist/index.js`]);
  });

  it("resolves multiple ${__dirname} in single arg", () => {
    expect(
      resolveArgs(
        ["--config=${__dirname}/config.json"],
        cacheDir,
      ),
    ).toEqual([`--config=${cacheDir}/config.json`]);
  });

  it("resolves ${__dirname} in multiple args", () => {
    expect(
      resolveArgs(
        [
          "${__dirname}/index.js",
          "--config",
          "${__dirname}/config.json",
        ],
        cacheDir,
      ),
    ).toEqual([
      `${cacheDir}/index.js`,
      "--config",
      `${cacheDir}/config.json`,
    ]);
  });

  it("leaves args without placeholders unchanged", () => {
    expect(
      resolveArgs(["-m", "mcp_echo.server"], cacheDir),
    ).toEqual(["-m", "mcp_echo.server"]);
  });

  it("handles empty args array", () => {
    expect(resolveArgs([], cacheDir)).toEqual([]);
  });

  it("handles Windows-style paths in cacheDir", () => {
    const winPath =
      "C:\\Users\\test\\.mpak\\cache\\scope-name";
    expect(
      resolveArgs(["${__dirname}\\dist\\index.js"], winPath),
    ).toEqual([`${winPath}\\dist\\index.js`]);
  });
});

describe("substituteUserConfig", () => {
  it("substitutes single user_config variable", () => {
    expect(
      substituteUserConfig("${user_config.api_key}", {
        api_key: "secret123",
      }),
    ).toBe("secret123");
  });

  it("substitutes multiple user_config variables", () => {
    expect(
      substituteUserConfig(
        "key=${user_config.key}&secret=${user_config.secret}",
        {
          key: "mykey",
          secret: "mysecret",
        },
      ),
    ).toBe("key=mykey&secret=mysecret");
  });

  it("leaves unmatched variables unchanged", () => {
    expect(
      substituteUserConfig("${user_config.missing}", {
        other: "value",
      }),
    ).toBe("${user_config.missing}");
  });

  it("handles mixed matched and unmatched variables", () => {
    expect(
      substituteUserConfig(
        "${user_config.found}-${user_config.missing}",
        {
          found: "yes",
        },
      ),
    ).toBe("yes-${user_config.missing}");
  });

  it("handles empty config values", () => {
    expect(
      substituteUserConfig("${user_config.empty}", {
        empty: "",
      }),
    ).toBe("");
  });

  it("handles values with special characters", () => {
    expect(
      substituteUserConfig("${user_config.key}", {
        key: "abc$def{ghi}",
      }),
    ).toBe("abc$def{ghi}");
  });

  it("leaves non-user_config placeholders unchanged", () => {
    expect(
      substituteUserConfig("${__dirname}/path", {
        dirname: "/cache",
      }),
    ).toBe("${__dirname}/path");
  });
});

describe("substituteEnvVars", () => {
  it("substitutes user_config in all env vars", () => {
    const env = {
      API_KEY: "${user_config.api_key}",
      DEBUG: "true",
      TOKEN: "${user_config.token}",
    };
    const values = { api_key: "key123", token: "tok456" };

    expect(substituteEnvVars(env, values)).toEqual({
      API_KEY: "key123",
      DEBUG: "true",
      TOKEN: "tok456",
    });
  });

  it("handles undefined env", () => {
    expect(
      substituteEnvVars(undefined, { key: "value" }),
    ).toEqual({});
  });

  it("handles empty env", () => {
    expect(substituteEnvVars({}, { key: "value" })).toEqual({});
  });

  it("preserves env vars without placeholders", () => {
    const env = { PATH: "/usr/bin", HOME: "/home/user" };
    expect(substituteEnvVars(env, {})).toEqual(env);
  });

  it("leaves unsubstituted placeholders as-is", () => {
    const env = {
      API_KEY: "${user_config.api_key}",
      DEBUG: "true",
    };
    // api_key not provided, so placeholder remains
    // (process.env will override this at merge time)
    expect(substituteEnvVars(env, {})).toEqual({
      API_KEY: "${user_config.api_key}",
      DEBUG: "true",
    });
  });
});

describe("getLocalCacheDir", () => {
  const expectedBase = join(
    homedir(),
    ".mpak",
    "cache",
    "_local",
  );

  it("returns consistent hash for same path", () => {
    const dir1 = getLocalCacheDir("/path/to/bundle.mcpb");
    const dir2 = getLocalCacheDir("/path/to/bundle.mcpb");
    expect(dir1).toBe(dir2);
  });

  it("returns different hash for different paths", () => {
    const dir1 = getLocalCacheDir("/path/to/bundle1.mcpb");
    const dir2 = getLocalCacheDir("/path/to/bundle2.mcpb");
    expect(dir1).not.toBe(dir2);
  });

  it("includes _local in path", () => {
    const dir = getLocalCacheDir("/path/to/bundle.mcpb");
    expect(dir).toContain("_local");
    expect(dir.startsWith(expectedBase)).toBe(true);
  });

  it("produces a 12-character hash suffix", () => {
    const dir = getLocalCacheDir("/path/to/bundle.mcpb");
    const hashPart = dir.split("/").pop();
    expect(hashPart).toHaveLength(12);
  });
});

describe("localBundleNeedsExtract", () => {
  it("returns true when cache directory does not exist", () => {
    expect(
      localBundleNeedsExtract(
        "/any/path.mcpb",
        "/nonexistent/cache",
      ),
    ).toBe(true);
  });

  it("returns true when meta file does not exist in cache dir", () => {
    // Using a directory that exists but has no .mpak-meta.json
    expect(
      localBundleNeedsExtract("/any/path.mcpb", "/tmp"),
    ).toBe(true);
  });
});

describe("resolveWorkspace", () => {
  it("defaults to $cwd/.mpak when no override", () => {
    expect(resolveWorkspace(undefined, "/home/user/project")).toBe(
      join("/home/user/project", ".mpak"),
    );
  });

  it("uses override when provided", () => {
    expect(
      resolveWorkspace("/data/custom", "/home/user/project"),
    ).toBe("/data/custom");
  });

  it("treats empty string as no override", () => {
    expect(resolveWorkspace("", "/home/user/project")).toBe(
      join("/home/user/project", ".mpak"),
    );
  });
});

describe("scanNativeExtensions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mpak-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null for nonexistent directory", () => {
    expect(scanNativeExtensions("/nonexistent/path")).toBeNull();
  });

  it("returns null for empty directory", () => {
    expect(scanNativeExtensions(tmpDir)).toBeNull();
  });

  it("returns null when no native extensions present", () => {
    mkdirSync(join(tmpDir, "pydantic"), { recursive: true });
    writeFileSync(join(tmpDir, "pydantic", "__init__.py"), "");
    expect(scanNativeExtensions(tmpDir)).toBeNull();
  });

  it("extracts cpython tag from .so files", () => {
    const subDir = join(tmpDir, "pydantic_core");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(
      join(subDir, "_pydantic_core.cpython-313-x86_64-linux-gnu.so"),
      "",
    );
    expect(scanNativeExtensions(tmpDir)).toBe("cpython313");
  });

  it("extracts cpython tag from .pyd files", () => {
    const subDir = join(tmpDir, "pydantic_core");
    mkdirSync(subDir, { recursive: true });
    writeFileSync(
      join(subDir, "_pydantic_core.cpython-312-win_amd64.pyd"),
      "",
    );
    expect(scanNativeExtensions(tmpDir)).toBe("cpython312");
  });

  it("returns tag from first match when multiple extensions exist", () => {
    const dir1 = join(tmpDir, "aaa_pkg");
    const dir2 = join(tmpDir, "zzz_pkg");
    mkdirSync(dir1, { recursive: true });
    mkdirSync(dir2, { recursive: true });
    writeFileSync(join(dir1, "mod.cpython-310-x86_64-linux-gnu.so"), "");
    writeFileSync(join(dir2, "mod.cpython-313-x86_64-linux-gnu.so"), "");
    const result = scanNativeExtensions(tmpDir);
    // Should return one of them (first found via recursive readdir)
    expect(result).toMatch(/^cpython3\d+$/);
  });
});

describe("extractDepsRequirements", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mpak-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for nonexistent directory", () => {
    expect(extractDepsRequirements("/nonexistent/path")).toEqual([]);
  });

  it("returns empty array when no dist-info directories exist", () => {
    mkdirSync(join(tmpDir, "pydantic"), { recursive: true });
    expect(extractDepsRequirements(tmpDir)).toEqual([]);
  });

  it("extracts name==version from dist-info directories", () => {
    mkdirSync(join(tmpDir, "pydantic_core-2.27.0.dist-info"), {
      recursive: true,
    });
    mkdirSync(join(tmpDir, "aiohttp-3.9.1.dist-info"), {
      recursive: true,
    });
    const reqs = extractDepsRequirements(tmpDir);
    expect(reqs).toContain("pydantic_core==2.27.0");
    expect(reqs).toContain("aiohttp==3.9.1");
    expect(reqs).toHaveLength(2);
  });

  it("handles versions with multiple dots", () => {
    mkdirSync(join(tmpDir, "cryptography-41.0.7.dist-info"), {
      recursive: true,
    });
    const reqs = extractDepsRequirements(tmpDir);
    expect(reqs).toContain("cryptography==41.0.7");
  });

  it("ignores non-dist-info directories", () => {
    mkdirSync(join(tmpDir, "pydantic"), { recursive: true });
    mkdirSync(join(tmpDir, "pydantic_core-2.27.0.dist-info"), {
      recursive: true,
    });
    const reqs = extractDepsRequirements(tmpDir);
    expect(reqs).toEqual(["pydantic_core==2.27.0"]);
  });
});

describe("getPythonCpythonTag", () => {
  // These tests use the real python on the system
  it("returns a valid cpython tag for real python", () => {
    // Try python3, fall back to python — skip if neither available
    const py3 = spawnSync("python3", ["--version"], { stdio: "pipe" });
    const cmd = py3.status === 0 ? "python3" : "python";

    const tag = getPythonCpythonTag(cmd);
    if (tag === null) {
      // No python available — skip
      return;
    }
    expect(tag).toMatch(/^cpython\d\d+$/);
  });

  it("returns null for nonexistent command", () => {
    expect(getPythonCpythonTag("nonexistent-python-xyz")).toBeNull();
  });
});

describe("installCompatibleDeps", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mpak-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when both uv and pip fail", () => {
    const targetDir = join(tmpDir, "deps");
    mkdirSync(targetDir, { recursive: true });

    expect(() =>
      installCompatibleDeps({
        requirements: ["nonexistent-package-xyz==99.99.99"],
        targetDir,
        pythonCmd: "nonexistent-python-xyz",
      }),
    ).toThrow("Both uv and pip failed");
  });
});
