import type { SkillDetail } from "@nimblebrain/mpak-schemas";
import type { MpakClient } from "@nimblebrain/mpak-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSkillShow } from "../../src/commands/skills/show.js";

// ---------------------------------------------------------------------------
// Mock the mpak singleton
// ---------------------------------------------------------------------------

let mockGetSkill: ReturnType<typeof vi.fn>;

vi.mock("../../src/utils/config.js", () => ({
	get mpak() {
		return {
			client: { getSkill: mockGetSkill } as unknown as MpakClient,
		};
	},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseSkill: SkillDetail = {
	name: "@scope/test-skill",
	description: "A test skill for unit tests",
	latest_version: "1.2.0",
	license: "MIT",
	category: "development",
	tags: ["mcp", "testing"],
	triggers: ["test trigger", "run tests"],
	downloads: 1_500,
	published_at: "2025-06-15T00:00:00.000Z",
	author: { name: "test-author", url: "https://example.com" },
	examples: [
		{ prompt: "Run my tests", context: "in a project directory" },
		{ prompt: "Check test coverage" },
	],
	versions: [
		{ version: "1.2.0", published_at: "2025-06-15T00:00:00.000Z", downloads: 800 },
		{ version: "1.1.0", published_at: "2025-05-01T00:00:00.000Z", downloads: 500 },
		{ version: "1.0.0", published_at: "2025-04-01T00:00:00.000Z", downloads: 200 },
	],
};

const minimalSkill: SkillDetail = {
	name: "@scope/minimal-skill",
	description: "Minimal skill",
	latest_version: "0.1.0",
	downloads: 0,
	published_at: "2025-01-01T00:00:00.000Z",
	versions: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleSkillShow", () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		mockGetSkill = vi.fn();
		stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls getSkill with the skill name", async () => {
		mockGetSkill.mockResolvedValue(baseSkill);

		await handleSkillShow("@scope/test-skill", {});

		expect(mockGetSkill).toHaveBeenCalledWith("@scope/test-skill");
	});

	it("prints name, version, and description", async () => {
		mockGetSkill.mockResolvedValue(baseSkill);

		await handleSkillShow("@scope/test-skill", {});

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("@scope/test-skill@1.2.0");
		expect(allOutput).toContain("A test skill for unit tests");
	});

	it("prints metadata fields", async () => {
		mockGetSkill.mockResolvedValue(baseSkill);

		await handleSkillShow("@scope/test-skill", {});

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("License: MIT");
		expect(allOutput).toContain("Category: development");
		expect(allOutput).toContain("Tags: mcp, testing");
		expect(allOutput).toContain("Author: test-author (https://example.com)");
		expect(allOutput).toContain("1,500");
	});

	it("prints triggers", async () => {
		mockGetSkill.mockResolvedValue(baseSkill);

		await handleSkillShow("@scope/test-skill", {});

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Triggers:");
		expect(allOutput).toContain("test trigger");
		expect(allOutput).toContain("run tests");
	});

	it("prints examples with context", async () => {
		mockGetSkill.mockResolvedValue(baseSkill);

		await handleSkillShow("@scope/test-skill", {});

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Examples:");
		expect(allOutput).toContain('"Run my tests" (in a project directory)');
		expect(allOutput).toContain('"Check test coverage"');
	});

	it("prints version history", async () => {
		mockGetSkill.mockResolvedValue(baseSkill);

		await handleSkillShow("@scope/test-skill", {});

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Versions:");
		expect(allOutput).toContain("1.2.0");
		expect(allOutput).toContain("1.1.0");
		expect(allOutput).toContain("1.0.0");
	});

	it("prints install hint", async () => {
		mockGetSkill.mockResolvedValue(baseSkill);

		await handleSkillShow("@scope/test-skill", {});

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Install: mpak skill install @scope/test-skill");
	});

	it("handles minimal skill without optional fields", async () => {
		mockGetSkill.mockResolvedValue(minimalSkill);

		await handleSkillShow("@scope/minimal-skill", {});

		const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("@scope/minimal-skill@0.1.0");
		expect(allOutput).not.toContain("License:");
		expect(allOutput).not.toContain("Category:");
		expect(allOutput).not.toContain("Triggers:");
		expect(allOutput).not.toContain("Examples:");
		expect(allOutput).not.toContain("Versions:");
	});

	it("prints JSON output when json option is set", async () => {
		mockGetSkill.mockResolvedValue(baseSkill);

		await handleSkillShow("@scope/test-skill", { json: true });

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
		expect(parsed.name).toBe("@scope/test-skill");
		expect(parsed.latest_version).toBe("1.2.0");
	});

	it("logs error when getSkill throws", async () => {
		mockGetSkill.mockRejectedValue(new Error("Skill not found"));

		await handleSkillShow("@scope/nonexistent", {});

		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("Skill not found"),
		);
	});
});
