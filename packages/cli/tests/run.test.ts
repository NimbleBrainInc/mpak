import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { McpbManifest } from "@nimblebrain/mpak-schemas";
import type { ServerCommand } from "@nimblebrain/mpak-sdk";
import {
  MpakConfigError,
  MpakNetworkError,
  MpakNotFoundError,
} from "@nimblebrain/mpak-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleRun } from "../src/commands/packages/run.js";

/** Sentinel thrown by the process.exit mock so code halts like a real exit. */
class ExitError extends Error {
  constructor(public readonly code: number) {
    super(`process.exit(${code})`);
    this.name = "ExitError";
  }
}

// ===========================================================================
// Mock child_process.spawn
// ===========================================================================

interface MockChildProcess {
  kill: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  _listeners: Record<string, ((...args: unknown[]) => void)[]>;
  _emit: (event: string, ...args: unknown[]) => void;
}

function createMockChild(): MockChildProcess {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    kill: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
    }),
    _listeners: listeners,
    _emit: (event: string, ...args: unknown[]) => {
      for (const cb of listeners[event] || []) {
        cb(...args);
      }
    },
  };
}

let mockChild: MockChildProcess;
const mockSpawn = vi.fn();

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    spawn: (...args: unknown[]) => mockSpawn(...args),
  };
});

// ===========================================================================
// Mock the mpak singleton
// ===========================================================================

const mockPrepareServer = vi.fn();
const mockCheckForUpdate = vi.fn();
const mockSetPackageConfigValue = vi.fn();

vi.mock("../src/utils/config.js", () => ({
  get mpak() {
    return {
      prepareServer: mockPrepareServer,
      bundleCache: {
        checkForUpdate: mockCheckForUpdate,
      },
      configManager: {
        setPackageConfigValue: mockSetPackageConfigValue,
      },
    };
  },
}));

// ===========================================================================
// Fixtures
// ===========================================================================

const nodeManifest: McpbManifest = {
  manifest_version: "0.3",
  name: "@scope/echo",
  version: "1.0.0",
  description: "Echo server",
  server: {
    type: "node",
    entry_point: "index.js",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/index.js"],
      env: {},
    },
  },
};

function makeServerCommand(overrides?: Partial<ServerCommand>): ServerCommand {
  return {
    command: "node",
    args: ["/cache/scope-echo/index.js"],
    env: { MPAK_WORKSPACE: "/project/.mpak" },
    cwd: "/cache/scope-echo",
    name: "@scope/echo",
    version: "1.0.0",
    ...overrides,
  };
}

let testDir: string;

function createMcpbBundle(dir: string, manifest: McpbManifest): string {
  const srcDir = join(dir, "bundle-src");
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(srcDir, "index.js"), 'console.log("hello")');

  const mcpbPath = join(dir, "test-bundle.mcpb");
  execFileSync(
    "zip",
    ["-j", mcpbPath, join(srcDir, "manifest.json"), join(srcDir, "index.js")],
    { stdio: "pipe" },
  );
  return mcpbPath;
}

// ===========================================================================
// Capture stderr, mock process.exit
// ===========================================================================

let stderr: string;
let exitCode: number | undefined;

beforeEach(() => {
  stderr = "";
  exitCode = undefined;
  testDir = mkdtempSync(join(tmpdir(), "mpak-run-test-"));

  mockChild = createMockChild();
  mockSpawn.mockReset();
  mockSpawn.mockReturnValue(mockChild);
  mockPrepareServer.mockReset();
  mockCheckForUpdate.mockReset();
  mockSetPackageConfigValue.mockReset();
  mockPrepareServer.mockResolvedValue(makeServerCommand());
  mockCheckForUpdate.mockResolvedValue(null);

  vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  });
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    // Throw to halt execution (matching real process.exit behavior).
    // Tests that call handleRun where exit happens in async callbacks
    // (like child "exit" event) should catch this.
    throw new ExitError(exitCode);
  }) as never);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ===========================================================================
