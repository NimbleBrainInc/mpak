import { writeFileSync } from "fs";
import { resolve } from "path";
import type { MpakClient } from "@nimblebrain/mpak-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handlePull } from "../src/commands/packages/pull.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("fs", () => ({ writeFileSync: vi.fn() }));

let mockDownloadBundle: ReturnType<typeof vi.fn>;

vi.mock("../src/utils/config.js", () => ({
	get mpak() {
		return {
			client: { downloadBundle: mockDownloadBundle } as unknown as MpakClient,
		};
	},
}));

vi.mock("@nimblebrain/mpak-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@nimblebrain/mpak-sdk")>();
	return {
		...actual,
		MpakClient: {
			detectPlatform: () => ({ os: "darwin", arch: "arm64" }),
		},
	};
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const bundleData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

const metadata = {
	name: "@scope/test-bundle",
	version: "1.2.0",
	platform: { os: "darwin", arch: "arm64" },
	sha256: "abcdef1234567890abcdef1234567890",
	size: 2_500_000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handlePull", () => {
	let stdoutSpy: ReturnType<typeof vi.spyOn>;
	let stderrSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.mocked(writeFileSync).mockClear();
		mockDownloadBundle = vi.fn().mockResolvedValue({ data: bundleData, metadata });
		stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("calls downloadBundle with parsed name and version", async () => {
		await handlePull("@scope/test-bundle@1.2.0");

		expect(mockDownloadBundle).toHaveBeenCalledWith(
			"@scope/test-bundle",
			"1.2.0",
			{ os: "darwin", arch: "arm64" },
		);
	});

	it("passes undefined version when none specified", async () => {
		await handlePull("@scope/test-bundle");

		expect(mockDownloadBundle).toHaveBeenCalledWith(
			"@scope/test-bundle",
			undefined,
			{ os: "darwin", arch: "arm64" },
		);
	});

	it("writes downloaded data to default filename in cwd", async () => {
		await handlePull("@scope/test-bundle");

		expect(writeFileSync).toHaveBeenCalledWith(
			resolve("scope-test-bundle-1.2.0-darwin-arm64.mcpb"),
			bundleData,
		);
	});

	it("writes to --output path when specified", async () => {
		await handlePull("@scope/test-bundle", { output: "/tmp/my-bundle.mcpb" });

		expect(writeFileSync).toHaveBeenCalledWith(
			"/tmp/my-bundle.mcpb",
			bundleData,
		);
	});

	it("uses explicit --os and --arch overrides", async () => {
		await handlePull("@scope/test-bundle", { os: "linux", arch: "x64" });

		expect(mockDownloadBundle).toHaveBeenCalledWith(
			"@scope/test-bundle",
			undefined,
			{ os: "linux", arch: "x64" },
		);
	});

	it("prints metadata and SHA in normal output", async () => {
		await handlePull("@scope/test-bundle");

		const allOutput = stdoutSpy.mock.calls.map((c: unknown[]) => c[0]).join("\n");
		expect(allOutput).toContain("Version: 1.2.0");
		expect(allOutput).toContain("darwin-arm64");
		expect(allOutput).toContain("2.4 MB");
		expect(allOutput).toContain("SHA256: abcdef1234567890...");
		expect(allOutput).toContain("downloaded successfully");
	});

	it("prints JSON and skips file write when --json is set", async () => {
		await handlePull("@scope/test-bundle", { json: true });

		expect(writeFileSync).not.toHaveBeenCalled();
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
		expect(parsed.version).toBe("1.2.0");
	});

	it("logs error when downloadBundle throws", async () => {
		mockDownloadBundle.mockRejectedValue(new Error("Bundle not found"));

		await handlePull("@scope/nonexistent");

		expect(stderrSpy).toHaveBeenCalledWith(
			expect.stringContaining("Bundle not found"),
		);
	});
});
