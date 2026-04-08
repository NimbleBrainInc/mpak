import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MpakClient } from '@nimblebrain/mpak-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSkillPull } from '../../src/commands/skills/pull.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:fs', () => ({ writeFileSync: vi.fn(), rmSync: vi.fn() }));

let mockDownloadSkillBundle: ReturnType<typeof vi.fn>;

vi.mock('../../src/utils/config.js', () => ({
  get mpak() {
    return {
      client: {
        downloadSkillBundle: mockDownloadSkillBundle,
      } as unknown as MpakClient,
    };
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const skillData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

const metadata = {
  name: '@scope/test-skill',
  version: '1.2.0',
  sha256: 'abcdef1234567890abcdef1234567890',
  size: 512_000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleSkillPull', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(writeFileSync).mockClear();
    vi.mocked(rmSync).mockClear();
    mockDownloadSkillBundle = vi.fn().mockResolvedValue({ data: skillData, metadata });
    stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls downloadSkillBundle with parsed name and version', async () => {
    await handleSkillPull('@scope/test-skill@1.2.0');

    expect(mockDownloadSkillBundle).toHaveBeenCalledWith('@scope/test-skill', '1.2.0');
  });

  it('passes undefined version when none specified', async () => {
    await handleSkillPull('@scope/test-skill');

    expect(mockDownloadSkillBundle).toHaveBeenCalledWith('@scope/test-skill', undefined);
  });

  it('writes downloaded data to default filename in cwd', async () => {
    await handleSkillPull('@scope/test-skill');

    expect(writeFileSync).toHaveBeenCalledWith(resolve('scope-test-skill-1.2.0.skill'), skillData);
  });

  it('writes to --output path when specified', async () => {
    await handleSkillPull('@scope/test-skill', {
      output: '/tmp/my-skill.skill',
    });

    expect(writeFileSync).toHaveBeenCalledWith('/tmp/my-skill.skill', skillData);
  });

  it('prints metadata in normal output', async () => {
    await handleSkillPull('@scope/test-skill');

    const allOutput = stderrSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
    expect(allOutput).toContain('Version: 1.2.0');
    expect(allOutput).toContain('downloaded successfully');
    expect(allOutput).toContain('SHA256: abcdef1234567890...');
  });

  it('prints JSON and skips file write when --json is set', async () => {
    await handleSkillPull('@scope/test-skill', { json: true });

    expect(writeFileSync).not.toHaveBeenCalled();
    const jsonCall = stdoutSpy.mock.calls.find((c: unknown[]) => {
      try {
        JSON.parse(c[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();
    const parsed = JSON.parse((jsonCall as unknown[])[0] as string);
    expect(parsed.version).toBe('1.2.0');
  });

  it('cleans up partial file on error after write started', async () => {
    vi.mocked(writeFileSync).mockImplementation(() => {
      throw new Error('Disk full');
    });

    await handleSkillPull('@scope/test-skill');

    expect(rmSync).toHaveBeenCalledWith(resolve('scope-test-skill-1.2.0.skill'), { force: true });
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Disk full'));
  });

  it('logs error when downloadSkillBundle throws', async () => {
    mockDownloadSkillBundle.mockRejectedValue(new Error('Skill not found'));

    await handleSkillPull('@scope/nonexistent');

    expect(rmSync).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Skill not found'));
  });
});
