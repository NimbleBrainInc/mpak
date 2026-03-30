import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MpakBundleCache, type MpakClient } from "@nimblebrain/mpak-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOutdatedBundles } from "../../src/commands/packages/outdated.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validManifest = (name: string, version: string) => ({
  manifest_version: "0.3",
  name,
  version,
  description: "Test bundle",
  server: {
    type: "node" as const,
    entry_point: "index.js",
    mcp_config: { command: "node", args: ["${__dirname}/index.js"] },
  },
});

const validMetadata = (version: string) => ({
  version,
  pulledAt: "2025-01-01T00:00:00.000Z",
  platform: { os: "darwin", arch: "arm64" },
});

function seedCacheEntry(
  mpakHome: string,
  dirName: string,
  opts: { manifest?: object; metadata?: object },
) {
  const dir = join(mpakHome, "cache", dirName);
  mkdirSync(dir, { recursive: true });
  if (opts.manifest) {
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(opts.manifest));
  }
  if (opts.metadata) {
    writeFileSync(join(dir, ".mpak-meta.json"), JSON.stringify(opts.metadata));
  }
}

function mockClient(registry: Record<string, string>): MpakClient {
  return {
    getBundle: vi.fn(async (name: string) => {
      const version = registry[name];
      if (!version) throw new Error(`Not found: ${name}`);
      return { latest_version: version };
    }),
  } as unknown as MpakClient;
}

// ---------------------------------------------------------------------------
// Mock the mpak singleton — replaced per-test via `currentCache`
// ---------------------------------------------------------------------------

let currentCache: MpakBundleCache;

vi.mock("../../src/utils/config.js", () => ({
  get mpak() {
    return { bundleCache: currentCache };
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getOutdatedBundles", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "mpak-outdated-test-"));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns empty array when no bundles are cached", async () => {
    currentCache = new MpakBundleCache(mockClient({}), { mpakHome: testDir });

    expect(await getOutdatedBundles()).toEqual([]);
  });

  it("returns empty array when all bundles are up to date", async () => {
    seedCacheEntry(testDir, "scope-a", {
      manifest: validManifest("@scope/a", "1.0.0"),
      metadata: validMetadata("1.0.0"),
    });
    seedCacheEntry(testDir, "scope-b", {
      manifest: validManifest("@scope/b", "2.0.0"),
      metadata: validMetadata("2.0.0"),
    });
    currentCache = new MpakBundleCache(
      mockClient({ "@scope/a": "1.0.0", "@scope/b": "2.0.0" }),
      { mpakHome: testDir },
    );

    expect(await getOutdatedBundles()).toEqual([]);
  });

  it("returns outdated bundles with current and latest versions", async () => {
    seedCacheEntry(testDir, "scope-a", {
      manifest: validManifest("@scope/a", "1.0.0"),
      metadata: validMetadata("1.0.0"),
    });
    seedCacheEntry(testDir, "scope-b", {
      manifest: validManifest("@scope/b", "2.0.0"),
      metadata: validMetadata("2.0.0"),
    });
    currentCache = new MpakBundleCache(
      mockClient({ "@scope/a": "1.1.0", "@scope/b": "2.0.0" }),
      { mpakHome: testDir },
    );

    const result = await getOutdatedBundles();
    expect(result).toEqual([
      {
        name: "@scope/a",
        current: "1.0.0",
        latest: "1.1.0",
        pulledAt: "2025-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("returns multiple outdated bundles sorted by name", async () => {
    seedCacheEntry(testDir, "scope-zebra", {
      manifest: validManifest("@scope/zebra", "1.0.0"),
      metadata: validMetadata("1.0.0"),
    });
    seedCacheEntry(testDir, "scope-alpha", {
      manifest: validManifest("@scope/alpha", "1.0.0"),
      metadata: validMetadata("1.0.0"),
    });
    currentCache = new MpakBundleCache(
      mockClient({ "@scope/zebra": "2.0.0", "@scope/alpha": "1.1.0" }),
      { mpakHome: testDir },
    );

    const result = await getOutdatedBundles();
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("@scope/alpha");
    expect(result[1]!.name).toBe("@scope/zebra");
  });

  it("skips bundles that fail to resolve from registry", async () => {
    seedCacheEntry(testDir, "scope-exists", {
      manifest: validManifest("@scope/exists", "1.0.0"),
      metadata: validMetadata("1.0.0"),
    });
    seedCacheEntry(testDir, "scope-deleted", {
      manifest: validManifest("@scope/deleted", "1.0.0"),
      metadata: validMetadata("1.0.0"),
    });
    currentCache = new MpakBundleCache(
      mockClient({ "@scope/exists": "2.0.0" }), // @scope/deleted not in registry
      { mpakHome: testDir },
    );

    const result = await getOutdatedBundles();
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("@scope/exists");
  });

  it("ignores TTL and always checks the registry", async () => {
    seedCacheEntry(testDir, "scope-a", {
      manifest: validManifest("@scope/a", "1.0.0"),
      metadata: {
        ...validMetadata("1.0.0"),
        lastCheckedAt: new Date().toISOString(), // just checked
      },
    });
    const client = mockClient({ "@scope/a": "2.0.0" });
    currentCache = new MpakBundleCache(client, { mpakHome: testDir });

    const result = await getOutdatedBundles();
    expect(result).toHaveLength(1);
    expect(result[0]!.latest).toBe("2.0.0");
    expect(client.getBundle).toHaveBeenCalledWith("@scope/a");
  });
});
