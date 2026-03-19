import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getOutdatedBundles } from "../../src/commands/packages/outdated.js";
import { handleUpdate } from "../../src/commands/packages/update.js";
import {
  getCacheDir,
  getCacheMetadata,
  downloadAndExtract,
  resolveBundle,
} from "../../src/utils/cache.js";
import { createClient } from "../../src/utils/client.js";

/**
 * Integration test for the outdated → update flow.
 *
 * Uses the live registry with @nimblebraininc/echo as a fixture.
 * Downgrades cached metadata to simulate an outdated bundle, then
 * verifies that outdated detection and update work end-to-end.
 *
 * Run with: pnpm test -- tests/integration
 */
describe("Update Flow Integration", () => {
  const testBundle = "@nimblebraininc/echo";
  let originalMeta: string | null = null;
  let metaPath: string;

  afterEach(() => {
    // Restore original metadata if we modified it
    if (originalMeta && metaPath) {
      writeFileSync(metaPath, originalMeta);
    }
  });

  it("should detect outdated bundle and update it", async () => {
    const client = createClient();

    // 1. Ensure bundle is cached (pull latest if not already cached)
    const cacheDir = getCacheDir(testBundle);
    let meta = getCacheMetadata(cacheDir);
    if (!meta) {
      const downloadInfo = await resolveBundle(testBundle, client);
      await downloadAndExtract(testBundle, downloadInfo);
      meta = getCacheMetadata(cacheDir)!;
    }

    // 2. Save original metadata for cleanup
    metaPath = join(cacheDir, ".mpak-meta.json");
    originalMeta = readFileSync(metaPath, "utf8");
    const realVersion = meta.version;

    // 3. Downgrade version in metadata
    const downgraded = { ...meta, version: "0.0.1" };
    writeFileSync(metaPath, JSON.stringify(downgraded));

    // 4. Verify outdated detects it
    const outdated = await getOutdatedBundles();
    const entry = outdated.find((e) => e.name === testBundle);
    expect(entry).toBeDefined();
    expect(entry!.current).toBe("0.0.1");
    expect(entry!.latest).toBe(realVersion);

    // 5. Run update
    await handleUpdate(testBundle);

    // 6. Verify no longer outdated
    const afterUpdate = await getOutdatedBundles();
    const stillOutdated = afterUpdate.find((e) => e.name === testBundle);
    expect(stillOutdated).toBeUndefined();
  }, 30000);
});
