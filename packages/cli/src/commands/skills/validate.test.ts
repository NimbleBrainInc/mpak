import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  validateSkillDirectory,
  formatValidationResult,
} from "./validate.js";

describe("validateSkillDirectory", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("directory checks", () => {
    it("fails for non-existent directory", () => {
      const result = validateSkillDirectory(
        "/non/existent/path",
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Directory not found: /non/existent/path",
      );
    });

    it("fails for file instead of directory", () => {
      const filePath = join(testDir, "not-a-dir");
      writeFileSync(filePath, "content");

      const result = validateSkillDirectory(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(
        /Path is not a directory/,
      );
    });
  });

  describe("SKILL.md checks", () => {
    it("fails when SKILL.md is missing", () => {
      const skillDir = join(testDir, "test-skill");
      mkdirSync(skillDir);

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("SKILL.md not found");
    });

    it("fails when frontmatter is missing", () => {
      const skillDir = join(testDir, "test-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        "# Just content\nNo frontmatter here",
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "No frontmatter found in SKILL.md",
      );
    });

    it("fails when frontmatter is empty", () => {
      const skillDir = join(testDir, "test-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        "---\n---\n# Content",
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "No frontmatter found in SKILL.md",
      );
    });
  });

  describe("frontmatter validation", () => {
    it("fails when name is missing", () => {
      const skillDir = join(testDir, "test-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
description: A test skill
---
# Test`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("name")),
      ).toBe(true);
    });

    it("fails when description is missing", () => {
      const skillDir = join(testDir, "test-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: test-skill
---
# Test`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("description")),
      ).toBe(true);
    });

    it("fails when name format is invalid", () => {
      const skillDir = join(testDir, "test-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: Test_Skill
description: A test skill
---
# Test`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.toLowerCase().includes("lowercase"),
        ),
      ).toBe(true);
    });

    it("fails when name has uppercase", () => {
      const skillDir = join(testDir, "test-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: TestSkill
description: A test skill
---
# Test`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(false);
    });

    it("fails when name starts with hyphen", () => {
      const skillDir = join(testDir, "-test-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: -test-skill
description: A test skill
---
# Test`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(false);
    });

    it("fails when name does not match directory", () => {
      const skillDir = join(testDir, "dir-name");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: different-name
description: A test skill
---
# Test`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes("does not match directory"),
        ),
      ).toBe(true);
    });
  });

  describe("valid skills", () => {
    it("validates minimal skill", () => {
      const skillDir = join(testDir, "test-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: test-skill
description: A test skill for validation
---
# Test Skill

Instructions here.`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(true);
      expect(result.name).toBe("test-skill");
      expect(result.frontmatter?.description).toBe(
        "A test skill for validation",
      );
    });

    it("validates skill with optional fields", () => {
      const skillDir = join(testDir, "full-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: full-skill
description: A fully featured test skill
license: MIT
compatibility: Works with Claude Code
allowed-tools: Read Grep Bash
---
# Full Skill`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(true);
      expect(result.frontmatter?.license).toBe("MIT");
      expect(result.frontmatter?.compatibility).toBe(
        "Works with Claude Code",
      );
      expect(result.frontmatter?.["allowed-tools"]).toBe(
        "Read Grep Bash",
      );
    });

    it("validates skill with metadata", () => {
      const skillDir = join(testDir, "meta-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: meta-skill
description: A skill with metadata
metadata:
  version: "1.0.0"
  category: development
  tags:
    - testing
    - validation
  author:
    name: Test Author
---
# Meta Skill`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(true);
      expect(result.frontmatter?.metadata?.version).toBe(
        "1.0.0",
      );
      expect(result.frontmatter?.metadata?.category).toBe(
        "development",
      );
      expect(result.frontmatter?.metadata?.tags).toEqual([
        "testing",
        "validation",
      ]);
      expect(
        result.frontmatter?.metadata?.author?.name,
      ).toBe("Test Author");
    });
  });

  describe("warnings", () => {
    it("warns when metadata is missing", () => {
      const skillDir = join(testDir, "basic-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: basic-skill
description: A basic skill without metadata
---
# Basic Skill`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) =>
          w.includes("No metadata field"),
        ),
      ).toBe(true);
    });

    it("warns when version is missing from metadata", () => {
      const skillDir = join(testDir, "no-version-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: no-version-skill
description: A skill without version
metadata:
  category: development
---
# No Version Skill`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes("No version")),
      ).toBe(true);
    });

    it("warns when tags are missing", () => {
      const skillDir = join(testDir, "no-tags-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: no-tags-skill
description: A skill without tags
metadata:
  version: "1.0.0"
---
# No Tags Skill`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes("No tags")),
      ).toBe(true);
    });

    it("warns about invalid optional directory", () => {
      const skillDir = join(testDir, "file-as-dir-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: file-as-dir-skill
description: A skill with scripts as file
---
# Skill`,
      );
      writeFileSync(
        join(skillDir, "scripts"),
        "not a directory",
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes("scripts")),
      ).toBe(true);
    });
  });

  describe("optional directories", () => {
    it("accepts valid optional directories", () => {
      const skillDir = join(testDir, "dirs-skill");
      mkdirSync(skillDir);
      mkdirSync(join(skillDir, "scripts"));
      mkdirSync(join(skillDir, "references"));
      mkdirSync(join(skillDir, "assets"));
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: dirs-skill
description: A skill with all optional dirs
---
# Skill`,
      );

      const result = validateSkillDirectory(skillDir);
      expect(result.valid).toBe(true);
      expect(
        result.warnings.filter((w) =>
          w.includes("not a directory"),
        ),
      ).toHaveLength(0);
    });
  });
});

