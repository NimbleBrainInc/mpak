import { describe, it, expect } from "vitest";
import { MpakClient } from "@nimblebrain/mpak-sdk";

/**
 * Integration tests for the mpak registry via the SDK client.
 *
 * These tests hit the live registry.mpak.dev registry using the @nimblebraininc/echo
 * bundle as a known fixture. They verify the full flow from search to download.
 *
 * Run with: pnpm test -- tests/integration
 */
describe("MpakClient Integration", () => {
  const client = new MpakClient();
  const testBundle = "@nimblebraininc/echo";

  describe("searchBundles", () => {
    it('should find echo bundle when searching for "echo"', async () => {
      const result = await client.searchBundles({ q: "echo" });

      expect(result.bundles).toBeDefined();
      expect(result.bundles.length).toBeGreaterThan(0);

      const echoBundle = result.bundles.find(
        (b) => b.name === testBundle,
      );
      expect(echoBundle).toBeDefined();
      expect(echoBundle?.description).toContain("Echo");
    }, 15000); // Allow extra time for API cold start

    it("should return empty results for nonsense query", async () => {
      const result = await client.searchBundles({
        q: "xyznonexistent12345",
      });

      expect(result.bundles).toBeDefined();
      expect(result.bundles.length).toBe(0);
    });

    it("should respect limit parameter", async () => {
      const result = await client.searchBundles({
        q: "",
        limit: 1,
      });

      expect(result.bundles.length).toBeLessThanOrEqual(1);
    });
  });

  describe("getBundle", () => {
    it("should return bundle details for @nimblebraininc/echo", async () => {
      const bundle = await client.getBundle(testBundle);

      expect(bundle.name).toBe(testBundle);
      expect(bundle.description).toBeDefined();
      expect(bundle.server_type).toBe("python");
      expect(bundle.author).toBeDefined();
      expect(bundle.latest_version).toBeDefined();
    });

    it("should include provenance information", async () => {
      const bundle = await client.getBundle(testBundle);

      expect(bundle.provenance).toBeDefined();
      expect(bundle.provenance?.provider).toBe(
        "github_oidc",
      );
      expect(bundle.provenance?.repository).toContain(
        "mcp-echo",
      );
    });

    it("should throw error for non-existent bundle", async () => {
      await expect(
        client.getBundle("@nonexistent/bundle-xyz"),
      ).rejects.toThrow();
    });

    it("should throw error for unscoped package name", async () => {
      await expect(
        client.getBundle("unscoped-name"),
      ).rejects.toThrow("Package name must be scoped");
    });
  });

  describe("getBundleVersions", () => {
    it("should return version list with platforms", async () => {
      const result =
        await client.getBundleVersions(testBundle);

      expect(result.versions).toBeDefined();
      expect(result.versions.length).toBeGreaterThan(0);

      const latestVersion = result.versions[0];
      expect(latestVersion.version).toBeDefined();
      expect(latestVersion.platforms).toBeDefined();
      expect(
        latestVersion.platforms.length,
      ).toBeGreaterThan(0);
    });

    it("should include linux platforms for echo bundle", async () => {
      const result =
        await client.getBundleVersions(testBundle);

      const latestVersion = result.versions[0];
      const platforms = latestVersion.platforms.map(
        (p) => `${p.os}-${p.arch}`,
      );

      expect(platforms).toContain("linux-x64");
      expect(platforms).toContain("linux-arm64");
    });
  });

  describe("getBundleDownload", () => {
    it("should return download URL for a version", async () => {
      const versions =
        await client.getBundleVersions(testBundle);
      const version = versions.versions[0].version;

      const info = await client.getBundleDownload(
        testBundle,
        version,
        {
          os: "linux",
          arch: "x64",
        },
      );

      expect(info.url).toBeDefined();
      expect(info.url).toMatch(/^https?:\/\//);
      expect(info.bundle.version).toBeDefined();
      expect(info.bundle.platform).toBeDefined();
      expect(info.bundle.size).toBeGreaterThan(0);
      expect(info.bundle.sha256).toBeDefined();
    });

    it("should return correct artifact for requested platform", async () => {
      const versions =
        await client.getBundleVersions(testBundle);
      const version = versions.versions[0].version;

      const info = await client.getBundleDownload(
        testBundle,
        version,
        {
          os: "linux",
          arch: "arm64",
        },
      );

      expect(info.bundle.platform.os).toBe("linux");
      expect(info.bundle.platform.arch).toBe("arm64");
    });
  });

  describe("detectPlatform", () => {
    it("should return valid platform object", () => {
      const platform = MpakClient.detectPlatform();

      expect(platform.os).toBeDefined();
      expect(platform.arch).toBeDefined();
      expect(["darwin", "linux", "win32", "any"]).toContain(
        platform.os,
      );
      expect(["x64", "arm64", "any"]).toContain(
        platform.arch,
      );
    });
  });
});
