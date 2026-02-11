import { table, truncate, fmtError } from "../../utils/format.js";
import { createClient } from "../../utils/client.js";

export interface SearchOptions {
  tags?: string;
  category?: string;
  sort?: string;
  limit?: number;
  offset?: number;
  json?: boolean;
}

/**
 * Handle the skill search command
 */
export async function handleSkillSearch(
  query: string,
  options: SearchOptions,
): Promise<void> {
  try {
    const client = createClient();
    const params: Record<string, unknown> = { q: query };
    if (options.tags) params["tags"] = options.tags;
    if (options.category) params["category"] = options.category;
    if (options.sort) params["sort"] = options.sort;
    if (options.limit) params["limit"] = options.limit;
    if (options.offset) params["offset"] = options.offset;
    const result = await client.searchSkills(params as Parameters<typeof client.searchSkills>[0]);

    if (options.json) {
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

    console.log(
      table(["NAME", "VERSION", "CATEGORY", "DESCRIPTION"], rows),
    );

    if (result.pagination.has_more) {
      console.log();
      console.log(
        `Showing ${result.skills.length} of ${result.total} results. Use --offset to see more.`,
      );
    }
  } catch (err) {
    fmtError(err instanceof Error ? err.message : String(err));
  }
}
