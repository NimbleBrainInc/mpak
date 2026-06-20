import type { Bundle, BundleSearchParamsInput } from '@nimblebrain/mpak-schemas';
import { mpak } from '../utils/config.js';
import { certLabel, logger, table, truncate } from '../utils/format.js';

export interface UnifiedSearchOptions {
  sort?: 'downloads' | 'recent' | 'name';
  limit?: number;
  offset?: number;
  json?: boolean;
}

/**
 * Search bundles in the registry
 */
export async function handleUnifiedSearch(
  query: string,
  options: UnifiedSearchOptions = {},
): Promise<void> {
  try {
    const client = mpak.client;

    const bundleParams: BundleSearchParamsInput = {
      q: query,
      ...(options.sort && { sort: options.sort }),
      ...(options.limit && { limit: options.limit }),
      ...(options.offset && { offset: options.offset }),
    };

    const bundleResult = await client.searchBundles(bundleParams);
    const bundleTotal = bundleResult.total;
    const bundles = bundleResult.bundles;

    // No results
    if (bundles.length === 0) {
      logger.info(`\nNo results found for "${query}"`);
      return;
    }

    // Sort results
    if (options.sort === 'downloads') {
      bundles.sort((a, b) => b.downloads - a.downloads);
    } else if (options.sort === 'name') {
      bundles.sort((a, b) => a.name.localeCompare(b.name));
    }

    // JSON output
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            results: bundles,
            totals: { bundles: bundleTotal },
          },
          null,
          2,
        ),
      );
      return;
    }

    // Summary
    logger.info(`\nFound ${bundleTotal} result(s) for "${query}":`);

    logger.info(`\nBundles (${bundleTotal}):\n`);
    const bundleRows = bundles.map((r: Bundle) => [
      r.name.length > 38 ? `${r.name.slice(0, 35)}...` : r.name,
      r.latest_version || '-',
      certLabel(r.certification_level),
      truncate(r.description ?? '', 40),
    ]);
    logger.info(table(['NAME', 'VERSION', 'TRUST', 'DESCRIPTION'], bundleRows));

    // Pagination hint
    const currentLimit = options.limit || 20;
    const currentOffset = options.offset || 0;
    if (bundleTotal > currentOffset + bundles.length) {
      logger.info(`\n  Use --offset ${currentOffset + currentLimit} to see more results.`);
    }

    logger.info('');
    logger.info('Use "mpak bundle show <name>" for details.');
  } catch (error) {
    logger.error(error instanceof Error ? error.message : 'Search failed');
  }
}
