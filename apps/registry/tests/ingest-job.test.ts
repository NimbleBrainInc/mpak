/**
 * The ingest job entrypoint.
 *
 * This file held the watermark-advance decision, the run-status decision, the
 * overlap subtraction, and the resolved-concurrency memory re-check — every one
 * of them a fix from an earlier review round — and had no test at all. A
 * watermark freeze lived here undetected through five rounds of review for
 * exactly that reason.
 */

import { describe, expect, it } from 'vitest';
import { validateIngestMemory } from '../src/config.js';
import { parseArgs, summarizeRun } from '../src/jobs/ingest-mcp-registry.js';

describe('parseArgs', () => {
  it('defaults to an incremental, writing run', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, full: false });
  });

  it.each([
    ['--limit', 'x'],
    ['--limit', '0'],
    ['--limit', '-1'],
    ['--max-bundles', '1.5'],
    ['--concurrency', 'abc'],
  ])('rejects %s %s rather than coercing it', (flag, value) => {
    expect(() => parseArgs([flag, value])).toThrow(/requires a positive integer/);
  });

  it('rejects an unknown flag instead of ignoring it', () => {
    // A typo'd flag silently ignored on a nightly job is a run that did
    // something other than what the operator asked for.
    expect(() => parseArgs(['--dry-runn'])).toThrow(/Unknown flag/);
  });

  it('parses the trial-run combination', () => {
    expect(parseArgs(['--dry-run', '--max-bundles', '10', '--concurrency', '3'])).toEqual({
      dryRun: true,
      full: false,
      maxBundles: 10,
      concurrency: 3,
    });
  });
});

describe('summarizeRun', () => {
  const watermark = new Date('2026-07-01T00:00:00Z');

  it('records a clean run as completed', () => {
    expect(summarizeRun({ failed: 0, watermark })).toEqual({ status: 'completed', watermark });
  });

  it('records the watermark even when the run had failures', () => {
    // The regression this file exists for. Discarding the watermark on any
    // failure froze the window permanently: resolveSince would never see a
    // usable run again, so every subsequent night re-read an ever-widening
    // span. Status is for the operator; the watermark is for the next run.
    expect(summarizeRun({ failed: 3, watermark })).toEqual({ status: 'failed', watermark });
  });

  it('still surfaces the failure to the operator', () => {
    expect(summarizeRun({ failed: 1, watermark }).status).toBe('failed');
  });
});

describe('validateIngestMemory', () => {
  it('passes the shipped defaults', () => {
    // 2 x 400MB against a 1024MB budget.
    expect(validateIngestMemory(2)).toBeNull();
  });

  it('refuses a concurrency the budget cannot cover', () => {
    // The check the job runs against its *resolved* concurrency, because
    // --concurrency overrides config after startup validation has passed.
    expect(validateIngestMemory(8)).toMatch(/over INGEST_MEMORY_BUDGET_MB/);
  });
});
