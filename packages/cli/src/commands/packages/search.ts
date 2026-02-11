import { table, certLabel, truncate, fmtError } from "../../utils/format.js";
import { createClient } from "../../utils/client.js";

export interface SearchOptions {
  type?: string;
  sort?: "downloads" | "recent" | "name";
  limit?: number;
  offset?: number;
  json?: boolean;
}

/**
 * Search bundles (v1 API)
 */
export async function handleSearch(
  query: string,
  options: SearchOptions = {},
): Promise<void> {
  try {
    const client = createClient();
    const params: Record<string, unknown> = { q: query };
    if (options.type) params["type"] = options.type;
    if (options.sort) params["sort"] = options.sort;
    if (options.limit) params["limit"] = options.limit;
    if (options.offset) params["offset"] = options.offset;
    const result = await client.searchBundles(params as Parameters<typeof client.searchBundles>[0]);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.bundles.length === 0) {
      console.log(`\nNo bundles found for "${query}"`);
      return;
    }

    console.log(`\nFound ${result.total} bundle(s) for "${query}":\n`);

    const rows = result.bundles.map((b) => [
      b.name,
      `v${b.latest_version}`,
      certLabel(b.certification_level),
      truncate(b.description || "", 50),
    ]);

    console.log(table(["NAME", "VERSION", "TRUST", "DESCRIPTION"], rows));
    console.log();

    if (result.pagination.has_more) {
      const nextOffset = (options.offset || 0) + (options.limit || 20);
      console.log(
        `More results available. Use --offset ${nextOffset} to see more.`,
      );
    }

    console.log('Use "mpak show <bundle>" for more details');
  } catch (error) {
    fmtError(error instanceof Error ? error.message : "Failed to search bundles");
  }
}
