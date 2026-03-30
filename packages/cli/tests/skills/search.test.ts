import type { SkillSearchResponse } from "@nimblebrain/mpak-schemas";
import type { MpakClient } from "@nimblebrain/mpak-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSkillSearch } from "../../src/commands/skills/search.js";

// ---------------------------------------------------------------------------
// Mock the mpak singleton
// ---------------------------------------------------------------------------

let mockSearchSkills: ReturnType<typeof vi.fn>;

vi.mock("../../src/utils/config.js", () => ({
	get mpak() {
		return {
			client: { searchSkills: mockSearchSkills } as unknown as MpakClient,
		};
	},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import type { SkillCategory } from "@nimblebrain/mpak-schemas";

const makeSkill = (name: string, version: string, category?: SkillCategory) => ({
	name,
	description: `${name} description`,
	latest_version: version,
	tags: ["test"],
	category,
	downloads: 10,
	published_at: "2025-01-01T00:00:00.000Z",
});

const emptyResponse: SkillSearchResponse = {
	skills: [],
	total: 0,
	pagination: { limit: 20, offset: 0, has_more: false },
};

const twoResultsResponse: SkillSearchResponse = {
	skills: [
		makeSkill("@scope/skill-alpha", "1.0.0", "development"),
		makeSkill("@scope/skill-beta", "2.1.0", "data"),
	],
	total: 2,
	pagination: { limit: 20, offset: 0, has_more: false },
};

const paginatedResponse: SkillSearchResponse = {
	skills: [makeSkill("@scope/skill-alpha", "1.0.0")],
	total: 25,
	pagination: { limit: 20, offset: 0, has_more: true },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleSkillSearch", () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		mockSearchSkills = vi.fn();
		stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("passes query and search params to searchSkills", async () => {
		mockSearchSkills.mockResolvedValue(emptyResponse);

		await handleSkillSearch("test", { tags: "mcp", sort: "downloads" });

		expect(mockSearchSkills).toHaveBeenCalledWith({
			q: "test",
			tags: "mcp",
			sort: "downloads",
		});
	});

	it("prints no-results message when search returns 0 skills", async () => {
		mockSearchSkills.mockResolvedValue(emptyResponse);

		await handleSkillSearch("nonexistent", {});

		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining('No skills found for "nonexistent"'),
		);
	});

	it("prints table output when results exist", async () => {
		mockSearchSkills.mockResolvedValue(twoResultsResponse);

		await handleSkillSearch("test", {});

		const allOutput = stderrSpy.mock.calls
			.map((c: unknown[]) => c[0])
			.join("\n");
		expect(allOutput).toContain("@scope/skill-alpha");
		expect(allOutput).toContain("@scope/skill-beta");
		expect(allOutput).toContain("NAME");
		expect(allOutput).toContain("CATEGORY");
	});

	it("prints JSON output when json option is set", async () => {
		mockSearchSkills.mockResolvedValue(twoResultsResponse);

		await handleSkillSearch("test", { json: true });

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
		expect(parsed.skills).toHaveLength(2);
		expect(parsed.total).toBe(2);
	});

	it("shows pagination hint when has_more is true", async () => {
		mockSearchSkills.mockResolvedValue(paginatedResponse);

		await handleSkillSearch("test", {});

		const allOutput = stderrSpy.mock.calls
			.map((c: unknown[]) => c[0])
			.join("\n");
		expect(allOutput).toContain("1 of 25");
		expect(allOutput).toContain("--offset");
	});

	it("logs error when searchSkills throws", async () => {
		mockSearchSkills.mockRejectedValue(new Error("Network error"));

		await handleSkillSearch("anything", {});

		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("Network error"),
		);
	});
});
