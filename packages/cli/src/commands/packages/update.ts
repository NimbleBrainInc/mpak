import { downloadAndExtract, resolveBundle } from "../../utils/cache.js";
import { createClient } from "../../utils/client.js";
import { fmtError } from "../../utils/format.js";
import { getOutdatedBundles } from "./outdated.js";

export interface UpdateOptions {
  json?: boolean;
}

export async function handleUpdate(
  packageName: string | undefined,
  options: UpdateOptions = {},
): Promise<void> {
  const client = createClient();

  if (packageName) {
    // Update a single bundle
    const downloadInfo = await resolveBundle(packageName, client);
    const { version } = await downloadAndExtract(packageName, downloadInfo);
    if (options.json) {
      console.log(JSON.stringify({ name: packageName, version }, null, 2));
    } else {
      console.log(`Updated ${packageName} to ${version}`);
    }
    return;
  }

  // No name given — find and update all outdated bundles
  process.stderr.write("=> Checking for updates...\n");
  const outdated = await getOutdatedBundles();

  if (outdated.length === 0) {
    if (options.json) {
      console.log(JSON.stringify([], null, 2));
    } else {
      console.log("All cached bundles are up to date.");
    }
    return;
  }

  process.stderr.write(
    `=> ${outdated.length} bundle(s) to update\n`,
  );

  const updated: Array<{ name: string; from: string; to: string }> = [];

  const results = await Promise.allSettled(
    outdated.map(async (entry) => {
      const downloadInfo = await resolveBundle(entry.name, client);
      const { version } = await downloadAndExtract(entry.name, downloadInfo);
      return { name: entry.name, from: entry.current, to: version };
    }),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled") {
      updated.push(result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      process.stderr.write(`=> Failed to update ${outdated[i]!.name}: ${message}\n`);
    }
  }

  if (options.json) {
    console.log(JSON.stringify(updated, null, 2));
    return;
  }

  if (updated.length === 0) {
    fmtError("All updates failed.");
    process.exit(1);
  }

  for (const u of updated) {
    console.log(`Updated ${u.name}: ${u.from} -> ${u.to}`);
  }
}
