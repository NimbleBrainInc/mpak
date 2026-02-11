import { describe, expect, it } from "vitest";

import {
  validateAnnounceRequest,
  validateBundle,
  validateBundleDetail,
  validateMCPBIndex,
  validateMpakJson,
  validatePackage,
  validatePackageDetail,
  validatePackageSearchParams,
  validatePackageSearchResponse,
  validateSkillDetail,
  validateSkillFrontmatter,
  validateUserProfile,
} from "../src/validation.js";

describe("validatePackage", () => {
  it("returns success for valid data", () => {
    const result = validatePackage({
      name: "@test/server",
      display_name: null,
      description: null,
      author: null,
      latest_version: "1.0.0",
      icon: null,
      server_type: "node",
      tools: [],
      downloads: 0,
      published_at: "2025-01-01T00:00:00Z",
      verified: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("@test/server");
    }
  });

  it("returns errors for invalid data", () => {
    const result = validatePackage({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("returns errors with field paths", () => {
    const result = validatePackage({ name: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.some((e) => e.includes("name"))).toBe(true);
    }
  });
});

describe("validatePackageDetail", () => {
  it("validates a full package detail", () => {
    const result = validatePackageDetail({
      name: "@test/pkg",
      display_name: "Test",
      description: "A test",
      author: { name: "Author" },
      latest_version: "1.0.0",
      icon: null,
      server_type: "python",
      tools: [],
      downloads: 10,
      published_at: "2025-01-01T00:00:00Z",
      verified: true,
      homepage: null,
      license: "MIT",
      claiming: {
        claimable: false,
        claimed: true,
        claimed_by: "user",
        claimed_at: "2025-01-01T00:00:00Z",
        github_repo: "test/pkg",
      },
      versions: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("validatePackageSearchResponse", () => {
  it("validates an empty response", () => {
    const result = validatePackageSearchResponse({
      packages: [],
      total: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe("validatePackageSearchParams", () => {
  it("validates empty params", () => {
    const result = validatePackageSearchParams({});
    expect(result.success).toBe(true);
  });
});

describe("validateBundle", () => {
  it("validates a minimal bundle", () => {
    const result = validateBundle({
      name: "@test/bundle",
      latest_version: "1.0.0",
      downloads: 0,
      published_at: "2025-01-01T00:00:00Z",
      verified: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("validateBundleDetail", () => {
  it("validates a bundle detail", () => {
    const result = validateBundleDetail({
      name: "@test/bundle",
      latest_version: "1.0.0",
      downloads: 0,
      published_at: "2025-01-01T00:00:00Z",
      verified: false,
      versions: [
        {
          version: "1.0.0",
          published_at: "2025-01-01T00:00:00Z",
          downloads: 0,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("validateAnnounceRequest", () => {
  it("validates a valid announce request", () => {
    const result = validateAnnounceRequest({
      name: "@test/server",
      version: "1.0.0",
      manifest: {},
      release_tag: "v1.0.0",
      artifact: {
        filename: "server.tar.gz",
        os: "darwin",
        arch: "arm64",
        sha256: "abc",
        size: 1024,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("validateMCPBIndex", () => {
  it("validates an MCPB index", () => {
    const result = validateMCPBIndex({
      index_version: "1.0",
      mimeType: "application/vnd.mcpb.index.v1+json",
      name: "@test/server",
      version: "1.0.0",
      description: "A test server",
      bundles: [
        {
          mimeType: "application/vnd.mcpb.bundle.v1.tar+gzip",
          digest: "sha256:abc",
          size: 1024,
          platform: { os: "darwin", arch: "arm64" },
          urls: ["https://example.com/download"],
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("validateUserProfile", () => {
  it("validates a user profile", () => {
    const result = validateUserProfile({
      id: "user_1",
      email: "test@example.com",
      emailVerified: true,
      username: "test",
      name: "Test",
      avatarUrl: null,
      githubUsername: null,
      githubLinked: false,
      verified: false,
      publishedBundles: 0,
      totalDownloads: 0,
      role: null,
      createdAt: null,
      lastLoginAt: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("validateMpakJson", () => {
  it("validates a valid mpak.json", () => {
    const result = validateMpakJson({
      name: "@user/pkg",
      maintainers: ["user"],
    });
    expect(result.success).toBe(true);
  });

  it("returns errors for invalid mpak.json", () => {
    const result = validateMpakJson({
      name: "not-scoped",
      maintainers: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

describe("validateSkillFrontmatter", () => {
  it("validates valid frontmatter", () => {
    const result = validateSkillFrontmatter({
      name: "my-skill",
      description: "A skill",
    });
    expect(result.success).toBe(true);
  });

  it("returns errors for invalid frontmatter", () => {
    const result = validateSkillFrontmatter({});
    expect(result.success).toBe(false);
  });
});

describe("validateSkillDetail", () => {
  it("validates a skill detail", () => {
    const result = validateSkillDetail({
      name: "@user/skill",
      description: "A skill",
      latest_version: "1.0.0",
      downloads: 0,
      published_at: "2025-01-01T00:00:00Z",
      versions: [
        {
          version: "1.0.0",
          published_at: "2025-01-01T00:00:00Z",
          downloads: 0,
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
