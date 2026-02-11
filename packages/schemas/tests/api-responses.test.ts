import { describe, expect, it } from "vitest";

import {
  AnnounceRequestSchema,
  BundleSchema,
  BundleSearchResponseSchema,
  PackageDetailSchema,
  PackageSchema,
  PackageSearchResponseSchema,
  PlatformInfoSchema,
  VersionDetailSchema,
} from "../src/api-responses.js";

describe("PackageSchema", () => {
  const validPackage = {
    name: "@test/my-server",
    display_name: "My Server",
    description: "A test MCP server",
    author: { name: "Test Author" },
    latest_version: "1.0.0",
    icon: null,
    server_type: "node",
    tools: [{ name: "my-tool", description: "Does things" }],
    downloads: 42,
    published_at: "2025-01-01T00:00:00Z",
    verified: true,
  };

  it("accepts a valid package", () => {
    const result = PackageSchema.parse(validPackage);
    expect(result.name).toBe("@test/my-server");
    expect(result.tools).toHaveLength(1);
  });

  it("accepts optional fields", () => {
    const result = PackageSchema.parse({
      ...validPackage,
      claimable: true,
      claimed: false,
      github: {
        repo: "test/my-server",
        stars: 100,
        forks: 10,
        watchers: 5,
      },
    });
    expect(result.claimable).toBe(true);
    expect(result.github?.repo).toBe("test/my-server");
  });

  it("accepts null author", () => {
    const result = PackageSchema.parse({
      ...validPackage,
      author: null,
    });
    expect(result.author).toBeNull();
  });

  it("rejects missing required fields", () => {
    expect(() => PackageSchema.parse({})).toThrow();
    expect(() => PackageSchema.parse({ name: "test" })).toThrow();
  });
});

describe("PackageDetailSchema", () => {
  it("extends PackageSchema with additional fields", () => {
    const detail = PackageDetailSchema.parse({
      name: "@test/pkg",
      display_name: null,
      description: null,
      author: null,
      latest_version: "0.1.0",
      icon: null,
      server_type: "python",
      tools: [],
      downloads: 0,
      published_at: "2025-06-01T00:00:00Z",
      verified: false,
      homepage: "https://example.com",
      license: "MIT",
      claiming: {
        claimable: true,
        claimed: false,
        claimed_by: null,
        claimed_at: null,
        github_repo: null,
      },
      versions: [
        {
          version: "0.1.0",
          published_at: "2025-06-01T00:00:00Z",
          downloads: 0,
        },
      ],
    });
    expect(detail.homepage).toBe("https://example.com");
    expect(detail.versions).toHaveLength(1);
  });
});

describe("PackageSearchResponseSchema", () => {
  it("validates a search response", () => {
    const response = PackageSearchResponseSchema.parse({
      packages: [],
      total: 0,
    });
    expect(response.total).toBe(0);
    expect(response.packages).toEqual([]);
  });
});

describe("BundleSchema", () => {
  it("accepts a valid bundle", () => {
    const bundle = BundleSchema.parse({
      name: "@test/bundle",
      latest_version: "1.0.0",
      downloads: 100,
      published_at: "2025-01-01T00:00:00Z",
      verified: true,
    });
    expect(bundle.name).toBe("@test/bundle");
  });

  it("accepts full provenance", () => {
    const bundle = BundleSchema.parse({
      name: "@test/bundle",
      latest_version: "1.0.0",
      downloads: 0,
      published_at: new Date(),
      verified: false,
      provenance: {
        schema_version: "1.0",
        provider: "github",
        repository: "test/repo",
        sha: "abc123",
      },
    });
    expect(bundle.provenance?.provider).toBe("github");
  });
});

describe("BundleSearchResponseSchema", () => {
  it("validates a bundle search response with pagination", () => {
    const response = BundleSearchResponseSchema.parse({
      bundles: [],
      total: 0,
      pagination: {
        limit: 20,
        offset: 0,
        has_more: false,
      },
    });
    expect(response.pagination.has_more).toBe(false);
  });
});

describe("PlatformInfoSchema", () => {
  it("accepts valid platform info", () => {
    const platform = PlatformInfoSchema.parse({
      os: "darwin",
      arch: "arm64",
    });
    expect(platform.os).toBe("darwin");
    expect(platform.arch).toBe("arm64");
  });
});

describe("VersionDetailSchema", () => {
  it("validates a version detail", () => {
    const detail = VersionDetailSchema.parse({
      name: "@test/pkg",
      version: "1.0.0",
      published_at: "2025-01-01T00:00:00Z",
      downloads: 10,
      artifacts: [
        {
          platform: { os: "darwin", arch: "arm64" },
          digest: "sha256:abc",
          size: 1024,
          download_url: "https://example.com/download",
        },
      ],
      manifest: { name: "test" },
      publish_method: "oidc",
      provenance: null,
    });
    expect(detail.artifacts).toHaveLength(1);
  });
});

describe("AnnounceRequestSchema", () => {
  it("validates an announce request", () => {
    const request = AnnounceRequestSchema.parse({
      name: "@test/server",
      version: "1.0.0",
      manifest: { name: "@test/server" },
      release_tag: "v1.0.0",
      artifact: {
        filename: "server-darwin-arm64.tar.gz",
        os: "darwin",
        arch: "arm64",
        sha256: "abc123",
        size: 2048,
      },
    });
    expect(request.prerelease).toBe(false);
    expect(request.artifact.os).toBe("darwin");
  });

  it("accepts explicit prerelease flag", () => {
    const request = AnnounceRequestSchema.parse({
      name: "@test/server",
      version: "1.0.0-beta.1",
      manifest: {},
      release_tag: "v1.0.0-beta.1",
      prerelease: true,
      artifact: {
        filename: "server-linux-x64.tar.gz",
        os: "linux",
        arch: "x64",
        sha256: "def456",
        size: 4096,
      },
    });
    expect(request.prerelease).toBe(true);
  });
});
