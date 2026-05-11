import { createInterface } from 'node:readline';
import { existsSync, rmSync } from 'node:fs';
import { mpak } from '../../utils/config.js';
import { formatSize, logger } from '../../utils/format.js';

export interface CacheClearOptions {
  force?: boolean;
}

async function confirmPrompt(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function handleCacheClear(
  options: CacheClearOptions = {},
  _confirm = confirmPrompt,
): Promise<void> {
  const info = mpak.bundleCache.getCacheInfo();
  const entryCount = info.registryBundles.length + info.localBundles.length;

  if (entryCount === 0) {
    logger.info('Cache is already empty.');
    return;
  }

  const sizeStr = formatSize(info.totalBytes);
  const summary = `${entryCount} bundle(s), ${sizeStr}`;

  if (!options.force) {
    const ok = await _confirm(`Clear the entire cache (${summary})? [y/N] `);
    if (!ok) {
      logger.info('Aborted.');
      return;
    }
  }

  const cacheHome = mpak.bundleCache.cacheHome;
  if (existsSync(cacheHome)) {
    rmSync(cacheHome, { recursive: true, force: true });
  }

  logger.info(`Cleared cache. Freed ${sizeStr}.`);
}
