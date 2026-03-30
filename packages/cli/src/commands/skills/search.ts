import type { SkillSearchParamsInput } from "@nimblebrain/mpak-schemas";
import { mpak } from "../../utils/config.js";
import { logger, table, truncate } from "../../utils/format.js";

export type SearchOptions = SkillSearchParamsInput & { json?: boolean };

export async function handleSkillSearch(
	query: string,
	options: SearchOptions,
): Promise<void> {
	try {
		const { json, ...searchParams } = options;
		const result = await mpak.client.searchSkills({
			q: query,
			...searchParams,
		});

		if (json) {
			console.log(JSON.stringify(result, null, 2));
			return;
		}

		if (result.skills.length === 0) {
			console.log(`No skills found for "${query}"`);
			return;
		}

		console.log();

		const rows = result.skills.map((s) => [
			s.name.length > 42 ? s.name.slice(0, 39) + "..." : s.name,
			s.latest_version || "-",
			s.category || "-",
			truncate(s.description || "", 40),
		]);

		console.log(table(["NAME", "VERSION", "CATEGORY", "DESCRIPTION"], rows));

		if (result.pagination.has_more) {
			console.log();
			console.log(
				`Showing ${result.skills.length} of ${result.total} results. Use --offset to see more.`,
			);
		}
	} catch (err) {
		logger.error(err instanceof Error ? err.message : String(err));
	}
}
