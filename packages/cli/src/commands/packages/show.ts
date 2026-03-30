import { mpak } from "../../utils/config.js";
import { logger } from "../../utils/format.js";

export interface ShowOptions {
	json?: boolean;
}

const CERT_LEVEL_LABELS: Record<number, string> = {
	1: "L1 Basic",
	2: "L2 Verified",
	3: "L3 Hardened",
	4: "L4 Certified",
};

/**
 * Show detailed information about a bundle (v1 API)
 */
export async function handleShow(
	packageName: string,
	options: ShowOptions = {},
): Promise<void> {
	try {
		// Fetch bundle details and versions in parallel
		const [bundle, versionsInfo] = await Promise.all([
			mpak.client.getBundle(packageName),
			mpak.client.getBundleVersions(packageName),
		]);

		if (options.json) {
			console.log(
				JSON.stringify(
					{ ...bundle, versions_detail: versionsInfo.versions },
					null,
					2,
				),
			);
			return;
		}

		// Header
		const verified = bundle.verified ? "\u2713 " : "";
		const provenance = bundle.provenance ? "\uD83D\uDD12 " : "";
		logger.info(
			`\n${verified}${provenance}${bundle.display_name || bundle.name} v${bundle.latest_version}\n`,
		);

		// Description
		if (bundle.description) {
			logger.info(bundle.description);
			logger.info("");
		}

		// Basic info
		logger.info("Bundle Information:");
		logger.info(`  Name: ${bundle.name}`);
		if (bundle.author?.name) {
			logger.info(`  Author: ${bundle.author.name}`);
		}
		if (bundle.server_type) {
			logger.info(`  Type: ${bundle.server_type}`);
		}
		if (bundle.license) {
			logger.info(`  License: ${bundle.license}`);
		}
		if (bundle.homepage) {
			logger.info(`  Homepage: ${bundle.homepage}`);
		}
		logger.info("");

		// Trust / Certification
		const certLevel = bundle.certification_level;
		const certification = bundle.certification;

		if (certLevel != null) {
			const label = CERT_LEVEL_LABELS[certLevel] ?? `L${certLevel}`;
			logger.info(`Trust: ${label}`);
			if (
				certification?.controls_passed != null &&
				certification?.controls_total != null
			) {
				logger.info(
					`  Controls: ${certification.controls_passed}/${certification.controls_total} passed`,
				);
			}
			logger.info("");
		}

		// Provenance info
		if (bundle.provenance) {
			logger.info("Provenance:");
			logger.info(`  Repository: ${bundle.provenance.repository}`);
			logger.info(`  Commit: ${bundle.provenance.sha.substring(0, 12)}`);
			logger.info(`  Provider: ${bundle.provenance.provider}`);
			logger.info("");
		}

		// Stats
		logger.info("Statistics:");
		logger.info(`  Downloads: ${bundle.downloads.toLocaleString()}`);
		logger.info(
			`  Published: ${new Date(bundle.published_at).toLocaleDateString()}`,
		);
		logger.info("");

		// Tools
		if (bundle.tools && bundle.tools.length > 0) {
			logger.info(`Tools (${bundle.tools.length}):`);
			for (const tool of bundle.tools) {
				logger.info(`  - ${tool.name}`);
				if (tool.description) {
					logger.info(`    ${tool.description}`);
				}
			}
			logger.info("");
		}

		// Versions with platforms
		if (versionsInfo.versions && versionsInfo.versions.length > 0) {
			logger.info(`Versions (${versionsInfo.versions.length}):`);
			const recentVersions = versionsInfo.versions.slice(0, 5);
			for (const version of recentVersions) {
				const date = new Date(version.published_at).toLocaleDateString();
				const downloads = version.downloads.toLocaleString();
				const isLatest =
					version.version === versionsInfo.latest ? " (latest)" : "";
				const provTag = version.provenance ? " \uD83D\uDD12" : "";

				// Format platforms
				const platformStrs = version.platforms.map((p) => `${p.os}-${p.arch}`);
				const platformsDisplay =
					platformStrs.length > 0 ? ` [${platformStrs.join(", ")}]` : "";

				logger.info(
					`  ${version.version}${isLatest}${provTag} - ${date} - ${downloads} downloads${platformsDisplay}`,
				);
			}
			if (versionsInfo.versions.length > 5) {
				logger.info(`  ... and ${versionsInfo.versions.length - 5} more`);
			}
			logger.info("");
		}

		// Available platforms for latest version
		const latestVersion = versionsInfo.versions.find(
			(v) => v.version === versionsInfo.latest,
		);
		if (latestVersion && latestVersion.platforms.length > 0) {
			logger.info("Available Platforms:");
			for (const platform of latestVersion.platforms) {
				logger.info(`  - ${platform.os}-${platform.arch}`);
			}
			logger.info("");
		}

		// Install instructions
		logger.info("Pull (download only):");
		logger.info(`  mpak pull ${bundle.name}`);
	} catch (error) {
		logger.error(
			error instanceof Error ? error.message : "Failed to get bundle details",
		);
	}
}
