import { existsSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join, basename } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { formatSize, fmtError } from "../../utils/format.js";
import { createClient } from "../../utils/client.js";
import { resolveProvider } from "../../utils/providers.js";

/**
 * Parse skill spec into name and version
 */
function parseSkillSpec(spec: string): {
  name: string;
  version?: string;
} {
  const atIndex = spec.lastIndexOf("@");
  if (atIndex <= 0) {
    return { name: spec };
  }
  const slashIndex = spec.indexOf("/");
  if (atIndex > slashIndex) {
    return {
      name: spec.slice(0, atIndex),
      version: spec.slice(atIndex + 1),
    };
  }
  return { name: spec };
}

/**
 * Extract skill name from scoped name
 * @scope/skill-name -> skill-name
 */
function getShortName(scopedName: string): string {
  const parts = scopedName.replace("@", "").split("/");
  return parts[parts.length - 1]!;
}

export interface InstallOptions {
  force?: boolean;
  json?: boolean;
  provider?: string;
}

/**
 * Handle the skill install command
 */
export async function handleSkillInstall(
  skillSpec: string,
  options: InstallOptions,
): Promise<void> {
  try {
    const { name, version } = parseSkillSpec(skillSpec);

    // Resolve target provider
    const { provider, skillsDir } = resolveProvider(options.provider);

    // Get download info
    const client = createClient();
    const downloadInfo = version
      ? await client.getSkillVersionDownload(name, version)
      : await client.getSkillDownload(name);
    const shortName = getShortName(downloadInfo.skill.name);
    const installPath = join(skillsDir, shortName);

    // Check if already installed
    if (existsSync(installPath) && !options.force) {
      console.error(
        `Skill "${shortName}" is already installed at ${installPath}`,
      );
      console.error("Use --force to overwrite");
      process.exit(1);
    }

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

    console.log(
      `Downloaded ${basename(downloadInfo.skill.name)}-${downloadInfo.skill.version}.skill (${formatSize(downloadInfo.skill.size)})`,
    );

    // Ensure skills directory exists
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    // Write to temp file
    const tempPath = join(tmpdir(), `skill-${Date.now()}.skill`);
    writeFileSync(tempPath, buffer);

    // Remove existing installation if force
    if (existsSync(installPath)) {
      rmSync(installPath, { recursive: true });
    }

    // Extract using unzip
    // The .skill bundle contains: skillName/SKILL.md, skillName/...
    // We extract to the skills directory
    try {
      execFileSync('unzip', ['-o', tempPath, '-d', skillsDir], {
        stdio: "pipe",
      });
    } catch (err) {
      throw new Error(`Failed to extract skill bundle: ${err}`);
    } finally {
      // Clean up temp file
      rmSync(tempPath, { force: true });
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            installed: true,
            name: downloadInfo.skill.name,
            shortName,
            version: downloadInfo.skill.version,
            path: installPath,
            provider,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`Extracting to ${installPath}/`);
      console.log(`\u2713 Installed: ${shortName}`);
      console.log("");
      console.log(
        `Skill available in ${provider}. Restart to activate.`,
      );
    }
  } catch (err) {
    fmtError(err instanceof Error ? err.message : String(err));
  }
}
