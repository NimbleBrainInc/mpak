import { describe, expect, it } from "vitest";
import { run } from "./helpers.js";

/**
 * Integration smoke tests for skill search and show commands against the live registry.
 *
 * Run with: pnpm test -- tests/integration
 */

describe("skill search", () => {
  it("returns a valid response shape for a broad query", async () => {
    const { stdout, exitCode } = await run("skill search '' --json");

    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout);
    expect(Array.isArray(result.skills)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(result.pagination).toBeDefined();
  }, 15000);

  it("handles a nonsense query gracefully", async () => {
    const { stderr, exitCode } = await run("skill search xyznonexistent12345abc");

    expect(exitCode).toBe(0);
    expect(stderr).not.toContain("[Error]");
  }, 15000);
});

describe("skill show", () => {
  it("outputs valid JSON for a skill found via search", async () => {
    // Find a real skill name first so we don't hardcode registry state
    const searchRun = await run("skill search '' --json --limit 1");
    expect(searchRun.exitCode).toBe(0);
    const searchResult = JSON.parse(searchRun.stdout);

    if (searchResult.skills.length === 0) return; // nothing to show

    const skillName: string = searchResult.skills[0].name;

    const showRun = await run(`skill show ${skillName} --json`);
    expect(showRun.exitCode).toBe(0);
    const detail = JSON.parse(showRun.stdout);
    expect(detail.name).toBe(skillName);
    expect(detail.description).toBeTruthy();
  }, 15000);
});
