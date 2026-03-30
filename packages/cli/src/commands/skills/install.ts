import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { parsePackageSpec } from "@nimblebrain/mpak-sdk";
import { mpak } from "../../utils/config.js";
import { formatSize, logger } from "../../utils/format.js";

/**
 * Get the Claude Code skills directory
 */
function getSkillsDir(): string {
  return join(homedir(), ".claude", "skills");
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
}

/**
 * Handle the skill install command
 */
export async function handleSkillInstall(
  skillSpec: string,
  options: InstallOptions = {},
): Promise<void> {
  try {
    const { name, version } = parsePackageSpec(skillSpec);

    logger.info(
      `=> Fetching ${version ? `${name}@${version}` : `${name} (latest)`}...`,
    );

    const { data, metadata } = await mpak.client.downloadSkillBundle(
      name,
      version,
    );

    const shortName = getShortName(metadata.name);
    const skillsDir = getSkillsDir();
    const installPath = join(skillsDir, shortName);

    // Check if already installed
    if (existsSync(installPath) && !options.force) {
      logger.error(
        `Skill "${shortName}" is already installed at ${installPath}`,
      );
      logger.error("Use --force to overwrite");
      process.exit(1);
    }

    logger.info(`   Version: ${metadata.version}`);
    logger.info(`   Size: ${formatSize(metadata.size)}`);

    // Ensure skills directory exists
    mkdirSync(skillsDir, { recursive: true });

    // Write to temp file for extraction
    const tempPath = join(tmpdir(), `skill-${Date.now()}.skill`);
    writeFileSync(tempPath, data);

    // Remove existing installation if force
    if (existsSync(installPath)) {
      rmSync(installPath, { recursive: true });
    }

    // Extract using unzip
    try {
      execFileSync("unzip", ["-o", tempPath, "-d", skillsDir], {
        stdio: "pipe",
      });
    } catch (err) {
      throw new Error(`Failed to extract skill bundle: ${err}`);
    } finally {
      rmSync(tempPath, { force: true });
    }

    if (options.json) {
      console.log(
        JSON.stringify(
          {
            installed: true,
            name: metadata.name,
            shortName,
            version: metadata.version,
            path: installPath,
          },
          null,
          2,
        ),
      );
    } else {
      logger.info(`\n=> Installed to ${installPath}/`);
      logger.info(`   \u2713 ${shortName}@${metadata.version}`);
      logger.info("");
      logger.info(
        "Skill available in Claude Code. Restart to activate.",
      );
    }
  } catch (err) {
    logger.error(
      err instanceof Error ? err.message : "Failed to install skill",
    );
  }
}
