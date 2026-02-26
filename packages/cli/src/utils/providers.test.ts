import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { homedir } from "os";

// Mock fs.existsSync before importing the module
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...(actual as object),
    existsSync: vi.fn(
      (actual as Record<string, unknown>).existsSync as () => boolean,
    ),
  };
});

const getProviderMock = vi.fn();

// Mock config-manager with a proper class
vi.mock("./config-manager.js", () => {
  return {
    ConfigManager: class MockConfigManager {
      getProvider() {
        return getProviderMock();
      }
      loadConfig() {
        return {
          version: "1.0.0",
          lastUpdated: new Date().toISOString(),
        };
      }
    },
  };
});

import { existsSync } from "fs";
import {
  detectProviders,
  getProviderNames,
  getSkillsDir,
  isValidProvider,
  resolveProvider,
} from "./providers.js";

const mockedExistsSync = vi.mocked(existsSync);

describe("providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["MPAK_PROVIDER"];
  });

  afterEach(() => {
    delete process.env["MPAK_PROVIDER"];
  });

  // =========================================================================
  // Structural invariants — catch real bugs when someone edits the maps
  // =========================================================================

  describe("provider map alignment", () => {
    it("every provider in PROVIDERS has a corresponding detection parent", () => {
      // If someone adds a provider to PROVIDERS but forgets PROVIDER_PARENTS,
      // detectProviders() will never find it. This test catches that.
      const names = getProviderNames();
      for (const name of names) {
        // detectProviders checks PROVIDER_PARENTS, so simulate "all exist"
        mockedExistsSync.mockReturnValue(true);
        const detected = detectProviders();
        expect(
          detected,
          `Provider "${name}" exists in PROVIDERS but not in PROVIDER_PARENTS`,
        ).toContain(name);
      }
    });

    it("every provider has a skills dir ending in /skills", () => {
      for (const name of getProviderNames()) {
        const dir = getSkillsDir(name);
        expect(
          dir.endsWith("/skills") || dir.endsWith("\\skills"),
          `${name}'s skills dir "${dir}" doesn't end with /skills`,
        ).toBe(true);
      }
    });

    it("every provider's skills dir is under homedir", () => {
      const home = homedir();
      for (const name of getProviderNames()) {
        const dir = getSkillsDir(name);
        expect(
          dir.startsWith(home),
          `${name}'s skills dir "${dir}" is not under ${home}`,
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // isValidProvider — boundary cases
  // =========================================================================

  describe("isValidProvider", () => {
    it("rejects names with wrong casing", () => {
      expect(isValidProvider("Claude")).toBe(false);
      expect(isValidProvider("CURSOR")).toBe(false);
    });

    it("rejects names that are substrings of valid providers", () => {
      expect(isValidProvider("claud")).toBe(false);
      expect(isValidProvider("cursors")).toBe(false);
    });

    it("rejects prototype pollution keys", () => {
      expect(isValidProvider("constructor")).toBe(false);
      expect(isValidProvider("__proto__")).toBe(false);
      expect(isValidProvider("toString")).toBe(false);
    });
  });

  // =========================================================================
  // detectProviders — filesystem interaction
  // =========================================================================

  describe("detectProviders", () => {
    it("returns empty when nothing exists", () => {
      mockedExistsSync.mockReturnValue(false);
      expect(detectProviders()).toEqual([]);
    });

    it("returns all providers when all parent dirs exist", () => {
      mockedExistsSync.mockReturnValue(true);
      const detected = detectProviders();
      expect(detected).toEqual(getProviderNames());
    });

    it("checks the parent dir, not the skills dir itself", () => {
      // goose skills dir is ~/.config/agents/skills
      // detection should check ~/.config/goose, NOT ~/.config/agents/skills
      const calledPaths: string[] = [];
      mockedExistsSync.mockImplementation((p) => {
        calledPaths.push(String(p));
        return false;
      });
      detectProviders();

      // Verify no checked path ends with /skills
      for (const p of calledPaths) {
        expect(
          p.endsWith("/skills") || p.endsWith("\\skills"),
          `detectProviders checked skills dir directly: ${p}`,
        ).toBe(false);
      }
    });

    it("only checks the expected number of paths (one per provider)", () => {
      mockedExistsSync.mockReturnValue(false);
      detectProviders();
      expect(mockedExistsSync).toHaveBeenCalledTimes(
        getProviderNames().length,
      );
    });
  });

  // =========================================================================
  // resolveProvider — priority chain semantics
  // =========================================================================

  describe("resolveProvider priority chain", () => {
    it("explicit flag beats everything else", () => {
      process.env["MPAK_PROVIDER"] = "copilot";
      getProviderMock.mockReturnValue("gemini");
      mockedExistsSync.mockReturnValue(true); // all providers detected

      const result = resolveProvider("cursor");
      expect(result.provider).toBe("cursor");
    });

    it("env var beats config and detection", () => {
      process.env["MPAK_PROVIDER"] = "copilot";
      getProviderMock.mockReturnValue("gemini");
      mockedExistsSync.mockReturnValue(true);

      const result = resolveProvider();
      expect(result.provider).toBe("copilot");
    });

    it("config beats detection", () => {
      getProviderMock.mockReturnValue("gemini");
      // Multiple providers detected — would normally error, but config wins
      mockedExistsSync.mockReturnValue(true);

      const result = resolveProvider();
      expect(result.provider).toBe("gemini");
    });
  });

  // =========================================================================
  // resolveProvider — result consistency
  // =========================================================================

  describe("resolveProvider result consistency", () => {
    it("skillsDir in result always matches getSkillsDir(provider)", () => {
      // Test across all resolution paths
      const scenarios: Array<{
        label: string;
        setup: () => void;
        explicit?: string;
      }> = [
        {
          label: "explicit flag",
          setup: () => {},
          explicit: "cursor",
        },
        {
          label: "env var",
          setup: () => {
            process.env["MPAK_PROVIDER"] = "copilot";
          },
        },
        {
          label: "config",
          setup: () => {
            getProviderMock.mockReturnValue("gemini");
          },
        },
        {
          label: "auto-detect single",
          setup: () => {
            getProviderMock.mockReturnValue(undefined);
            mockedExistsSync.mockImplementation(
              (p) => p === join(homedir(), ".codex"),
            );
          },
        },
        {
          label: "fallback to claude",
          setup: () => {
            getProviderMock.mockReturnValue(undefined);
            mockedExistsSync.mockReturnValue(false);
          },
        },
      ];

      for (const { label, setup, explicit } of scenarios) {
        vi.clearAllMocks();
        delete process.env["MPAK_PROVIDER"];
        setup();

        const result = resolveProvider(explicit);
        expect(
          result.skillsDir,
          `${label}: skillsDir doesn't match getSkillsDir(${result.provider})`,
        ).toBe(getSkillsDir(result.provider));
      }
    });
  });

  // =========================================================================
  // resolveProvider — edge cases
  // =========================================================================

  describe("resolveProvider edge cases", () => {
    it("treats empty string explicit as no explicit (falls through)", () => {
      // Empty string is falsy, so resolveProvider("") should behave like resolveProvider()
      getProviderMock.mockReturnValue("gemini");
      const result = resolveProvider("");
      expect(result.provider).toBe("gemini");
    });

    it("treats empty MPAK_PROVIDER as unset (falls through to config)", () => {
      process.env["MPAK_PROVIDER"] = "";
      getProviderMock.mockReturnValue("copilot");

      const result = resolveProvider();
      expect(result.provider).toBe("copilot");
    });

    it("defaults to claude when zero providers detected", () => {
      getProviderMock.mockReturnValue(undefined);
      mockedExistsSync.mockReturnValue(false);

      const result = resolveProvider();
      expect(result.provider).toBe("claude");
      expect(result.skillsDir).toBe(getSkillsDir("claude"));
    });

    it("uses the sole detected provider without error", () => {
      getProviderMock.mockReturnValue(undefined);
      mockedExistsSync.mockImplementation(
        (p) => p === join(homedir(), ".cursor"),
      );

      const result = resolveProvider();
      expect(result.provider).toBe("cursor");
    });
  });

  // =========================================================================
  // resolveProvider — error message quality
  // =========================================================================

  describe("resolveProvider error messages", () => {
    it("invalid explicit provider lists valid names in error", () => {
      try {
        resolveProvider("vscode");
        expect.fail("should have thrown");
      } catch (err) {
        const msg = (err as Error).message;
        // Must include the bad name AND at least some valid names
        expect(msg).toContain("vscode");
        expect(msg).toContain("claude");
        expect(msg).toContain("cursor");
      }
    });

    it("invalid env var provider identifies the source in error", () => {
      process.env["MPAK_PROVIDER"] = "bad-name";
      try {
        resolveProvider();
        expect.fail("should have thrown");
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain("MPAK_PROVIDER");
        expect(msg).toContain("bad-name");
      }
    });

    it("invalid config provider identifies the source in error", () => {
      getProviderMock.mockReturnValue("stale-value");
      try {
        resolveProvider();
        expect.fail("should have thrown");
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).toContain("config");
        expect(msg).toContain("stale-value");
      }
    });

    it("ambiguous detection defaults to claude and warns with detected names", () => {
      getProviderMock.mockReturnValue(undefined);
      mockedExistsSync.mockImplementation((p) => {
        return (
          p === join(homedir(), ".claude") ||
          p === join(homedir(), ".gemini")
        );
      });

      const stderrChunks: string[] = [];
      const spy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation((chunk) => {
          stderrChunks.push(String(chunk));
          return true;
        });

      const result = resolveProvider();
      expect(result.provider).toBe("claude");
      expect(result.skillsDir).toBe(getSkillsDir("claude"));

      const warning = stderrChunks.join("");
      expect(warning).toContain("claude");
      expect(warning).toContain("gemini");
      // Should NOT mention providers that weren't detected
      expect(warning).not.toMatch(/\bcursor\b/);

      spy.mockRestore();
    });

    it("ambiguous detection warning suggests remediation commands", () => {
      getProviderMock.mockReturnValue(undefined);
      mockedExistsSync.mockImplementation((p) => {
        return (
          p === join(homedir(), ".claude") ||
          p === join(homedir(), ".cursor")
        );
      });

      const stderrChunks: string[] = [];
      const spy = vi
        .spyOn(process.stderr, "write")
        .mockImplementation((chunk) => {
          stderrChunks.push(String(chunk));
          return true;
        });

      resolveProvider();

      const warning = stderrChunks.join("");
      expect(warning).toContain("mpak provider set");
      expect(warning).toContain("--provider");

      spy.mockRestore();
    });
  });

  // =========================================================================
  // resolveProvider — each layer validates independently
  // =========================================================================

  describe("resolveProvider validates at each layer", () => {
    it("explicit: rejects known-bad names even when env/config would succeed", () => {
      process.env["MPAK_PROVIDER"] = "claude";
      getProviderMock.mockReturnValue("claude");

      expect(() => resolveProvider("nope")).toThrow(/Unknown provider: nope/);
    });

    it("env: rejects known-bad names even when config would succeed", () => {
      process.env["MPAK_PROVIDER"] = "nope";
      getProviderMock.mockReturnValue("claude");

      expect(() => resolveProvider()).toThrow(/MPAK_PROVIDER/);
    });

    it("config: rejects known-bad names even when detection would succeed", () => {
      getProviderMock.mockReturnValue("nope");
      mockedExistsSync.mockImplementation(
        (p) => p === join(homedir(), ".claude"),
      );

      expect(() => resolveProvider()).toThrow(/config/);
    });
  });

  // =========================================================================
  // resolveProvider — exercising every provider through every path
  // =========================================================================

  describe("resolveProvider works for all providers", () => {
    const allProviders = [
      "claude",
      "cursor",
      "copilot",
      "codex",
      "gemini",
      "goose",
      "opencode",
    ] as const;

    for (const name of allProviders) {
      it(`resolves ${name} via explicit flag`, () => {
        const result = resolveProvider(name);
        expect(result.provider).toBe(name);
        expect(result.skillsDir).toBe(getSkillsDir(name));
      });
    }
  });
});