// Registry — bundle in cache (no pull needed)
// ===========================================================================

describe("registry run — cached bundle", () => {
  it("calls prepareServer with parsed name and spawns the server", async () => {
    const server = makeServerCommand();
    mockPrepareServer.mockResolvedValue(server);

    handleRun("@scope/echo");
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));

    expect(mockPrepareServer).toHaveBeenCalledWith(
      { name: "@scope/echo" },
      {},
    );
    expect(mockSpawn).toHaveBeenCalledWith("node", ["/cache/scope-echo/index.js"], {
      stdio: ["inherit", "inherit", "inherit"],
      env: expect.objectContaining({ MPAK_WORKSPACE: "/project/.mpak" }),
      cwd: "/cache/scope-echo",
    });
  });

  it("parses version from package spec", async () => {
    mockPrepareServer.mockResolvedValue(makeServerCommand({ version: "2.0.0" }));

    handleRun("@scope/echo@2.0.0");
    await vi.waitFor(() => expect(mockPrepareServer).toHaveBeenCalled());

    expect(mockPrepareServer).toHaveBeenCalledWith(
      { name: "@scope/echo", version: "2.0.0" },
      {},
    );
  });

  it("merges process.env on top of server env", async () => {
    mockPrepareServer.mockResolvedValue(
      makeServerCommand({ env: { FROM_SDK: "yes", PATH: "/sdk/path" } }),
    );

    handleRun("@scope/echo");
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    const spawnEnv = mockSpawn.mock.calls[0][2].env;
    // process.env PATH wins over SDK's PATH
    expect(spawnEnv["PATH"]).toBe(process.env["PATH"]);
    // SDK-only keys survive the merge
    expect(spawnEnv["FROM_SDK"]).toBe("yes");
  });
});

// ===========================================================================
// Registry — bundle not in cache (needs pull)
// ===========================================================================

describe("registry run — uncached bundle", () => {
  it("calls prepareServer without force (SDK handles download)", async () => {
    handleRun("@scope/new-bundle");
    await vi.waitFor(() => expect(mockPrepareServer).toHaveBeenCalled());

    expect(mockPrepareServer).toHaveBeenCalledWith(
      { name: "@scope/new-bundle" },
      {},
    );
  });

  it("throws when bundle is not found in registry", async () => {
    mockPrepareServer.mockRejectedValue(
      new MpakNotFoundError("@scope/nonexistent@latest"),
    );

    await expect(handleRun("@scope/nonexistent")).rejects.toThrow(MpakNotFoundError);
  });

  it("throws on network error", async () => {
    mockPrepareServer.mockRejectedValue(new MpakNetworkError("connection refused"));

    await expect(handleRun("@scope/echo")).rejects.toThrow(MpakNetworkError);
  });
});

// ===========================================================================
// Registry — --update flag
// ===========================================================================

