import { mkdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, afterEach } from "vitest";
import { _resetMpakHome } from "../utils/cache.js";

/**
 * Sets up a temporary MPAK_HOME directory for test isolation.
 * Returns a ref object whose `.path` property holds the temp directory path.
 *
 * Automatically creates the directory before each test and cleans up after.
 */
export function useTempMpakHome(): { path: string } {
  const ref = { path: "" };
  const originalMpakHome = process.env["MPAK_HOME"];

  beforeEach(() => {
    ref.path = join(tmpdir(), `mpak-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(ref.path, { recursive: true });
    process.env["MPAK_HOME"] = ref.path;
    _resetMpakHome();
  });

  afterEach(() => {
    if (originalMpakHome !== undefined) {
      process.env["MPAK_HOME"] = originalMpakHome;
    } else {
      delete process.env["MPAK_HOME"];
    }
    _resetMpakHome();
    rmSync(ref.path, { recursive: true, force: true });
  });

  return ref;
}
