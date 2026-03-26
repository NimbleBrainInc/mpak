import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import type { z } from "zod";

/**
 * Maximum allowed uncompressed size for a bundle (500MB).
 */
export const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024;

/**
 * TTL for update checks — skip if last check was within this window (1 hour).
 */
export const UPDATE_CHECK_TTL_MS = 60 * 60 * 1000;

/**
 * Compare two semver strings for equality, ignoring leading 'v' prefix.
 */
export function isSemverEqual(a: string, b: string): boolean {
	return a.replace(/^v/, "") === b.replace(/^v/, "");
}

/**
 * Check uncompressed size and extract a ZIP file to a directory.
 * Rejects bundles exceeding {@link MAX_UNCOMPRESSED_SIZE} (zip-bomb protection).
 *
 * Requires the `unzip` system command to be available on PATH.
 *
 * @throws If uncompressed size exceeds the limit or extraction fails.
 */
export function extractZip(zipPath: string, destDir: string): void {
	// Check uncompressed size before extraction
	try {
		const listOutput = execFileSync("unzip", ["-l", zipPath], {
			stdio: "pipe",
			encoding: "utf8",
		});
		const totalMatch = listOutput.match(/^\s*(\d+)\s+\d+\s+files?$/m);
		if (totalMatch) {
			const totalSize = parseInt(totalMatch[1] ?? "0", 10);
			if (totalSize > MAX_UNCOMPRESSED_SIZE) {
				throw new Error(
					`Bundle uncompressed size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds maximum allowed (${MAX_UNCOMPRESSED_SIZE / (1024 * 1024)}MB)`,
				);
			}
		}
	} catch (error: unknown) {
		if (
			error instanceof Error &&
			error.message.includes("exceeds maximum allowed")
		) {
			throw error;
		}
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Cannot verify bundle size before extraction: ${message}`,
		);
	}

	mkdirSync(destDir, { recursive: true });
	execFileSync("unzip", ["-o", "-q", zipPath, "-d", destDir], {
		stdio: "pipe",
	});
}

/**
 * Read a JSON file, parse it, and validate against a Zod schema.
 *
 * @param filePath - Absolute path to the JSON file
 * @param schema - Zod schema to validate the parsed content against
 * @returns The validated data matching the schema's output type
 *
 * @throws {Error} If the file does not exist, contains invalid JSON,
 *   or fails schema validation.
 */
export function readJsonFromFile<T extends z.ZodTypeAny>(
	filePath: string,
	schema: T,
): z.output<T> {
	if (!existsSync(filePath)) {
		throw new Error(`File does not exist: ${filePath}`);
	}

	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(filePath, "utf8"));
	} catch (err) {
		throw new Error(`File is not valid JSON: ${filePath}`, { cause: err });
	}

	const result = schema.safeParse(raw);
	if (!result.success) {
		throw new Error(
			`File failed validation: ${filePath} — ${result.error.issues[0]?.message ?? "unknown error"}`,
		);
	}

	return result.data;
}
