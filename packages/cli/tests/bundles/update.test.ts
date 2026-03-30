import { MpakNetworkError, MpakNotFoundError } from "@nimblebrain/mpak-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleUpdate } from "../../src/commands/packages/update.js";

// ---------------------------------------------------------------------------
// Mock the mpak singleton
// ---------------------------------------------------------------------------

const mockLoadBundle = vi.fn();
const mockListCachedBundles = vi.fn();
const mockCheckForUpdate = vi.fn();

vi.mock("../../src/utils/config.js", () => ({
  get mpak() {
    return {
      bundleCache: {
        loadBundle: mockLoadBundle,
        listCachedBundles: mockListCachedBundles,
        checkForUpdate: mockCheckForUpdate,
      },
    };
  },
}));

// ---------------------------------------------------------------------------
// Capture stdout/stderr
// ---------------------------------------------------------------------------

let stdout: string;
let stderr: string;

beforeEach(() => {
  stdout = "";
  stderr = "";
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdout += args.join(" ") + "\n";
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderr += args.join(" ") + "\n";
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  });
  vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process.exit called");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ===========================================================================
// Single bundle update
// ===========================================================================

describe("handleUpdate — single bundle", () => {
  it("updates a single bundle and prints result", async () => {
    mockLoadBundle.mockResolvedValue({ cacheDir: "/cache/scope-a", version: "2.0.0", pulled: true });

    await handleUpdate("@scope/a");

    expect(mockLoadBundle).toHaveBeenCalledWith("@scope/a", { force: true });
    expect(stdout).toContain("Updated @scope/a to 2.0.0");
  });

  it("outputs JSON when --json is set", async () => {
    mockLoadBundle.mockResolvedValue({ cacheDir: "/cache/scope-a", version: "2.0.0", pulled: true });

    await handleUpdate("@scope/a", { json: true });

    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({ name: "@scope/a", version: "2.0.0" });
  });

  it("throws user-friendly error when bundle is not found", async () => {
    mockLoadBundle.mockRejectedValue(new MpakNotFoundError("@scope/missing@latest"));

    await expect(handleUpdate("@scope/missing")).rejects.toThrow(
      'Bundle "@scope/missing" not found in the registry',
    );
  });

  it("throws user-friendly error on network failure", async () => {
    mockLoadBundle.mockRejectedValue(new MpakNetworkError("connection refused"));

    await expect(handleUpdate("@scope/a")).rejects.toThrow(
      'Network error updating "@scope/a": connection refused',
    );
  });

  it("lets unexpected errors propagate as-is", async () => {
    mockLoadBundle.mockRejectedValue(new Error("something unexpected"));

    await expect(handleUpdate("@scope/a")).rejects.toThrow("something unexpected");
  });
});

// ===========================================================================
// Bulk update (no package name)
// ===========================================================================

describe("handleUpdate — bulk update", () => {
  it("prints up-to-date message when nothing is outdated", async () => {
    mockListCachedBundles.mockReturnValue([]);

    await handleUpdate(undefined);

    expect(stdout).toContain("All cached bundles are up to date.");
  });

  it("outputs empty JSON array when nothing is outdated and --json is set", async () => {
    mockListCachedBundles.mockReturnValue([]);

    await handleUpdate(undefined, { json: true });

    expect(JSON.parse(stdout)).toEqual([]);
  });

  it("updates all outdated bundles", async () => {
    mockListCachedBundles.mockReturnValue([
      { name: "@scope/a", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/a" },
      { name: "@scope/b", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/b" },
    ]);
    mockCheckForUpdate.mockImplementation(async (name: string) => {
      return name === "@scope/a" ? "2.0.0" : "3.0.0";
    });
    mockLoadBundle.mockImplementation(async (name: string) => {
      const versions: Record<string, string> = { "@scope/a": "2.0.0", "@scope/b": "3.0.0" };
      return { cacheDir: `/cache/${name}`, version: versions[name], pulled: true };
    });

    await handleUpdate(undefined);

    expect(mockLoadBundle).toHaveBeenCalledWith("@scope/a", { force: true });
    expect(mockLoadBundle).toHaveBeenCalledWith("@scope/b", { force: true });
    expect(stdout).toContain("Updated @scope/a: 1.0.0 -> 2.0.0");
    expect(stdout).toContain("Updated @scope/b: 1.0.0 -> 3.0.0");
  });

  it("continues updating when some bundles fail", async () => {
    mockListCachedBundles.mockReturnValue([
      { name: "@scope/good", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/good" },
      { name: "@scope/bad", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/bad" },
    ]);
    mockCheckForUpdate.mockImplementation(async () => "2.0.0");
    mockLoadBundle.mockImplementation(async (name: string) => {
      if (name === "@scope/bad") throw new MpakNotFoundError("@scope/bad@latest");
      return { cacheDir: "/cache/good", version: "2.0.0", pulled: true };
    });

    await handleUpdate(undefined);

    expect(stdout).toContain("Updated @scope/good: 1.0.0 -> 2.0.0");
    expect(stderr).toContain("Failed to update @scope/bad");
  });

  it("exits with error when all bulk updates fail", async () => {
    mockListCachedBundles.mockReturnValue([
      { name: "@scope/a", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/a" },
    ]);
    mockCheckForUpdate.mockResolvedValue("2.0.0");
    mockLoadBundle.mockRejectedValue(new MpakNetworkError("timeout"));

    await expect(handleUpdate(undefined)).rejects.toThrow("process.exit called");

    expect(stderr).toContain("Failed to update @scope/a");
    expect(stderr).toContain("All updates failed");
  });

  it("outputs JSON for bulk update with --json", async () => {
    mockListCachedBundles.mockReturnValue([
      { name: "@scope/a", version: "1.0.0", pulledAt: "2025-01-01T00:00:00.000Z", cacheDir: "/cache/a" },
    ]);
    mockCheckForUpdate.mockResolvedValue("2.0.0");
    mockLoadBundle.mockResolvedValue({ cacheDir: "/cache/a", version: "2.0.0", pulled: true });

    await handleUpdate(undefined, { json: true });

    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual([{ name: "@scope/a", from: "1.0.0", to: "2.0.0" }]);
  });
});
