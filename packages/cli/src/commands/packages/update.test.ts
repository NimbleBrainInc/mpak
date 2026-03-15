import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleUpdate } from "./update.js";

vi.mock("../../utils/cache.js", () => ({
  downloadAndExtract: vi.fn(),
}));

vi.mock("../../utils/client.js", () => ({
  createClient: vi.fn(() => ({ getBundle: vi.fn() })),
}));

vi.mock("./outdated.js", () => ({
  getOutdatedBundles: vi.fn(),
}));

import { downloadAndExtract } from "../../utils/cache.js";
import { getOutdatedBundles } from "./outdated.js";

const mockDownloadAndExtract = vi.mocked(downloadAndExtract);
const mockGetOutdatedBundles = vi.mocked(getOutdatedBundles);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

describe("handleUpdate", () => {
  describe("single bundle", () => {
    it("downloads and reports the updated version", async () => {
      mockDownloadAndExtract.mockResolvedValue({ cacheDir: "/cache/a", version: "2.0.0" });

      await handleUpdate("@scope/a", {});

      expect(mockDownloadAndExtract).toHaveBeenCalledTimes(1);
      expect(mockDownloadAndExtract.mock.calls[0]![0]).toBe("@scope/a");
      expect(console.log).toHaveBeenCalledWith("Updated @scope/a to 2.0.0");
    });

    it("outputs JSON when --json flag is set", async () => {
      mockDownloadAndExtract.mockResolvedValue({ cacheDir: "/cache/a", version: "2.0.0" });

      await handleUpdate("@scope/a", { json: true });

      expect(console.log).toHaveBeenCalledWith(
        JSON.stringify({ name: "@scope/a", version: "2.0.0" }, null, 2),
      );
    });

    it("does not call getOutdatedBundles", async () => {
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
      mockDownloadAndExtract
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ cacheDir: "/cache/b", version: "1.1.0" });

      await handleUpdate(undefined, {});

      expect(mockDownloadAndExtract).toHaveBeenCalledTimes(2);
      expect(process.stderr.write).toHaveBeenCalledWith(
        expect.stringContaining("Failed to update @scope/a"),
      );
      expect(console.log).toHaveBeenCalledWith("Updated @scope/b: 1.0.0 -> 1.1.0");
    });

    it("outputs JSON when --json flag is set", async () => {
      mockGetOutdatedBundles.mockResolvedValue([
        { name: "@scope/a", current: "1.0.0", latest: "2.0.0", pulledAt: "2025-01-01T00:00:00.000Z" },
      ]);
      mockDownloadAndExtract.mockResolvedValue({ cacheDir: "/cache/a", version: "2.0.0" });

      await handleUpdate(undefined, { json: true });

      expect(console.log).toHaveBeenCalledWith(
        JSON.stringify([{ name: "@scope/a", from: "1.0.0", to: "2.0.0" }], null, 2),
      );
    });

    it("outputs empty JSON array when nothing is outdated with --json", async () => {
      mockGetOutdatedBundles.mockResolvedValue([]);

      await handleUpdate(undefined, { json: true });

      expect(console.log).toHaveBeenCalledWith(JSON.stringify([], null, 2));
    });
  });
});