describe("formatValidationResult", () => {
  it("formats valid result correctly", () => {
    const result = {
      valid: true,
      name: "test-skill",
      path: "/path/to/skill",
      frontmatter: {
        name: "test-skill",
        description: "A test skill description",
      },
      errors: [],
      warnings: [],
    };

    const output = formatValidationResult(result);
    expect(output).toContain("\u2713 Valid: test-skill");
    expect(output).toContain("\u2713 SKILL.md found");
    expect(output).toContain("name: test-skill");
    expect(output).toContain("description:");
  });

  it("formats invalid result correctly", () => {
    const result = {
      valid: false,
      name: null,
      path: "/path/to/skill",
      frontmatter: null,
      errors: ["SKILL.md not found"],
      warnings: [],
    };

    const output = formatValidationResult(result);
    expect(output).toContain(
      "\u2717 Invalid: /path/to/skill",
    );
    expect(output).toContain("Errors:");
    expect(output).toContain("SKILL.md not found");
  });

  it("formats warnings correctly", () => {
    const result = {
      valid: true,
      name: "test-skill",
      path: "/path/to/skill",
      frontmatter: {
        name: "test-skill",
        description: "A test skill",
      },
      errors: [],
      warnings: ["No metadata field"],
    };

    const output = formatValidationResult(result);
    expect(output).toContain("Warnings:");
    expect(output).toContain("No metadata field");
  });

  it("formats optional fields", () => {
    const result = {
      valid: true,
      name: "test-skill",
      path: "/path/to/skill",
      frontmatter: {
        name: "test-skill",
        description: "A test skill",
        license: "MIT",
        compatibility: "Claude Code",
        "allowed-tools": "Read Grep",
      },
      errors: [],
      warnings: [],
    };

    const output = formatValidationResult(result);
    expect(output).toContain("license: MIT");
    expect(output).toContain("compatibility: Claude Code");
    expect(output).toContain("allowed-tools: Read Grep");
  });

  it("formats metadata correctly", () => {
    const result = {
      valid: true,
      name: "test-skill",
      path: "/path/to/skill",
      frontmatter: {
        name: "test-skill",
        description: "A test skill",
        metadata: {
          version: "1.0.0",
          category: "development" as const,
          tags: ["test", "validation"],
          triggers: ["test trigger"],
          author: { name: "Test Author" },
        },
      },
      errors: [],
      warnings: [],
    };

    const output = formatValidationResult(result);
    expect(output).toContain("Discovery metadata");
    expect(output).toContain("version: 1.0.0");
    expect(output).toContain("category: development");
    expect(output).toContain("tags: [test, validation]");
    expect(output).toContain("triggers: 1 defined");
    expect(output).toContain("author: Test Author");
  });

  it("truncates long descriptions", () => {
    const longDescription = "A".repeat(100);
    const result = {
      valid: true,
      name: "test-skill",
      path: "/path/to/skill",
      frontmatter: {
        name: "test-skill",
        description: longDescription,
      },
      errors: [],
      warnings: [],
    };

    const output = formatValidationResult(result);
    expect(output).toContain("...");
    expect(output).toContain("(100 chars)");
  });
});
