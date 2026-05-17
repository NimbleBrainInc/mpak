import { mpak } from '../../utils/config.js';
import { formatSize, logger, table } from '../../utils/format.js';

export interface CacheInfoOptions {
  json?: boolean;
}

export async function handleCacheInfo(options: CacheInfoOptions = {}): Promise<void> {
  const info = mpak.bundleCache.getCacheInfo();

  if (options.json) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  if (info.registryBundles.length === 0 && info.localBundles.length === 0) {
    logger.info('Cache is empty.');
    return;
  }

  if (info.registryBundles.length > 0) {
    logger.info('Registry bundles:\n');
    logger.info(
      table(
        ['Bundle', 'Version', 'Pulled', 'Size'],
        info.registryBundles.map((b) => [
          b.name,
          b.version,
          b.pulledAt.slice(0, 10),
          formatSize(b.bytes),
        ]),
        { rightAlign: [3] },
      ),
    );
    logger.info('');
  }

  if (info.localBundles.length > 0) {
    logger.info('Local bundles:\n');
    logger.info(
      table(
        ['Path', 'Extracted', 'Size'],
        info.localBundles.map((b) => [
          b.localPath,
          b.extractedAt.slice(0, 10),
          formatSize(b.bytes),
        ]),
        { rightAlign: [2] },
      ),
    );
    logger.info('');
  }

  logger.info(`Total: ${formatSize(info.totalBytes)}`);
}