describe("registry run — --update flag", () => {
  it("passes force: true when --update is set", async () => {
    handleRun("@scope/echo", { update: true });
    await vi.waitFor(() => expect(mockPrepareServer).toHaveBeenCalled());

    expect(mockPrepareServer).toHaveBeenCalledWith(
      { name: "@scope/echo" },
      { force: true },
    );
  });

  it("does not fire update check when --update is set", async () => {
    handleRun("@scope/echo", { update: true });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    // Give async code time to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Local — first run (uncached)
// ===========================================================================

describe("local run — uncached bundle", () => {
  it("calls prepareServer with resolved absolute path", async () => {
    const mcpbPath = createMcpbBundle(testDir, nodeManifest);

    handleRun("", { local: mcpbPath });
    await vi.waitFor(() => expect(mockPrepareServer).toHaveBeenCalled());

    expect(mockPrepareServer).toHaveBeenCalledWith(
      { local: resolve(mcpbPath) },
      {},
    );
  });

  it("does not fire update check for local bundles", async () => {
    const mcpbPath = createMcpbBundle(testDir, nodeManifest);

    handleRun("", { local: mcpbPath });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));

    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Local — cached bundle (re-use)
// ===========================================================================

describe("local run — cached bundle", () => {
  it("calls prepareServer without force (SDK handles mtime check)", async () => {
    const mcpbPath = createMcpbBundle(testDir, nodeManifest);

    handleRun("", { local: mcpbPath });
    await vi.waitFor(() => expect(mockPrepareServer).toHaveBeenCalled());

    expect(mockPrepareServer).toHaveBeenCalledWith(
      { local: resolve(mcpbPath) },
      {},
    );
  });
});

// ===========================================================================
// Local — --update forces re-extract
// ===========================================================================

describe("local run — --update flag", () => {
  it("passes force: true for local with --update", async () => {
    const mcpbPath = createMcpbBundle(testDir, nodeManifest);

    handleRun("", { local: mcpbPath, update: true });
    await vi.waitFor(() => expect(mockPrepareServer).toHaveBeenCalled());

    expect(mockPrepareServer).toHaveBeenCalledWith(
      { local: resolve(mcpbPath) },
      { force: true },
    );
  });
});

// ===========================================================================
// Async fire-and-forget update check
// ===========================================================================

describe("async update check", () => {
  it("prints update notice when newer version is available", async () => {
    mockCheckForUpdate.mockResolvedValue("2.0.0");

    handleRun("@scope/echo");
    await vi.waitFor(() => expect(mockCheckForUpdate).toHaveBeenCalled());
    // Let the .then() handler run
    await new Promise((r) => setTimeout(r, 10));

    expect(stderr).toContain("Update available");
    expect(stderr).toContain("@scope/echo 1.0.0 -> 2.0.0");
    expect(stderr).toContain("mpak run @scope/echo --update");
  });

  it("prints nothing when bundle is up to date", async () => {
    mockCheckForUpdate.mockResolvedValue(null);

    handleRun("@scope/echo");
    await vi.waitFor(() => expect(mockCheckForUpdate).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));

    expect(stderr).not.toContain("Update available");
  });

  it("logs debug message when update check fails", async () => {
    mockCheckForUpdate.mockRejectedValue(new Error("network timeout"));

    handleRun("@scope/echo");

    await vi.waitFor(() =>
      expect(stderr).toContain("Debug: update check failed: network timeout"),
    );
  });

  it("skips update check for local bundles", async () => {
    const mcpbPath = createMcpbBundle(testDir, nodeManifest);

    handleRun("", { local: mcpbPath });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));

    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });

  it("skips update check when --update was used", async () => {
    handleRun("@scope/echo", { update: true });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));

    expect(mockCheckForUpdate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// MpakConfigError — registry (non-interactive)
// ===========================================================================

describe("missing config — registry (non-interactive)", () => {
  it("exits with error listing missing keys", async () => {
    mockPrepareServer.mockRejectedValue(
      new MpakConfigError("@scope/echo", [
        { key: "api_key", title: "API Key", sensitive: true },
        { key: "endpoint", title: "Endpoint", sensitive: false },
      ]),
    );

    await expect(handleRun("@scope/echo")).rejects.toThrow(ExitError);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Missing required config: api_key, endpoint");
    expect(stderr).toContain("mpak config set @scope/echo");
  });
});

// ===========================================================================
// MpakConfigError — local (non-interactive)
// ===========================================================================

describe("missing config — local (non-interactive)", () => {
  it("exits with error listing missing keys for local bundle", async () => {
    const mcpbPath = createMcpbBundle(testDir, nodeManifest);
    mockPrepareServer.mockRejectedValue(
      new MpakConfigError("@scope/echo", [
        { key: "token", title: "Auth Token", sensitive: true },
      ]),
    );

    await expect(handleRun("", { local: mcpbPath })).rejects.toThrow(ExitError);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Missing required config: token");
    expect(stderr).toContain("mpak config set @scope/echo");
  });
});

// ===========================================================================
// CLI-level validation errors
// ===========================================================================

describe("CLI input validation", () => {
  it("exits when neither package spec nor --local is provided", async () => {
    await expect(handleRun("")).rejects.toThrow(ExitError);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Either provide a package name or use --local");
    expect(mockPrepareServer).not.toHaveBeenCalled();
  });

  it("exits when --local path does not exist", async () => {
    await expect(handleRun("", { local: "/nonexistent/bundle.mcpb" })).rejects.toThrow(ExitError);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Bundle not found");
    expect(mockPrepareServer).not.toHaveBeenCalled();
  });

  it("exits when --local file is not .mcpb", async () => {
    const notMcpb = join(testDir, "bundle.zip");
    writeFileSync(notMcpb, "fake");

    await expect(handleRun("", { local: notMcpb })).rejects.toThrow(ExitError);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("Not an MCPB bundle");
    expect(mockPrepareServer).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Process spawning
// ===========================================================================

describe("process spawning", () => {
  it("forwards SIGINT and SIGTERM to child process", async () => {
    const sigintListeners: (() => void)[] = [];
    const sigtermListeners: (() => void)[] = [];
    vi.spyOn(process, "on").mockImplementation(((event: string, cb: () => void) => {
      if (event === "SIGINT") sigintListeners.push(cb);
      if (event === "SIGTERM") sigtermListeners.push(cb);
      return process;
    }) as typeof process.on);

    handleRun("@scope/echo");
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    for (const cb of sigintListeners) cb();
    for (const cb of sigtermListeners) cb();

    expect(mockChild.kill).toHaveBeenCalledWith("SIGINT");
    expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("calls process.exit with child's exit code", async () => {
    // Capture unhandled rejections from the async exit handler
    const unhandled: unknown[] = [];
    const handler = (err: unknown) => unhandled.push(err);
    process.on("unhandledRejection", handler);

    handleRun("@scope/echo");
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    mockChild._emit("exit", 42);
    await new Promise((r) => setTimeout(r, 50));

    process.removeListener("unhandledRejection", handler);
    expect(exitCode).toBe(42);
  });

  it("calls process.exit(0) when child exit code is null", async () => {
    const unhandled: unknown[] = [];
    const handler = (err: unknown) => unhandled.push(err);
    process.on("unhandledRejection", handler);

    handleRun("@scope/echo");
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    mockChild._emit("exit", null);
    await new Promise((r) => setTimeout(r, 50));

    process.removeListener("unhandledRejection", handler);
    expect(exitCode).toBe(0);
  });

  it("prints error and exits 1 when spawn fails", async () => {
    const unhandled: unknown[] = [];
    const handler = (err: unknown) => unhandled.push(err);
    process.on("unhandledRejection", handler);
    process.on("uncaughtException", handler);

    handleRun("@scope/echo");
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalled());

    try {
      mockChild._emit("error", new Error("ENOENT"));
    } catch {
      // ExitError thrown synchronously from the "error" handler
    }
    await new Promise((r) => setTimeout(r, 50));

    process.removeListener("unhandledRejection", handler);
    process.removeListener("uncaughtException", handler);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Failed to start server: ENOENT");
  });
});

// ===========================================================================
// SDK error propagation
// ===========================================================================

describe("SDK error propagation", () => {
  it("propagates MpakNotFoundError from local bundle", async () => {
    const mcpbPath = join(testDir, "corrupt.mcpb");
    writeFileSync(mcpbPath, "not a zip");
    mockPrepareServer.mockRejectedValue(
      new MpakNotFoundError(mcpbPath),
    );

    await expect(handleRun("", { local: mcpbPath })).rejects.toThrow(
      MpakNotFoundError,
    );
  });

  it("propagates unexpected errors as-is", async () => {
    mockPrepareServer.mockRejectedValue(new Error("something unexpected"));

    await expect(handleRun("@scope/echo")).rejects.toThrow("something unexpected");
  });
});
