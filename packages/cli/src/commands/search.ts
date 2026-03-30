import type {
	Bundle,
	BundleSearchParamsInput,
	SkillSearchParamsInput,
	SkillSummary,
} from "@nimblebrain/mpak-schemas";
import { mpak } from "../utils/config.js";
import { certLabel, logger, table, truncate } from "../utils/format.js";

export interface UnifiedSearchOptions {
	type?: "bundle" | "skill";
	sort?: "downloads" | "recent" | "name";
	limit?: number;
	offset?: number;
	json?: boolean;
}

type UnifiedResult =
	| (Bundle & { type: "bundle" })
	| (SkillSummary & { type: "skill" });

/**
 * Unified search across bundles and skills
 */
export async function handleUnifiedSearch(
	query: string,
	options: UnifiedSearchOptions = {},
): Promise<void> {
	try {
		const client = mpak.client;
		const results: UnifiedResult[] = [];
		let bundleTotal = 0;
		let skillTotal = 0;

		// Search both in parallel (unless filtered by type)
		const searchBundles = !options.type || options.type === "bundle";
		const searchSkillsFlag = !options.type || options.type === "skill";

		const bundleParams: BundleSearchParamsInput = {
			q: query,
			...(options.sort && { sort: options.sort }),
			...(options.limit && { limit: options.limit }),
			...(options.offset && { offset: options.offset }),
		};

		const skillParams: SkillSearchParamsInput = {
			q: query,
			...(options.sort && { sort: options.sort }),
			...(options.limit && { limit: options.limit }),
			...(options.offset && { offset: options.offset }),
		};

		const [bundleResult, skillResult] = await Promise.all([
			searchBundles ? client.searchBundles(bundleParams) : null,
			searchSkillsFlag ? client.searchSkills(skillParams) : null,
		]);

		if (bundleResult) {
			bundleTotal = bundleResult.total;
			for (const bundle of bundleResult.bundles) {
				results.push({ type: "bundle", ...bundle });
			}
		}

		if (skillResult) {
			skillTotal = skillResult.total;
			for (const skill of skillResult.skills) {
				results.push({ type: "skill", ...skill });
			}
		}

		// No results
		if (results.length === 0) {
			logger.info(`\nNo results found for "${query}"`);
			if (!searchBundles) logger.info("  (searched skills only)");
			if (!searchSkillsFlag) logger.info("  (searched bundles only)");
			return;
		}

		// Sort combined results
		if (options.sort === "downloads") {
			results.sort((a, b) => b.downloads - a.downloads);
		} else if (options.sort === "name") {
			results.sort((a, b) => a.name.localeCompare(b.name));
		}

		// JSON output
		if (options.json) {
			console.log(
				JSON.stringify(
					{
						results,
						totals: { bundles: bundleTotal, skills: skillTotal },
					},
					null,
					2,
				),
			);
			return;
		}

		// Summary
		const totalResults = bundleTotal + skillTotal;
		const typeFilter = options.type ? ` (${options.type}s only)` : "";
		logger.info(
			`\nFound ${totalResults} result(s) for "${query}"${typeFilter}:`,
		);

		const bundles = results.filter(
			(r): r is Bundle & { type: "bundle" } => r.type === "bundle",
		);
		const skills = results.filter(
			(r): r is SkillSummary & { type: "skill" } => r.type === "skill",
		);

		// Bundles section
		if (bundles.length > 0) {
			logger.info(`\nBundles (${bundleTotal}):\n`);
			const bundleRows = bundles.map((r) => [
				r.name.length > 38 ? `${r.name.slice(0, 35)}...` : r.name,
				r.latest_version || "-",
				certLabel(r.certification_level),
				truncate(r.description ?? "", 40),
			]);
			logger.info(table(["NAME", "VERSION", "TRUST", "DESCRIPTION"], bundleRows));
		}

		// Skills section
		if (skills.length > 0) {
			logger.info(`\nSkills (${skillTotal}):\n`);
			const skillRows = skills.map((r) => [
				r.name.length > 38 ? `${r.name.slice(0, 35)}...` : r.name,
				r.latest_version || "-",
				r.category || "-",
				truncate(r.description, 40),
			]);
			logger.info(
				table(["NAME", "VERSION", "CATEGORY", "DESCRIPTION"], skillRows),
			);
		}

		// Pagination hint
		const currentLimit = options.limit || 20;
		const currentOffset = options.offset || 0;
		if (bundleTotal + skillTotal > currentOffset + results.length) {
			logger.info(
				`\n  Use --offset ${currentOffset + currentLimit} to see more results.`,
			);
		}

		logger.info("");
		logger.info(
			'Use "mpak bundle show <name>" or "mpak skill show <name>" for details.',
		);
	} catch (error) {
		logger.error(error instanceof Error ? error.message : "Search failed");
	}
}
