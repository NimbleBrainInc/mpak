import { MpakNetworkError, MpakNotFoundError } from "@nimblebrain/mpak-sdk";
import { mpak } from "../../utils/config.js";
import { logger } from "../../utils/format.js";
import { getOutdatedBundles } from "./outdated.js";

export interface UpdateOptions {
	json?: boolean;
}

async function forceUpdateBundle(
	name: string,
): Promise<{ name: string; version: string }> {
	try {
		const { version } = await mpak.bundleCache.loadBundle(name, {
			force: true,
		});
		return { name, version };
	} catch (err) {
		if (err instanceof MpakNotFoundError) {
			throw new Error(`Bundle "${name}" not found in the registry`);
		}
		if (err instanceof MpakNetworkError) {
			throw new Error(`Network error updating "${name}": ${err.message}`);
		}
		throw err;
	}
}

export async function handleUpdate(
	packageName: string | undefined,
	options: UpdateOptions = {},
): Promise<void> {
	if (packageName) {
		const { version } = await forceUpdateBundle(packageName);
		if (options.json) {
			console.log(JSON.stringify({ name: packageName, version }, null, 2));
		} else {
			logger.info(`Updated ${packageName} to ${version}`);
		}
		return;
	}

	// No name given — find and update all outdated bundles
	logger.info("=> Checking for updates...");
	const outdated = await getOutdatedBundles();

	if (outdated.length === 0) {
		if (options.json) {
			console.log(JSON.stringify([], null, 2));
		} else {
			logger.info("All cached bundles are up to date.");
		}
		return;
	}

	logger.info(`=> ${outdated.length} bundle(s) to update`);

	const updated: Array<{ name: string; from: string; to: string }> = [];

	const results = await Promise.allSettled(
		outdated.map(async (entry) => {
			const { version } = await forceUpdateBundle(entry.name);
			return { name: entry.name, from: entry.current, to: version };
		}),
	);

	for (const [i, result] of results.entries()) {
		if (result.status === "fulfilled") {
			updated.push(result.value);
		} else {
			const message =
				result.reason instanceof Error
					? result.reason.message
					: String(result.reason);
			logger.info(`=> Failed to update ${outdated[i]!.name}: ${message}`);
		}
	}

	if (updated.length === 0) {
		logger.error("All updates failed");
		process.exit(1);
	}

	if (options.json) {
		console.log(JSON.stringify(updated, null, 2));
	} else {
		for (const u of updated) {
			logger.info(`Updated ${u.name}: ${u.from} -> ${u.to}`);
		}
	}
}
