/**
 * Integration tests for MpakClient
 *
 * These tests hit the actual mpak.dev API. Run with:
 *   pnpm test:integration
 *
 * Note: These tests depend on data in the production registry.
 * If bundles are removed, tests may need updating.
 */

import { createHash } from "crypto";
import { mkdtemp, rm, readFile, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import JSZip from "jszip";
import { describe, it, expect } from "vitest";
import { MpakClient } from "../src/client.js";
import { MpakNotFoundError } from "../src/errors.js";

// Known bundle that exists in the registry
const KNOWN_BUNDLE = "@nimblebraininc/echo";

describe("MpakClient Integration Tests", () => {
  const client = new MpakClient();

  describe("Bundle API", () => {
    it("searches bundles", async () => {
      const result = await client.searchBundles({ limit: 5 });

      expect(result.bundles).toBeInstanceOf(Array);
      expect(result.bundles.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.limit).toBe(5);
    });

    it("searches bundles with query", async () => {
      const result = await client.searchBundles({ q: "echo" });

      expect(result.bundles).toBeInstanceOf(Array);
      // Should find the echo bundle
      const echoBundle = result.bundles.find((b) => b.name.includes("echo"));
      expect(echoBundle).toBeDefined();
    });

    it("gets bundle details", async () => {
      const bundle = await client.getBundle(KNOWN_BUNDLE);

      expect(bundle.name).toBe(KNOWN_BUNDLE);
      expect(bundle.latest_version).toBeDefined();
      expect(bundle.versions).toBeInstanceOf(Array);
      expect(bundle.versions.length).toBeGreaterThan(0);
    });

    it("gets bundle versions", async () => {
      const versions = await client.getBundleVersions(KNOWN_BUNDLE);

      expect(versions.name).toBe(KNOWN_BUNDLE);
      expect(versions.latest).toBeDefined();
      expect(versions.versions).toBeInstanceOf(Array);
      expect(versions.versions.length).toBeGreaterThan(0);

      // Each version should have required fields
      const firstVersion = versions.versions[0];
      expect(firstVersion?.version).toBeDefined();
      expect(firstVersion?.platforms).toBeInstanceOf(Array);
    });

    it("gets specific bundle version", async () => {
      // First get the versions to find a valid version number
      const versions = await client.getBundleVersions(KNOWN_BUNDLE);
      const latestVersion = versions.latest;

      const versionInfo = await client.getBundleVersion(
        KNOWN_BUNDLE,
        latestVersion,
      );

      expect(versionInfo.name).toBe(KNOWN_BUNDLE);
      expect(versionInfo.version).toBe(latestVersion);
      expect(versionInfo.artifacts).toBeInstanceOf(Array);
      expect(versionInfo.manifest).toBeDefined();
    });

    it("gets bundle download info", async () => {
      // First get the versions to find a valid version number
      const versions = await client.getBundleVersions(KNOWN_BUNDLE);
      const latestVersion = versions.latest;

      const download = await client.getBundleDownload(
        KNOWN_BUNDLE,
        latestVersion,
      );

      expect(download.url).toBeDefined();
      expect(download.url).toContain("http");
      expect(download.bundle).toBeDefined();
      expect(download.bundle.sha256).toBeDefined();
      expect(download.bundle.size).toBeGreaterThan(0);
    });

    it("downloads bundle, verifies SHA256, and extracts manifest", async () => {
      const platform = MpakClient.detectPlatform();
      const download = await client.getBundleDownload(
        KNOWN_BUNDLE,
        "latest",
        platform,
      );

      // Download the actual .mcpb file from CDN
      const response = await fetch(download.url);
      expect(response.ok).toBe(true);

      const buffer = await response.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);

      // Verify SHA256 integrity
      const hash = createHash("sha256")
        .update(Buffer.from(buffer))
        .digest("hex");
      expect(hash).toBe(download.bundle.sha256);

      // Extract and verify manifest
      const zip = await JSZip.loadAsync(buffer);
      const manifestFile = zip.file("manifest.json");
      expect(manifestFile).not.toBeNull();

      const manifestText = await manifestFile!.async("string");
      const manifest = JSON.parse(manifestText);
      expect(manifest.name).toBe(KNOWN_BUNDLE);
      expect(manifest.version).toBeDefined();
      expect(manifest.server).toBeDefined();
    });

    it("throws MpakNotFoundError for nonexistent bundle", async () => {
      await expect(
        client.getBundle("@nonexistent/bundle-that-does-not-exist"),
      ).rejects.toThrow(MpakNotFoundError);
    });
  });

  describe("Skill API", () => {
    it("searches skills", async () => {
      const result = await client.searchSkills({ limit: 5 });

      expect(result.skills).toBeInstanceOf(Array);
      expect(result.pagination).toBeDefined();
      // Note: There may be no skills yet, so we just check the response structure
    });

    it("searches skills with filters", async () => {
      const result = await client.searchSkills({
        surface: "claude-code",
        limit: 10,
      });

      expect(result.skills).toBeInstanceOf(Array);
      expect(result.pagination).toBeDefined();
    });

    it("throws MpakNotFoundError for nonexistent skill", async () => {
      await expect(
        client.getSkill("@nonexistent/skill-that-does-not-exist"),
      ).rejects.toThrow(MpakNotFoundError);
    });
  });

  describe("Platform detection", () => {
    it("detects current platform", () => {
      const platform = MpakClient.detectPlatform();

      expect(platform.os).toBeDefined();
      expect(platform.arch).toBeDefined();
      expect(["darwin", "linux", "win32", "any"]).toContain(platform.os);
      expect(["x64", "arm64", "any"]).toContain(platform.arch);
    });

    it("can request bundle for current platform", async () => {
      const versions = await client.getBundleVersions(KNOWN_BUNDLE);
      const latestVersion = versions.latest;
      const platform = MpakClient.detectPlatform();

      // This should not throw even if the platform-specific artifact doesn't exist
      // (it falls back to 'any')
      const download = await client.getBundleDownload(
        KNOWN_BUNDLE,
        latestVersion,
        platform,
      );

      expect(download.url).toBeDefined();
    });
  });

  describe("Error handling", () => {
    it("handles timeout gracefully", async () => {
      const shortTimeoutClient = new MpakClient({ timeout: 1 });

      // With a 1ms timeout, this should fail
      await expect(shortTimeoutClient.searchBundles()).rejects.toThrow();
    });
  });
});
