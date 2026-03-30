import type { BundleSearchParamsInput } from "@nimblebrain/mpak-schemas";
import { mpak } from "../../utils/config.js";
import { certLabel, logger, table, truncate } from "../../utils/format.js";

export type SearchOptions = Omit<BundleSearchParamsInput, "q"> & {
	json?: boolean;
};

/**
 * Search bundles (v1 API)
 */
export async function handleSearch(
	query: string,
	options: SearchOptions = {},
): Promise<void> {
	try {
		const result = await mpak.client.searchBundles({
			q: query,
			...options,
		});

		if (result.bundles.length === 0) {
			logger.info(`\nNo bundles found for "${query}"`);
			return;
		}

		logger.info(`\nFound ${result.total} bundle(s) for "${query}":\n`);

		if (options.json) {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		const rows = result.bundles.map((b) => [
			b.name,
			`v${b.latest_version}`,
			certLabel(b.certification_level),
			truncate(b.description || "", 50),
		]);

		logger.info(table(["NAME", "VERSION", "TRUST", "DESCRIPTION"], rows));
		logger.info("");

		if (result.pagination.has_more) {
			const nextOffset = (options.offset || 0) + (options.limit || 20);
			logger.info(
				`More results available. Use --offset ${nextOffset} to see more.`,
			);
		}

		logger.info('Use "mpak show <bundle>" for more details');
	} catch (error) {
		logger.error(
			error instanceof Error ? error.message : "Failed to search bundles",
		);
	}
}
