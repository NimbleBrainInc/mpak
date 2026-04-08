import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { listCachedBundles } from "./cache.js";

/**
 * Creates a fake cached bundle directory with manifest.json and .mpak-meta.json.
 */
function seedBundle(
  cacheBase: string,
  dirName: string,
  manifest: { name: string; version: string },
  meta: { version: string; pulledAt: string; platform: { os: string; arch: string } },
): void {
  const dir = join(cacheBase, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(dir, ".mpak-meta.json"), JSON.stringify(meta));
}

describe("listCachedBundles", () => {
  let tempCacheBase: string;
  let tempMpakHome: string;
  const originalMpakHome = process.env["MPAK_HOME"];

  beforeEach(() => {
    // Create a temp dir that acts as MPAK_HOME/cache/
    tempMpakHome = join(tmpdir(), `mpak-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    tempCacheBase = join(tempMpakHome, "cache");
    mkdirSync(tempCacheBase, { recursive: true });
    process.env["MPAK_HOME"] = tempMpakHome;
  });

  afterEach(() => {
    if (originalMpakHome !== undefined) {
      process.env["MPAK_HOME"] = originalMpakHome;
    } else {
      delete process.env["MPAK_HOME"];
    }
    rmSync(tempMpakHome, { recursive: true, force: true });
  });

  it("returns empty array when cache dir does not exist", () => {
    // Point MPAK_HOME to a dir with no cache/
    const emptyHome = join(tmpdir(), `mpak-empty-${Date.now()}`);
    mkdirSync(emptyHome, { recursive: true });
    process.env["MPAK_HOME"] = emptyHome;

    expect(listCachedBundles()).toEqual([]);

    rmSync(emptyHome, { recursive: true, force: true });
  });

  it("returns empty array when cache dir is empty", () => {
    expect(listCachedBundles()).toEqual([]);
  });

  it("returns cached bundles with correct metadata", () => {
    seedBundle(tempCacheBase, "nimblebraininc-echo", {
      name: "@nimblebraininc/echo",
      version: "1.0.0",
    }, {
      version: "1.0.0",
      pulledAt: "2025-02-16T00:00:00.000Z",
      platform: { os: "darwin", arch: "arm64" },
    });

    const result = listCachedBundles();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "@nimblebraininc/echo",
      version: "1.0.0",
      pulledAt: "2025-02-16T00:00:00.000Z",
      cacheDir: join(tempCacheBase, "nimblebraininc-echo"),
    });
  });

  it("returns multiple cached bundles", () => {
    seedBundle(tempCacheBase, "nimblebraininc-echo", {
      name: "@nimblebraininc/echo",
      version: "1.0.0",
    }, {
      version: "1.0.0",
      pulledAt: "2025-02-16T00:00:00.000Z",
      platform: { os: "darwin", arch: "arm64" },
    });

    seedBundle(tempCacheBase, "nimblebraininc-todoist", {
      name: "@nimblebraininc/todoist",
      version: "2.1.0",
    }, {
      version: "2.1.0",
      pulledAt: "2025-03-14T00:00:00.000Z",
      platform: { os: "darwin", arch: "arm64" },
    });

    const result = listCachedBundles();
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.name).sort()).toEqual([
      "@nimblebraininc/echo",
      "@nimblebraininc/todoist",
    ]);
  });

  it("skips _local directory", () => {
    // Create a _local dir with bundle-like contents
    const localDir = join(tempCacheBase, "_local");
    mkdirSync(localDir, { recursive: true });
    writeFileSync(join(localDir, "manifest.json"), JSON.stringify({ name: "local-dev" }));
    writeFileSync(join(localDir, ".mpak-meta.json"), JSON.stringify({ version: "0.0.1" }));

    seedBundle(tempCacheBase, "nimblebraininc-echo", {
      name: "@nimblebraininc/echo",
      version: "1.0.0",
    }, {
      version: "1.0.0",
      pulledAt: "2025-02-16T00:00:00.000Z",
      platform: { os: "darwin", arch: "arm64" },
    });

    const result = listCachedBundles();
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("@nimblebraininc/echo");
  });

  it("skips directories without .mpak-meta.json", () => {
    const dir = join(tempCacheBase, "no-meta");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ name: "@scope/no-meta" }));

    expect(listCachedBundles()).toEqual([]);
  });

  it("skips directories without manifest.json", () => {
    const dir = join(tempCacheBase, "no-manifest");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, ".mpak-meta.json"),
      JSON.stringify({ version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", platform: { os: "darwin", arch: "arm64" } }),
    );

    expect(listCachedBundles()).toEqual([]);
  });

  it("skips directories with corrupt manifest.json", () => {
    const dir = join(tempCacheBase, "corrupt");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), "not json{{{");
    writeFileSync(
      join(dir, ".mpak-meta.json"),
      JSON.stringify({ version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", platform: { os: "darwin", arch: "arm64" } }),
    );

    expect(listCachedBundles()).toEqual([]);
  });

  it("skips files in cache dir (only reads directories)", () => {
    writeFileSync(join(tempCacheBase, "stray-file.txt"), "hello");

    seedBundle(tempCacheBase, "nimblebraininc-echo", {
      name: "@nimblebraininc/echo",
      version: "1.0.0",
    }, {
      version: "1.0.0",
      pulledAt: "2025-02-16T00:00:00.000Z",
      platform: { os: "darwin", arch: "arm64" },
    });

    const result = listCachedBundles();
    expect(result).toHaveLength(1);
  });

  it("reads name from manifest.json, not directory name", () => {
    seedBundle(tempCacheBase, "weird-dir-name", {
      name: "@actual/package-name",
      version: "3.0.0",
    }, {
      version: "3.0.0",
      pulledAt: "2025-01-01T00:00:00.000Z",
      platform: { os: "linux", arch: "x64" },
    });

    const result = listCachedBundles();
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("@actual/package-name");
  });
});
