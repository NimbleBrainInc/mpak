import { writeFileSync } from "fs";
import { basename, join } from "path";
import { formatSize, fmtError } from "../../utils/format.js";
import { createClient } from "../../utils/client.js";

/**
 * Parse skill spec into name and version
 * Examples: @scope/name, @scope/name@1.0.0
 */
function parseSkillSpec(spec: string): {
  name: string;
  version?: string;
} {
  // Handle @scope/name@version format
  const atIndex = spec.lastIndexOf("@");

  // If @ is at position 0, it's just the scope prefix
  if (atIndex <= 0) {
    return { name: spec };
  }

  // Check if the @ is part of version (after the /)
  const slashIndex = spec.indexOf("/");
  if (atIndex > slashIndex) {
    return {
      name: spec.slice(0, atIndex),
      version: spec.slice(atIndex + 1),
    };
  }

  return { name: spec };
}

export interface PullOptions {
  output?: string;
  json?: boolean;
}

/**
 * Handle the skill pull command
 */
export async function handleSkillPull(
  skillSpec: string,
  options: PullOptions,
): Promise<void> {
  try {
    const { name, version } = parseSkillSpec(skillSpec);

    // Get download info
    const client = createClient();
    const downloadInfo = version
      ? await client.getSkillVersionDownload(name, version)
      : await client.getSkillDownload(name);

    console.log(
      `Pulling ${downloadInfo.skill.name}@${downloadInfo.skill.version}...`,
    );

    // Download the bundle
    const response = await fetch(downloadInfo.url);
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    // Verify SHA256
    if (downloadInfo.skill.sha256) {
      const { createHash } = await import("crypto");
      const hash = createHash("sha256").update(buffer).digest("hex");
      if (hash !== downloadInfo.skill.sha256) {
        throw new Error(
          `SHA256 mismatch: expected ${downloadInfo.skill.sha256}, got ${hash}`,
        );
      }
    }

    // Determine output path
    const filename = `${basename(downloadInfo.skill.name.replace("@", "").replace("/", "-"))}-${downloadInfo.skill.version}.skill`;
    const outputPath =
      options.output || join(process.cwd(), filename);

    // Write to disk
    writeFileSync(outputPath, buffer);

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            path: outputPath,
            name: downloadInfo.skill.name,
            version: downloadInfo.skill.version,
            size: downloadInfo.skill.size,
            sha256: downloadInfo.skill.sha256,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `Downloaded ${filename} (${formatSize(downloadInfo.skill.size)})`,
      );
      console.log(`  SHA256: ${downloadInfo.skill.sha256}`);
      console.log(`  Path: ${outputPath}`);
    }
  } catch (err) {
    fmtError(err instanceof Error ? err.message : String(err));
  }
}
