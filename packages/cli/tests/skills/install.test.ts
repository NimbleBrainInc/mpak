import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import type { MpakClient } from "@nimblebrain/mpak-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSkillInstall } from "../../src/commands/skills/install.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
	existsSync: vi.fn().mockReturnValue(false),
	mkdirSync: vi.fn(),
	writeFileSync: vi.fn(),
	rmSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
}));

let mockDownloadSkillBundle: ReturnType<typeof vi.fn>;

vi.mock("../../src/utils/config.js", () => ({
	get mpak() {
		return {
			client: {
				downloadSkillBundle: mockDownloadSkillBundle,
			} as unknown as MpakClient,
		};
	},
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const skillData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

const metadata = {
	name: "@scope/test-skill",
	version: "1.2.0",
	sha256: "abcdef1234567890abcdef1234567890",
	size: 512_000,
};

const skillsDir = join(homedir(), ".claude", "skills");
const installPath = join(skillsDir, "test-skill");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleSkillInstall", () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;
	let mockExit: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.mocked(existsSync).mockReturnValue(false);
		vi.mocked(writeFileSync).mockClear();
		vi.mocked(mkdirSync).mockClear();
		vi.mocked(rmSync).mockClear();
		vi.mocked(execFileSync).mockClear();
		mockDownloadSkillBundle = vi
			.fn()
			.mockResolvedValue({ data: skillData, metadata });
		stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		mockExit = vi
			.spyOn(process, "exit")
			.mockImplementation((() => {
				throw new Error("process.exit");
			}) as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls downloadSkillBundle with parsed name and version", async () => {
		await handleSkillInstall("@scope/test-skill@1.2.0");

		expect(mockDownloadSkillBundle).toHaveBeenCalledWith(
			"@scope/test-skill",
			"1.2.0",
		);
	});

	it("creates skills directory and extracts with unzip", async () => {
		await handleSkillInstall("@scope/test-skill");

		expect(mkdirSync).toHaveBeenCalledWith(skillsDir, {
			recursive: true,
		});
		expect(writeFileSync).toHaveBeenCalledWith(
			expect.stringContaining("skill-"),
			skillData,
		);
		expect(execFileSync).toHaveBeenCalledWith(
			"unzip",
			["-o", expect.stringContaining("skill-"), "-d", skillsDir],
			{ stdio: "pipe" },
		);
	});

	it("cleans up temp file after extraction", async () => {
		await handleSkillInstall("@scope/test-skill");

		expect(rmSync).toHaveBeenCalledWith(
			expect.stringContaining("skill-"),
			{ force: true },
		);
	});

	it("exits with error if already installed without --force", async () => {
		vi.mocked(existsSync).mockReturnValue(true);

		await handleSkillInstall("@scope/test-skill");

		expect(mockExit).toHaveBeenCalledWith(1);
		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("already installed"),
		);
		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("--force"),
		);
	});

	it("overwrites existing installation with --force", async () => {
		vi.mocked(existsSync).mockReturnValue(true);

		await handleSkillInstall("@scope/test-skill", { force: true });

		expect(rmSync).toHaveBeenCalledWith(installPath, {
			recursive: true,
		});
		expect(execFileSync).toHaveBeenCalled();
	});

	it("prints JSON output when --json is set", async () => {
		await handleSkillInstall("@scope/test-skill", { json: true });

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
		expect(parsed.installed).toBe(true);
		expect(parsed.name).toBe("@scope/test-skill");
		expect(parsed.shortName).toBe("test-skill");
		expect(parsed.version).toBe("1.2.0");
	});

	it("prints success output in normal mode", async () => {
		await handleSkillInstall("@scope/test-skill");

		const allOutput = stderrSpy.mock.calls
			.map((c: unknown[]) => c[0])
			.join("\n");
		expect(allOutput).toContain("test-skill@1.2.0");
		expect(allOutput).toContain("Restart to activate");
	});

	it("logs error when downloadSkillBundle throws", async () => {
		mockDownloadSkillBundle.mockRejectedValue(
			new Error("Skill not found"),
		);

		await handleSkillInstall("@scope/nonexistent");

		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("Skill not found"),
		);
	});
});
