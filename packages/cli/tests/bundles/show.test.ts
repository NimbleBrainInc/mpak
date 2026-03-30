import type { BundleDetail, VersionsResponse } from "@nimblebrain/mpak-schemas";
import type { MpakClient } from "@nimblebrain/mpak-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleShow } from "../../src/commands/packages/show.js";

// ---------------------------------------------------------------------------
// Mock the mpak singleton
// ---------------------------------------------------------------------------

let mockGetBundle: ReturnType<typeof vi.fn>;
let mockGetBundleVersions: ReturnType<typeof vi.fn>;

vi.mock("../../src/utils/config.js", () => ({
	get mpak() {
		return {
			client: {
				getBundle: mockGetBundle,
				getBundleVersions: mockGetBundleVersions,
			} as unknown as MpakClient,
		};
	},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const bundleDetail: BundleDetail = {
	name: "@scope/test-bundle",
	display_name: "Test Bundle",
	description: "A test bundle for unit tests",
	author: { name: "test-author" },
	latest_version: "1.2.0",
	icon: null,
	server_type: "node",
	tools: [
		{ name: "tool-one", description: "First tool" },
		{ name: "tool-two", description: "Second tool" },
	],
	downloads: 1234,
	published_at: "2025-06-01T00:00:00.000Z",
	verified: true,
	provenance: {
		schema_version: "1.0",
		provider: "github-actions",
		repository: "https://github.com/scope/test-bundle",
		sha: "abc123def456789012",
	},
	certification_level: 2,
	homepage: "https://example.com",
	license: "MIT",
	certification: {
		level: 2,
		level_name: "Verified",
		controls_passed: 8,
		controls_failed: 2,
		controls_total: 10,
	},
	versions: [
		{ version: "1.2.0", published_at: "2025-06-01T00:00:00.000Z", downloads: 500 },
		{ version: "1.1.0", published_at: "2025-05-01T00:00:00.000Z", downloads: 734 },
	],
};

const versionsResponse: VersionsResponse = {
	name: "@scope/test-bundle",
	latest: "1.2.0",
	versions: [
		{
			version: "1.2.0",
			artifacts_count: 2,
			platforms: [
				{ os: "darwin", arch: "arm64" },
				{ os: "linux", arch: "x64" },
			],
			published_at: "2025-06-01T00:00:00.000Z",
			downloads: 500,
			publish_method: "github-actions",
			provenance: null,
		},
		{
			version: "1.1.0",
			artifacts_count: 1,
			platforms: [{ os: "linux", arch: "x64" }],
			published_at: "2025-05-01T00:00:00.000Z",
			downloads: 734,
			publish_method: "manual",
			provenance: null,
		},
	],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleShow", () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		mockGetBundle = vi.fn();
		mockGetBundleVersions = vi.fn();
		stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls getBundle and getBundleVersions with the package name", async () => {
		mockGetBundle.mockResolvedValue(bundleDetail);
		mockGetBundleVersions.mockResolvedValue(versionsResponse);

		await handleShow("@scope/test-bundle");

		expect(mockGetBundle).toHaveBeenCalledWith("@scope/test-bundle");
		expect(mockGetBundleVersions).toHaveBeenCalledWith("@scope/test-bundle");
	});

	it("prints bundle header with verified mark and display name", async () => {
		mockGetBundle.mockResolvedValue(bundleDetail);
		mockGetBundleVersions.mockResolvedValue(versionsResponse);

		await handleShow("@scope/test-bundle");

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("\u2713"); // verified checkmark
		expect(allOutput).toContain("Test Bundle v1.2.0");
	});

	it("prints bundle information section", async () => {
		mockGetBundle.mockResolvedValue(bundleDetail);
		mockGetBundleVersions.mockResolvedValue(versionsResponse);

		await handleShow("@scope/test-bundle");

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Name: @scope/test-bundle");
		expect(allOutput).toContain("Author: test-author");
		expect(allOutput).toContain("Type: node");
		expect(allOutput).toContain("License: MIT");
		expect(allOutput).toContain("Homepage: https://example.com");
	});

	it("prints trust and certification details", async () => {
		mockGetBundle.mockResolvedValue(bundleDetail);
		mockGetBundleVersions.mockResolvedValue(versionsResponse);

		await handleShow("@scope/test-bundle");

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Trust: L2 Verified");
		expect(allOutput).toContain("Controls: 8/10 passed");
	});

	it("prints tools list", async () => {
		mockGetBundle.mockResolvedValue(bundleDetail);
		mockGetBundleVersions.mockResolvedValue(versionsResponse);

		await handleShow("@scope/test-bundle");

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Tools (2):");
		expect(allOutput).toContain("tool-one");
		expect(allOutput).toContain("tool-two");
	});

	it("prints versions with platforms", async () => {
		mockGetBundle.mockResolvedValue(bundleDetail);
		mockGetBundleVersions.mockResolvedValue(versionsResponse);

		await handleShow("@scope/test-bundle");

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Versions (2):");
		expect(allOutput).toContain("1.2.0");
		expect(allOutput).toContain("(latest)");
		expect(allOutput).toContain("darwin-arm64");
	});

	it("prints JSON output when json option is set", async () => {
		mockGetBundle.mockResolvedValue(bundleDetail);
		mockGetBundleVersions.mockResolvedValue(versionsResponse);

		await handleShow("@scope/test-bundle", { json: true });

		const jsonCall = stdoutSpy.mock.calls.find((c: unknown[]) => {
			try {
				JSON.parse(c[0] as string);
				return true;
			} catch {
				return false;
			}
		});
		expect(jsonCall).toBeDefined();
		const parsed = JSON.parse((jsonCall as unknown[])[0] as string);
		expect(parsed.name).toBe("@scope/test-bundle");
		expect(parsed.versions_detail).toHaveLength(2);
	});

	it("skips optional sections when data is absent", async () => {
		const minimalBundle: BundleDetail = {
			...bundleDetail,
			display_name: null,
			description: null,
			author: null,
			tools: [],
			provenance: null,
			certification_level: null,
			certification: null,
			homepage: null,
			license: null,
		};
		mockGetBundle.mockResolvedValue(minimalBundle);
		mockGetBundleVersions.mockResolvedValue(versionsResponse);

		await handleShow("@scope/test-bundle");

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).not.toContain("Author:");
		expect(allOutput).not.toContain("License:");
		expect(allOutput).not.toContain("Homepage:");
		expect(allOutput).not.toContain("Trust:");
		expect(allOutput).not.toContain("Provenance:");
		expect(allOutput).not.toContain("Tools");
	});

	it("logs error when API call throws", async () => {
		mockGetBundle.mockRejectedValue(new Error("Bundle not found"));
		mockGetBundleVersions.mockRejectedValue(new Error("Bundle not found"));

		await handleShow("@scope/nonexistent");

		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("Bundle not found"),
		);
	});
});
