import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleUpdate } from "./update.js";

vi.mock("../../utils/cache.js", () => ({
  resolveBundle: vi.fn(),
  downloadAndExtract: vi.fn(),
}));

vi.mock("../../utils/client.js", () => ({
  createClient: vi.fn(() => ({ getBundle: vi.fn() })),
}));

vi.mock("./outdated.js", () => ({
  getOutdatedBundles: vi.fn(),
}));

import { resolveBundle, downloadAndExtract } from "../../utils/cache.js";
import { getOutdatedBundles } from "./outdated.js";

const mockResolveBundle = vi.mocked(resolveBundle);
const mockDownloadAndExtract = vi.mocked(downloadAndExtract);
const mockGetOutdatedBundles = vi.mocked(getOutdatedBundles);

const fakeDownloadInfo = {
  url: "https://example.com/bundle.mcpb",
  bundle: { version: "2.0.0", platform: { os: "darwin", arch: "arm64" } },
};

const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

describe("handleUpdate", () => {
  describe("single bundle", () => {
    it("resolves then downloads and reports the updated version", async () => {
      mockResolveBundle.mockResolvedValue(fakeDownloadInfo);
      mockDownloadAndExtract.mockResolvedValue({ cacheDir: "/cache/a", version: "2.0.0" });

      await handleUpdate("@scope/a", {});

      expect(mockResolveBundle).toHaveBeenCalledTimes(1);
      expect(mockResolveBundle.mock.calls[0]![0]).toBe("@scope/a");
      expect(mockDownloadAndExtract).toHaveBeenCalledWith("@scope/a", fakeDownloadInfo);
      expect(console.log).toHaveBeenCalledWith("Updated @scope/a to 2.0.0");
    });

    it("outputs JSON when --json flag is set", async () => {
      mockResolveBundle.mockResolvedValue(fakeDownloadInfo);
      mockDownloadAndExtract.mockResolvedValue({ cacheDir: "/cache/a", version: "2.0.0" });

      await handleUpdate("@scope/a", { json: true });

      expect(console.log).toHaveBeenCalledWith(
        JSON.stringify({ name: "@scope/a", version: "2.0.0" }, null, 2),
      );
    });

    it("does not call getOutdatedBundles", async () => {
      mockResolveBundle.mockResolvedValue(fakeDownloadInfo);
      mockDownloadAndExtract.mockResolvedValue({ cacheDir: "/cache/a", version: "2.0.0" });

      await handleUpdate("@scope/a", {});

      expect(mockGetOutdatedBundles).not.toHaveBeenCalled();
    });
  });

  describe("update all", () => {
    it("reports all up to date when nothing is outdated", async () => {
      mockGetOutdatedBundles.mockResolvedValue([]);

      await handleUpdate(undefined, {});

      expect(console.log).toHaveBeenCalledWith("All cached bundles are up to date.");
      expect(mockDownloadAndExtract).not.toHaveBeenCalled();
    });

    it("updates all outdated bundles", async () => {
      mockGetOutdatedBundles.mockResolvedValue([
        { name: "@scope/a", current: "1.0.0", latest: "2.0.0", pulledAt: "2025-01-01T00:00:00.000Z" },
        { name: "@scope/b", current: "1.0.0", latest: "1.1.0", pulledAt: "2025-01-01T00:00:00.000Z" },
      ]);
      const infoA = { ...fakeDownloadInfo, bundle: { ...fakeDownloadInfo.bundle, version: "2.0.0" } };
      const infoB = { ...fakeDownloadInfo, bundle: { ...fakeDownloadInfo.bundle, version: "1.1.0" } };
      mockResolveBundle
        .mockResolvedValueOnce(infoA)
        .mockResolvedValueOnce(infoB);
      mockDownloadAndExtract
        .mockResolvedValueOnce({ cacheDir: "/cache/a", version: "2.0.0" })
        .mockResolvedValueOnce({ cacheDir: "/cache/b", version: "1.1.0" });

      await handleUpdate(undefined, {});

      expect(mockDownloadAndExtract).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith("Updated @scope/a: 1.0.0 -> 2.0.0");
      expect(console.log).toHaveBeenCalledWith("Updated @scope/b: 1.0.0 -> 1.1.0");
    });

    it("continues updating when one bundle fails", async () => {
      mockGetOutdatedBundles.mockResolvedValue([
        { name: "@scope/a", current: "1.0.0", latest: "2.0.0", pulledAt: "2025-01-01T00:00:00.000Z" },
        { name: "@scope/b", current: "1.0.0", latest: "1.1.0", pulledAt: "2025-01-01T00:00:00.000Z" },
      ]);
      mockResolveBundle
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(fakeDownloadInfo);
      mockDownloadAndExtract
        .mockResolvedValueOnce({ cacheDir: "/cache/b", version: "1.1.0" });

      await handleUpdate(undefined, {});

      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update @scope/a"),
      );
      expect(console.log).toHaveBeenCalledWith("Updated @scope/b: 1.0.0 -> 1.1.0");
    });

    it("outputs JSON when --json flag is set", async () => {
      mockGetOutdatedBundles.mockResolvedValue([
        { name: "@scope/a", current: "1.0.0", latest: "2.0.0", pulledAt: "2025-01-01T00:00:00.000Z" },
      ]);
      mockResolveBundle.mockResolvedValue(fakeDownloadInfo);
      mockDownloadAndExtract.mockResolvedValue({ cacheDir: "/cache/a", version: "2.0.0" });

      await handleUpdate(undefined, { json: true });

      expect(console.log).toHaveBeenCalledWith(
        JSON.stringify([{ name: "@scope/a", from: "1.0.0", to: "2.0.0" }], null, 2),
      );
    });

    it("exits non-zero when all updates fail", async () => {
      mockGetOutdatedBundles.mockResolvedValue([
        { name: "@scope/a", current: "1.0.0", latest: "2.0.0", pulledAt: "2025-01-01T00:00:00.000Z" },
      ]);
      mockResolveBundle.mockRejectedValueOnce(new Error("Network error"));

      await handleUpdate(undefined, {});

      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update @scope/a"),
      );
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it("outputs empty JSON array when nothing is outdated with --json", async () => {
      mockGetOutdatedBundles.mockResolvedValue([]);

      await handleUpdate(undefined, { json: true });

      expect(console.log).toHaveBeenCalledWith(JSON.stringify([], null, 2));
    });
  });
});
