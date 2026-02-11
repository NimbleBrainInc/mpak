import { createWriteStream, createReadStream } from "fs";
import { createHash } from "crypto";
import { basename, join, resolve } from "path";
import archiver from "archiver";
import {
  validateSkillDirectory,
  formatValidationResult,
} from "./validate.js";

export interface PackResult {
  success: boolean;
  path: string | null;
  name: string | null;
  version: string | null;
  size: number | null;
  sha256: string | null;
  error: string | null;
}

/**
 * Create a .skill bundle from a skill directory
 */
export async function packSkill(
  skillPath: string,
  outputPath?: string,
): Promise<PackResult> {
  // Validate first
  const validation = validateSkillDirectory(skillPath);

  if (!validation.valid) {
    return {
      success: false,
      path: null,
      name: null,
      version: null,
      size: null,
      sha256: null,
      error: `Validation failed:\n${formatValidationResult(validation)}`,
    };
  }

  const skillName = validation.name!;
  const version =
    validation.frontmatter?.metadata?.version || "0.0.0";

  // Determine output path
  const bundleName = `${skillName}-${version}.skill`;
  const finalOutputPath =
    outputPath || join(process.cwd(), bundleName);

  // Create the zip archive
  return new Promise((resolvePromise) => {
    const output = createWriteStream(finalOutputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      const size = archive.pointer();

      // Calculate SHA256
      const hash = createHash("sha256");
      const stream = createReadStream(finalOutputPath);

      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => {
        const sha256 = hash.digest("hex");

        resolvePromise({
          success: true,
          path: finalOutputPath,
          name: skillName,
          version,
          size,
          sha256,
          error: null,
        });
      });
      stream.on("error", (err) => {
        resolvePromise({
          success: false,
          path: null,
          name: skillName,
          version,
          size: null,
          sha256: null,
          error: `Failed to calculate SHA256: ${err.message}`,
        });
      });
    });

    archive.on("error", (err) => {
      resolvePromise({
        success: false,
        path: null,
        name: skillName,
        version,
        size: null,
        sha256: null,
        error: `Archive error: ${err.message}`,
      });
    });

    archive.pipe(output);

    // Add the skill directory to the archive
    // The archive should contain: skillName/SKILL.md, skillName/scripts/, etc.
    const dirName = basename(resolve(skillPath));
    archive.directory(skillPath, dirName);

    archive.finalize();
  });
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface PackOptions {
  output?: string;
  json?: boolean;
}

/**
 * Handle the pack command
 */
export async function handleSkillPack(
  skillPath: string,
  options: PackOptions,
): Promise<void> {
  console.log("");
  console.log(`Validating ${skillPath}...`);

  const result = await packSkill(skillPath, options.output);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.success) {
    console.log(`\u2713 Valid: ${result.name}`);
    console.log("");
    console.log("Creating bundle...");
    console.log(
      `\u2713 Created: ${basename(result.path!)} (${formatSize(result.size!)})`,
    );
    console.log(`  SHA256: ${result.sha256}`);
  } else {
    console.log(result.error);
  }

  if (!result.success) {
    process.exit(1);
  }
}
