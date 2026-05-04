import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpbManifestSchema, type McpbManifest } from '@nimblebrain/mpak-schemas';
import { extractZip, readJsonFromFile } from './helpers.js';

export interface McpbValidationSuccess {
  valid: true;
  manifest: McpbManifest;
  errors?: undefined;
}

export interface McpbValidationFailure {
  valid: false;
  manifest?: undefined;
  errors: string[];
}

export type McpbValidationResult = McpbValidationSuccess | McpbValidationFailure;

/**
 * Validate a local `.mcpb` file without side effects.
 *
 * Extracts to a temp directory, validates manifest schema and entry point
 * existence, then cleans up. Does not touch the mpak cache.
 */
export async function validateMcpb(mcpbPath: string): Promise<McpbValidationResult> {
  if (!existsSync(mcpbPath)) {
    return { valid: false, errors: [`File does not exist: ${mcpbPath}`] };
  }

  let tempDir: string | undefined;
  try {
    tempDir = mkdtempSync(join(tmpdir(), 'mpak-validate-'));

    try {
      await extractZip(mcpbPath, tempDir);
    } catch (err) {
      return {
        valid: false,
        errors: [`Failed to open archive: ${err instanceof Error ? err.message : String(err)}`],
      };
    }

    const manifestPath = join(tempDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      return { valid: false, errors: ['Bundle is missing manifest.json'] };
    }

    let manifest: McpbManifest;
    try {
      manifest = readJsonFromFile(manifestPath, McpbManifestSchema);
    } catch (err) {
      return {
        valid: false,
        errors: [
          `Invalid manifest.json: ${err instanceof Error ? err.message : String(err)}`,
        ],
      };
    }

    const entryPoint = manifest.server.entry_point;
    if (!existsSync(join(tempDir, entryPoint))) {
      return {
        valid: false,
        errors: [`Entry point "${entryPoint}" does not exist in bundle`],
      };
    }

    return { valid: true, manifest };
  } finally {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
