import { listCachedBundles } from "../../utils/cache.js";
import { createClient } from "../../utils/client.js";
import { table } from "../../utils/format.js";

export interface OutdatedEntry {
  name: string;
  current: string;
  latest: string;
  pulledAt: string;
}

export interface OutdatedOptions {
  json?: boolean;
}

/**
 * Check all cached registry bundles against the registry and return those
 * that have a newer version available.
 */
export async function getOutdatedBundles(): Promise<OutdatedEntry[]> {
  const cached = listCachedBundles();
  if (cached.length === 0) return [];

  const client = createClient();
  const results: OutdatedEntry[] = [];

  await Promise.all(
    cached.map(async (bundle) => {
      try {
        const detail = await client.getBundle(bundle.name);
        if (detail.latest_version !== bundle.version) {
          results.push({
            name: bundle.name,
            current: bundle.version,
            latest: detail.latest_version,
            pulledAt: bundle.pulledAt,
          });
        }
      } catch {
        // Skip bundles that fail to resolve (e.g. deleted from registry)
      }
    }),
  );

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function handleOutdated(options: OutdatedOptions = {}): Promise<void> {
  process.stderr.write("=> Checking for updates...\n");

  const outdated = await getOutdatedBundles();

  if (options.json) {
    console.log(JSON.stringify(outdated, null, 2));
    return;
  }

  if (outdated.length === 0) {
    console.log("All cached bundles are up to date.");
    return;
  }

  console.log(
    table(
      ["Bundle", "Current", "Latest", "Pulled"],
      outdated.map((e) => [e.name, e.current, e.latest, e.pulledAt]),
    ),
  );
  console.log(`\n${outdated.length} bundle(s) can be updated. Run 'mpak update' to update all.`);
}
