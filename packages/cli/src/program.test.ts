import { describe, it, expect } from "vitest";
import { createProgram } from "./program.js";
import type { Command } from "commander";

/**
 * Walk the commander tree to find a subcommand by dotted path.
 * e.g. findCommand(program, "skill", "install") finds `mpak skill install`
 */
function findCommand(root: Command, ...path: string[]): Command | undefined {
  let cmd: Command | undefined = root;
  for (const name of path) {
    cmd = cmd?.commands.find((c) => c.name() === name);
  }
  return cmd;
}

describe("createProgram", () => {
  it("should create a program with correct name", () => {
    const program = createProgram();
    expect(program.name()).toBe("mpak");
  });

  it("should have a description", () => {
    const program = createProgram();
    expect(program.description()).toBe(
      "CLI for MCP bundles and Agent Skills",
    );
  });

  it("should have version option", () => {
    const program = createProgram();
    const versionOption = program.options.find(
      (opt) => opt.short === "-v" || opt.long === "--version",
    );
    expect(versionOption).toBeDefined();
  });

  describe("provider command registration", () => {
    it("registers provider subcommand group", () => {
      const program = createProgram();
      const provider = findCommand(program, "provider");
      expect(provider).toBeDefined();
    });

    it("registers provider list, set, and show subcommands", () => {
      const program = createProgram();
      const provider = findCommand(program, "provider");
      const subNames = provider?.commands.map((c) => c.name());
      expect(subNames).toContain("list");
      expect(subNames).toContain("set");
      expect(subNames).toContain("show");
    });
  });

  describe("--provider flag wiring", () => {
    it("skill install accepts --provider / -p", () => {
      const program = createProgram();
      const install = findCommand(program, "skill", "install");
      const opt = install?.options.find(
        (o) => o.long === "--provider",
      );
      expect(opt).toBeDefined();
      expect(opt?.short).toBe("-p");
    });

    it("skill list accepts --provider / -p", () => {
      const program = createProgram();
      const list = findCommand(program, "skill", "list");
      const opt = list?.options.find(
        (o) => o.long === "--provider",
      );
      expect(opt).toBeDefined();
      expect(opt?.short).toBe("-p");
    });

    it("skill search does NOT accept --provider (not applicable)", () => {
      const program = createProgram();
      const search = findCommand(program, "skill", "search");
      const opt = search?.options.find(
        (o) => o.long === "--provider",
      );
      expect(opt).toBeUndefined();
    });
  });
});
