import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOutdatedBundles } from "./outdated.js";

vi.mock("../../utils/cache.js", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  listCachedBundles: vi.fn(),
}));

vi.mock("../../utils/client.js", () => ({
  createClient: vi.fn(),
}));

import { listCachedBundles } from "../../utils/cache.js";
import { createClient } from "../../utils/client.js";

const mockListCachedBundles = vi.mocked(listCachedBundles);
const mockCreateClient = vi.mocked(createClient);

function makeMockClient(registry: Record<string, string>) {
  return {
    getBundle: vi.fn(async (name: string) => {
      const version = registry[name];
      if (!version) throw new Error(`Not found: ${name}`);
      return { latest_version: version };
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOutdatedBundles", () => {
  it("returns empty array when no bundles are cached", async () => {
    mockListCachedBundles.mockReturnValue([]);

    const result = await getOutdatedBundles();
    expect(result).toEqual([]);
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns empty array when all bundles are up to date", async () => {
    mockListCachedBundles.mockReturnValue([
      { name: "@scope/a", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/a" },
      { name: "@scope/b", version: "2.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/b" },
    ]);
    mockCreateClient.mockReturnValue(makeMockClient({
      "@scope/a": "1.0.0",
      "@scope/b": "2.0.0",
    }) as never);

    const result = await getOutdatedBundles();
    expect(result).toEqual([]);
  });

  it("returns outdated bundles with current and latest versions", async () => {
    mockListCachedBundles.mockReturnValue([
      { name: "@scope/a", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/a" },
      { name: "@scope/b", version: "2.0.0", pulledAt: "2025-02-01T00:00:00.000Z", cacheDir: "/cache/b" },
    ]);
    mockCreateClient.mockReturnValue(makeMockClient({
      "@scope/a": "1.1.0",
      "@scope/b": "2.0.0",
    }) as never);

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
    mockListCachedBundles.mockReturnValue([
      { name: "@scope/zebra", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/z" },
      { name: "@scope/alpha", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/a" },
    ]);
    mockCreateClient.mockReturnValue(makeMockClient({
      "@scope/zebra": "2.0.0",
      "@scope/alpha": "1.1.0",
    }) as never);

    const result = await getOutdatedBundles();
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("@scope/alpha");
    expect(result[1]!.name).toBe("@scope/zebra");
  });

  it("skips bundles that fail to resolve from registry", async () => {
    mockListCachedBundles.mockReturnValue([
      { name: "@scope/exists", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/e" },
      { name: "@scope/deleted", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/d" },
    ]);
    mockCreateClient.mockReturnValue(makeMockClient({
      "@scope/exists": "2.0.0",
      // @scope/deleted not in registry — getBundle will throw
    }) as never);

    const result = await getOutdatedBundles();
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("@scope/exists");
  });

  it("checks all bundles in parallel", async () => {
    const getBundle = vi.fn(async (name: string) => {
      return { latest_version: name === "@scope/a" ? "2.0.0" : "1.0.0" };
    });
    mockListCachedBundles.mockReturnValue([
      { name: "@scope/a", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/a" },
      { name: "@scope/b", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/b" },
    ]);
    mockCreateClient.mockReturnValue({ getBundle } as never);

    await getOutdatedBundles();
    expect(getBundle).toHaveBeenCalledTimes(2);
    expect(getBundle).toHaveBeenCalledWith("@scope/a");
    expect(getBundle).toHaveBeenCalledWith("@scope/b");
  });
});
