import type { BundleSearchResponse, SkillSearchResponse } from "@nimblebrain/mpak-schemas";
import type { MpakClient } from "@nimblebrain/mpak-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleUnifiedSearch } from "../src/commands/search.js";

// ---------------------------------------------------------------------------
// Mock the mpak singleton
// ---------------------------------------------------------------------------

let mockSearchBundles: ReturnType<typeof vi.fn>;
let mockSearchSkills: ReturnType<typeof vi.fn>;

vi.mock("../src/utils/config.js", () => ({
	get mpak() {
		return {
			client: {
				searchBundles: mockSearchBundles,
				searchSkills: mockSearchSkills,
			} as unknown as MpakClient,
		};
	},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeBundle = (name: string) => ({
	name,
	display_name: null,
	description: `${name} description`,
	author: { name: "author" },
	latest_version: "1.0.0",
	icon: null,
	server_type: "node",
	tools: [],
	downloads: 100,
	published_at: "2025-01-01T00:00:00.000Z",
	verified: false,
	provenance: null,
	certification_level: null,
});

const makeSkill = (name: string) => ({
	name,
	description: `${name} description`,
	latest_version: "1.0.0",
	tags: [],
	category: undefined,
	downloads: 50,
	published_at: "2025-01-01T00:00:00.000Z",
	author: undefined,
});

const emptyBundleResponse: BundleSearchResponse = {
	bundles: [],
	total: 0,
	pagination: { limit: 20, offset: 0, has_more: false },
};

const emptySkillResponse: SkillSearchResponse = {
	skills: [],
	total: 0,
	pagination: { limit: 20, offset: 0, has_more: false },
};

const bundleResponse: BundleSearchResponse = {
	bundles: [makeBundle("@scope/bundle-a"), makeBundle("@scope/bundle-b")],
	total: 2,
	pagination: { limit: 20, offset: 0, has_more: false },
};

const skillResponse: SkillSearchResponse = {
	skills: [makeSkill("@scope/skill-a")],
	total: 1,
	pagination: { limit: 20, offset: 0, has_more: false },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleUnifiedSearch", () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		mockSearchBundles = vi.fn().mockResolvedValue(emptyBundleResponse);
		mockSearchSkills = vi.fn().mockResolvedValue(emptySkillResponse);
		stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("searches both bundles and skills by default", async () => {
		await handleUnifiedSearch("test");

		expect(mockSearchBundles).toHaveBeenCalledWith(expect.objectContaining({ q: "test" }));
		expect(mockSearchSkills).toHaveBeenCalledWith(expect.objectContaining({ q: "test" }));
	});

	it("prints no-results message when both return empty", async () => {
		await handleUnifiedSearch("nothing");

		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining('No results found for "nothing"'),
		);
	});

	it("searches only bundles when type=bundle", async () => {
		mockSearchBundles.mockResolvedValue(bundleResponse);

		await handleUnifiedSearch("test", { type: "bundle" });

		expect(mockSearchBundles).toHaveBeenCalled();
		expect(mockSearchSkills).not.toHaveBeenCalled();
	});

	it("searches only skills when type=skill", async () => {
		mockSearchSkills.mockResolvedValue(skillResponse);

		await handleUnifiedSearch("test", { type: "skill" });

		expect(mockSearchSkills).toHaveBeenCalled();
		expect(mockSearchBundles).not.toHaveBeenCalled();
	});

	it("prints bundle and skill sections when both return results", async () => {
		mockSearchBundles.mockResolvedValue(bundleResponse);
		mockSearchSkills.mockResolvedValue(skillResponse);

		await handleUnifiedSearch("test");

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Bundles");
		expect(allOutput).toContain("@scope/bundle-a");
		expect(allOutput).toContain("Skills");
		expect(allOutput).toContain("@scope/skill-a");
	});

	it("swallows skill API errors and continues", async () => {
		mockSearchBundles.mockResolvedValue(bundleResponse);
		mockSearchSkills.mockRejectedValue(new Error("Skills API not deployed"));

		await handleUnifiedSearch("test");

		// Should still show bundle results, not crash
		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("@scope/bundle-a");
	});

	it("outputs JSON when --json is set", async () => {
		mockSearchBundles.mockResolvedValue(bundleResponse);
		mockSearchSkills.mockResolvedValue(skillResponse);

		await handleUnifiedSearch("test", { json: true });

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
		expect(parsed.results).toHaveLength(3);
		expect(parsed.totals).toEqual({ bundles: 2, skills: 1 });
	});

	it("passes sort, limit, offset params to both APIs", async () => {
		await handleUnifiedSearch("test", { sort: "downloads", limit: 5, offset: 10 });

		expect(mockSearchBundles).toHaveBeenCalledWith(
			expect.objectContaining({ q: "test", sort: "downloads", limit: 5, offset: 10 }),
		);
		expect(mockSearchSkills).toHaveBeenCalledWith(
			expect.objectContaining({ q: "test", sort: "downloads", limit: 5, offset: 10 }),
		);
	});

	it("logs error when bundle search throws", async () => {
		mockSearchBundles.mockRejectedValue(new Error("Registry unavailable"));

		await handleUnifiedSearch("test");

		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("Registry unavailable"),
		);
	});
});
