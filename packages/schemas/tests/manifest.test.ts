import { describe, expect, it } from "vitest";

import {
  ManifestServerSchema,
  McpbManifestSchema,
  SafeRelativePathSchema,
} from "../src/manifest.js";

describe("SafeRelativePathSchema", () => {
  describe("accepts safe relative paths", () => {
    it.each([
      "index.js",
      "./index.js",
      "src/index.js",
      "build/server/main.js",
      "main.py",
      "mcp_echo.server",
      "bin/run",
      "deeply/nested/path/to/file.js",
      "name-with-dashes.js",
      "name_with_underscores.js",
      "file.with.many.dots.js",
      "ünicode/файл.js",
    ])("accepts %j", (path) => {
      expect(SafeRelativePathSchema.safeParse(path).success).toBe(true);
    });
  });

  describe("rejects unsafe paths", () => {
    it.each([
      ["empty string", ""],
      ["NUL byte", "foo\0bar"],
      ["POSIX absolute", "/etc/passwd"],
      ["POSIX absolute root", "/"],
      ["dotdot at start", "../foo"],
      ["dotdot in middle", "foo/../bar"],
      ["dotdot at end", "foo/.."],
      ["multiple dotdot", "../../../etc/passwd"],
      ["windows drive", "C:\\evil"],
      ["windows drive forward slash", "C:/evil"],
      ["windows drive lowercase", "c:\\evil"],
      ["windows drive without separator", "C:foo"],
      ["windows drive-root-relative", "\\foo"],
      ["windows UNC", "\\\\server\\share"],
      ["dotdot via backslash", "foo\\..\\bar"],
      ["any backslash", "foo\\bar"],
    ])("rejects %s (%j)", (_label, path) => {
      expect(SafeRelativePathSchema.safeParse(path).success).toBe(false);
    });
  });

  it("does not reject paths that merely contain '..' as a substring", () => {
    expect(SafeRelativePathSchema.safeParse("foo..bar.js").success).toBe(true);
    expect(SafeRelativePathSchema.safeParse("..hidden/file.js").success).toBe(
      true,
    );
  });
});

describe("ManifestServerSchema", () => {
  const validServer = {
    type: "node" as const,
    entry_point: "src/index.js",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/src/index.js"],
    },
  };

  it("accepts a clean relative entry_point", () => {
    expect(ManifestServerSchema.safeParse(validServer).success).toBe(true);
  });

  it("rejects an entry_point with .. traversal", () => {
    const result = ManifestServerSchema.safeParse({
      ...validServer,
      entry_point: "../../etc/passwd",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toMatch(/relative path/i);
    }
  });

  it("rejects an absolute entry_point", () => {
    expect(
      ManifestServerSchema.safeParse({
        ...validServer,
        entry_point: "/etc/passwd",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty entry_point", () => {
    expect(
      ManifestServerSchema.safeParse({
        ...validServer,
        entry_point: "",
      }).success,
    ).toBe(false);
  });
});

describe("McpbManifestSchema", () => {
  const baseManifest = {
    manifest_version: "0.4",
    name: "@test/bundle",
    version: "1.0.0",
    description: "test",
    server: {
      type: "node",
      entry_point: "build/index.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/build/index.js"],
      },
    },
  };

  it("accepts a well-formed manifest", () => {
    expect(McpbManifestSchema.safeParse(baseManifest).success).toBe(true);
  });

  it("rejects a manifest whose entry_point traverses out of the bundle", () => {
    const result = McpbManifestSchema.safeParse({
      ...baseManifest,
      server: { ...baseManifest.server, entry_point: "../../../../etc/passwd" },
    });
    expect(result.success).toBe(false);
  });
});
