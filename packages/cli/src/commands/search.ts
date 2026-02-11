import { table, certLabel, truncate, fmtError } from "../utils/format.js";
import { createClient } from "../utils/client.js";

export interface UnifiedSearchOptions {
  type?: "bundle" | "skill";
  sort?: "downloads" | "recent" | "name";
  limit?: number;
  offset?: number;
  json?: boolean;
}

interface UnifiedResult {
  type: "bundle" | "skill";
  name: string;
  description: string;
  downloads: number;
  version: string;
  author?: string | undefined;
  certLevel?: number | null | undefined;
  // Bundle-specific
  serverType?: string | undefined;
  verified?: boolean | undefined;
  provenance?: boolean | undefined;
  // Skill-specific
  category?: string | undefined;
}

/**
 * Unified search across bundles and skills
 */
export async function handleUnifiedSearch(
  query: string,
  options: UnifiedSearchOptions = {},
): Promise<void> {
  try {
    const client = createClient();
    const results: UnifiedResult[] = [];
    let bundleTotal = 0;
    let skillTotal = 0;

    // Search both in parallel (unless filtered by type)
    const searchBundles = !options.type || options.type === "bundle";
    const searchSkillsFlag = !options.type || options.type === "skill";

    const searchParams: Record<string, unknown> = { q: query };
    if (options.sort) searchParams["sort"] = options.sort;
    if (options.limit) searchParams["limit"] = options.limit;
    if (options.offset) searchParams["offset"] = options.offset;

    const [bundleResult, skillResult] = await Promise.all([
      searchBundles
        ? client.searchBundles(searchParams as Parameters<typeof client.searchBundles>[0])
        : null,
      searchSkillsFlag
        ? client
            .searchSkills(searchParams as Parameters<typeof client.searchSkills>[0])
            .catch(() => null) // Skills API may not be deployed yet
        : null,
    ]);

    // Process bundle results
    if (bundleResult) {
      bundleTotal = bundleResult.total;
      for (const bundle of bundleResult.bundles) {
        results.push({
          type: "bundle",
          name: bundle.name,
          description: bundle.description || "",
          downloads: bundle.downloads || 0,
          version: bundle.latest_version,
          author: bundle.author?.name || undefined,
          certLevel: bundle.certification_level,
          serverType: bundle.server_type || undefined,
          verified: bundle.verified,
          provenance: !!bundle.provenance,
        });
      }
    }

    // Process skill results
    if (skillResult) {
      skillTotal = skillResult.total;
      for (const skill of skillResult.skills) {
        results.push({
          type: "skill",
          name: skill.name,
          description: skill.description || "",
          downloads: skill.downloads || 0,
          version: skill.latest_version,
          author: skill.author?.name || undefined,
          category: skill.category || undefined,
        });
      }
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

    // No results
    if (results.length === 0) {
      console.log(`\nNo results found for "${query}"`);
      if (!searchBundles) console.log("  (searched skills only)");
      if (!searchSkillsFlag) console.log("  (searched bundles only)");
      return;
    }

    // Summary
    const totalResults = bundleTotal + skillTotal;
    const typeFilter = options.type ? ` (${options.type}s only)` : "";
    console.log(
      `\nFound ${totalResults} result(s) for "${query}"${typeFilter}:`,
    );

    const bundles = results.filter((r) => r.type === "bundle");
    const skills = results.filter((r) => r.type === "skill");

    // Bundles section
    if (bundles.length > 0) {
      console.log(`\nBundles (${bundleTotal}):\n`);
      const bundleRows = bundles.map((r) => [
        r.name.length > 38 ? r.name.slice(0, 35) + "..." : r.name,
        r.version || "-",
        certLabel(r.certLevel),
        truncate(r.description, 40),
      ]);
      console.log(table(["NAME", "VERSION", "TRUST", "DESCRIPTION"], bundleRows));
    }

    // Skills section
    if (skills.length > 0) {
      console.log(`\nSkills (${skillTotal}):\n`);
      const skillRows = skills.map((r) => [
        r.name.length > 38 ? r.name.slice(0, 35) + "..." : r.name,
        r.version || "-",
        r.category || "-",
        truncate(r.description, 40),
      ]);
      console.log(table(["NAME", "VERSION", "CATEGORY", "DESCRIPTION"], skillRows));
    }

    // Pagination hint
    const currentLimit = options.limit || 20;
    const currentOffset = options.offset || 0;
    if (bundleTotal + skillTotal > currentOffset + results.length) {
      console.log(
        `\n  Use --offset ${currentOffset + currentLimit} to see more results.`,
      );
    }

    console.log();
    console.log(
      'Use "mpak bundle show <name>" or "mpak skill show <name>" for details.',
    );
  } catch (error) {
    fmtError(error instanceof Error ? error.message : "Search failed");
  }
}
