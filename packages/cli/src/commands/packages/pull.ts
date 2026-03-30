import { rmSync, writeFileSync } from "fs";
import { resolve } from "path";
import { MpakClient, parsePackageSpec } from "@nimblebrain/mpak-sdk";
import { mpak } from "../../utils/config.js";
import { formatSize, logger } from "../../utils/format.js";

export interface PullOptions {
	output?: string;
	json?: boolean;
	os?: string;
	arch?: string;
}

/**
 * Pull (download) a bundle from the registry to disk.
 */
export async function handlePull(
	packageSpec: string,
	options: PullOptions = {},
): Promise<void> {
	let outputPath: string | undefined;
	try {
		const { name, version } = parsePackageSpec(packageSpec);

		const detectedPlatform = MpakClient.detectPlatform();
		const platform = {
			os: options.os || detectedPlatform.os,
			arch: options.arch || detectedPlatform.arch,
		};

		console.log(
			`=> Fetching ${version ? `${name}@${version}` : `${name} (latest)`}...`,
		);
		console.log(`   Platform: ${platform.os}-${platform.arch}`);

		const { data, metadata } = await mpak.client.downloadBundle(
			name,
			version,
			platform,
		);

		if (options.json) {
			console.log(JSON.stringify(metadata, null, 2));
			return;
		}

		console.log(`   Version: ${metadata.version}`);
		console.log(
			`   Artifact: ${metadata.platform.os}-${metadata.platform.arch}`,
		);
		console.log(`   Size: ${formatSize(metadata.size)}`);

		const platformSuffix = `${metadata.platform.os}-${metadata.platform.arch}`;
		const defaultFilename = `${name.replace("@", "").replace("/", "-")}-${metadata.version}-${platformSuffix}.mcpb`;
		outputPath = options.output
			? resolve(options.output)
			: resolve(defaultFilename);

		console.log(`\n=> Downloading to ${outputPath}...`);
		writeFileSync(outputPath, data);

		console.log(`\n=> Bundle downloaded successfully!`);
		console.log(`   File: ${outputPath}`);
		console.log(`   SHA256: ${metadata.sha256.substring(0, 16)}...`);
	} catch (error) {
		if (outputPath) {
			try { rmSync(outputPath, { force: true }); } catch (_e) { /* ignore */ }
		}
		logger.error(
			error instanceof Error ? error.message : "Failed to pull bundle",
		);
	}
}
