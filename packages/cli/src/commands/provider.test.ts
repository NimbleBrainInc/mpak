import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────────

const detectProvidersMock = vi.fn();
const resolveProviderMock = vi.fn();
const setProviderMock = vi.fn();

vi.mock("../utils/providers.js", () => ({
  detectProviders: (...args: unknown[]) => detectProvidersMock(...args),
  getProviderNames: () =>
    ["claude", "cursor", "copilot", "codex", "gemini", "goose", "opencode"],
  getSkillsDir: (name: string) => `/home/user/.${name}/skills`,
  isValidProvider: (name: string) =>
    ["claude", "cursor", "copilot", "codex", "gemini", "goose", "opencode"].includes(name),
  resolveProvider: (...args: unknown[]) => resolveProviderMock(...args),
}));

vi.mock("../utils/config-manager.js", () => ({
  ConfigManager: class {
    setProvider(name: string) {
      setProviderMock(name);
    }
  },
}));

import {
  handleProviderList,
  handleProviderSet,
  handleProviderShow,
} from "./provider.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

let logOutput: string[];
let stderrOutput: string[];

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  stderrOutput = [];
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logOutput.push(args.join(" "));
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderrOutput.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── handleProviderList ─────────────────────────────────────────────────────

describe("handleProviderList", () => {
  it("marks detected providers with a checkmark", async () => {
    detectProvidersMock.mockReturnValue(["claude", "cursor"]);

    await handleProviderList();

    const output = logOutput.join("\n");
    // claude should have checkmark, codex should not
    expect(output).toMatch(/✓\s+claude/);
    expect(output).toMatch(/✓\s+cursor/);
    expect(output).toMatch(/\s{2}\s+copilot/); // space, not checkmark
  });

  it("shows all 7 providers even when none detected", async () => {
    detectProvidersMock.mockReturnValue([]);

    await handleProviderList();

    const output = logOutput.join("\n");
    for (const name of ["claude", "cursor", "copilot", "codex", "gemini", "goose", "opencode"]) {
      expect(output).toContain(name);
    }
    expect(output).toContain("No providers detected");
  });

  it("shows detected summary when providers found", async () => {
    detectProvidersMock.mockReturnValue(["gemini"]);

    await handleProviderList();

    const output = logOutput.join("\n");
    expect(output).toContain("Detected: gemini");
  });
});

// ─── handleProviderSet ──────────────────────────────────────────────────────

describe("handleProviderSet", () => {
  it("persists a valid provider to config", async () => {
    await handleProviderSet("cursor");

    expect(setProviderMock).toHaveBeenCalledWith("cursor");
    expect(logOutput.join("\n")).toContain("cursor");
  });

  it("rejects an invalid provider name", async () => {
    const exitError = new Error("process.exit");
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw exitError;
      });

    await expect(handleProviderSet("vscode")).rejects.toThrow("process.exit");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrOutput.join("")).toContain("Unknown provider");
    expect(stderrOutput.join("")).toContain("vscode");
    expect(setProviderMock).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("shows the skills directory in confirmation", async () => {
    await handleProviderSet("claude");

    const output = logOutput.join("\n");
    // Should show both the name and the path
    expect(output).toContain("claude");
    expect(output).toContain(".claude/skills");
  });
});

// ─── handleProviderShow ─────────────────────────────────────────────────────

describe("handleProviderShow", () => {
  it("displays the resolved provider and directory", async () => {
    resolveProviderMock.mockReturnValue({
      provider: "cursor",
      skillsDir: "/home/user/.cursor/skills",
    });

    await handleProviderShow();

    const output = logOutput.join("\n");
    expect(output).toContain("cursor");
    expect(output).toContain("/home/user/.cursor/skills");
  });

  it("exits with error when resolution fails (e.g. ambiguous)", async () => {
    resolveProviderMock.mockImplementation(() => {
      throw new Error("Multiple providers detected: claude, cursor");
    });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await handleProviderShow();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrOutput.join("")).toContain("Multiple providers detected");

    exitSpy.mockRestore();
  });
});
