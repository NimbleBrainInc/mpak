import { rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePackageSpec } from "@nimblebrain/mpak-sdk";
import { mpak } from "../../utils/config.js";
import { formatSize, logger } from "../../utils/format.js";

export interface PullOptions {
  output?: string;
  json?: boolean;
}

/**
 * Pull (download) a skill from the registry to disk.
 */
export async function handleSkillPull(
  skillSpec: string,
  options: PullOptions = {},
): Promise<void> {
  let outputPath: string | undefined;
  try {
    const { name, version } = parsePackageSpec(skillSpec);

    logger.info(
      `=> Fetching ${version ? `${name}@${version}` : `${name} (latest)`}...`,
    );

    const { data, metadata } = await mpak.client.downloadSkillBundle(
      name,
      version,
    );

    if (options.json) {
      console.log(JSON.stringify(metadata, null, 2));
      return;
    }

    logger.info(`   Version: ${metadata.version}`);
    logger.info(`   Size: ${formatSize(metadata.size)}`);

    const defaultFilename = `${name.replace("@", "").replace("/", "-")}-${metadata.version}.skill`;
    outputPath = options.output
      ? resolve(options.output)
      : resolve(defaultFilename);

    writeFileSync(outputPath, data);

    logger.info(`\n=> Skill downloaded successfully!`);
    logger.info(`   File: ${outputPath}`);
    logger.info(`   SHA256: ${metadata.sha256.substring(0, 16)}...`);
  } catch (error) {
    if (outputPath) {
      try { rmSync(outputPath, { force: true }); } catch (_e) { /* ignore */ }
    }
    logger.error(
      error instanceof Error ? error.message : "Failed to pull skill",
    );
  }
}
