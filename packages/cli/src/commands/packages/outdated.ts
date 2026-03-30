import { mpak } from '../../utils/config.js';
import { logger, table } from '../../utils/format.js';

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
  const cached = mpak.bundleCache.listCachedBundles();
  if (cached.length === 0) return [];

  const results: OutdatedEntry[] = [];

  await Promise.all(
    cached.map(async (bundle) => {
      try {
        const latest = await mpak.bundleCache.checkForUpdate(bundle.name, { force: true });
        if (latest) {
          results.push({
            name: bundle.name,
            current: bundle.version,
            latest,
            pulledAt: bundle.pulledAt,
          });
        }
      } catch {
        process.stderr.write(
          `=> Warning: could not check ${bundle.name} (may have been removed from registry)\n`,
        );
      }
    }),
  );

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function handleOutdated(options: OutdatedOptions = {}): Promise<void> {
  process.stderr.write('=> Checking for updates...\n');

  const outdated = await getOutdatedBundles();

  if (options.json) {
    console.log(JSON.stringify(outdated, null, 2));
    return;
  }

  if (outdated.length === 0) {
    logger.info('All cached bundles are up to date.');
    return;
  }

  logger.info(
    table(
      ['Bundle', 'Current', 'Latest', 'Pulled'],
      outdated.map((e) => [e.name, e.current, e.latest, e.pulledAt]),
    ),
  );
  logger.info(`\n${outdated.length} bundle(s) can be updated. Run 'mpak update' to update all.`);
}
