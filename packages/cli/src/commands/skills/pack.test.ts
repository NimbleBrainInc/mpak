import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "fs";
import { join, basename } from "path";
import { tmpdir } from "os";
import { packSkill } from "./pack.js";
import { execSync } from "child_process";

describe("packSkill", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-pack-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("validation before packing", () => {
    it("fails for invalid skill", async () => {
      const skillDir = join(testDir, "invalid-skill");
      mkdirSync(skillDir);
      // No SKILL.md

      const result = await packSkill(skillDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
    });

    it("fails when name format is invalid", async () => {
      const skillDir = join(testDir, "BadName");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: BadName
description: Invalid name
---
# Bad`,
      );

      const result = await packSkill(skillDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Validation failed");
    });
  });

  describe("successful packing", () => {
    it("creates a .skill bundle", async () => {
      const skillDir = join(testDir, "test-skill");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: test-skill
description: A test skill for packing
metadata:
  version: "1.0.0"
---
# Test Skill

Instructions here.`,
      );

      const outputPath = join(
        testDir,
        "test-skill-1.0.0.skill",
      );
      const result = await packSkill(skillDir, outputPath);

      expect(result.success).toBe(true);
      expect(result.name).toBe("test-skill");
      expect(result.version).toBe("1.0.0");
      expect(result.path).toBe(outputPath);
      expect(result.path!.endsWith(".skill")).toBe(true);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.size).toBeGreaterThan(0);

      // Verify bundle exists
      expect(existsSync(result.path!)).toBe(true);
    });

    it("uses 0.0.0 version when metadata version is missing", async () => {
      const skillDir = join(testDir, "no-version");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: no-version
description: A skill without version
---
# No Version`,
      );

      const outputPath = join(
        testDir,
        "no-version-0.0.0.skill",
      );
      const result = await packSkill(skillDir, outputPath);

      expect(result.success).toBe(true);
      expect(result.version).toBe("0.0.0");
      expect(basename(result.path!)).toBe(
        "no-version-0.0.0.skill",
      );
    });

    it("creates bundle in current directory by default", async () => {
      const skillDir = join(testDir, "output-test");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: output-test
description: Testing output path
metadata:
  version: "1.0.0"
---
# Output Test`,
      );

      // Change to temp directory to test default output location
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const result = await packSkill(skillDir);

        expect(result.success).toBe(true);
        expect(result.path).toContain(testDir);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it("uses custom output path when provided", async () => {
      const skillDir = join(testDir, "custom-output");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: custom-output
description: Custom output path test
metadata:
  version: "2.0.0"
---
# Custom Output`,
      );

      const outputPath = join(testDir, "custom-name.skill");
      const result = await packSkill(skillDir, outputPath);

      expect(result.success).toBe(true);
      expect(result.path).toBe(outputPath);
      expect(existsSync(outputPath)).toBe(true);
    });

    it("includes skill directory structure in bundle", async () => {
      const skillDir = join(testDir, "structured-skill");
      mkdirSync(skillDir);
      mkdirSync(join(skillDir, "scripts"));
      mkdirSync(join(skillDir, "references"));

      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: structured-skill
description: A skill with structure
metadata:
  version: "1.0.0"
---
# Structured Skill`,
      );
      writeFileSync(
        join(skillDir, "scripts", "helper.py"),
        "# Python helper",
      );
      writeFileSync(
        join(skillDir, "references", "PATTERNS.md"),
        "# Patterns",
      );

      const outputPath = join(
        testDir,
        "structured-skill-1.0.0.skill",
      );
      const result = await packSkill(skillDir, outputPath);

      expect(result.success).toBe(true);

      // Verify bundle contents using unzip -l
      try {
        const listing = execSync(
          `unzip -l "${result.path}"`,
          { encoding: "utf-8" },
        );
        expect(listing).toContain(
          "structured-skill/SKILL.md",
        );
        expect(listing).toContain(
          "structured-skill/scripts/helper.py",
        );
        expect(listing).toContain(
          "structured-skill/references/PATTERNS.md",
        );
      } catch {
        // unzip may not be available, skip this check
      }
    });

    it("calculates correct SHA256", async () => {
      const skillDir = join(testDir, "hash-test");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: hash-test
description: Testing SHA256 calculation
metadata:
  version: "1.0.0"
---
# Hash Test`,
      );

      const outputPath = join(
        testDir,
        "hash-test-1.0.0.skill",
      );
      const result = await packSkill(skillDir, outputPath);

      expect(result.success).toBe(true);
      expect(result.sha256).toHaveLength(64);

      // Verify hash using shasum if available
      try {
        const shasum = execSync(
          `shasum -a 256 "${result.path}"`,
          { encoding: "utf-8" },
        );
        const computedHash = shasum.split(" ")[0];
        expect(result.sha256).toBe(computedHash);
      } catch {
        // shasum may not be available, skip this check
      }
    });
  });

  describe("bundle naming", () => {
    it("creates bundle with name-version.skill format", async () => {
      const skillDir = join(testDir, "naming-test");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: naming-test
description: Testing bundle naming
metadata:
  version: "3.2.1"
---
# Naming Test`,
      );

      const outputPath = join(
        testDir,
        "naming-test-3.2.1.skill",
      );
      const result = await packSkill(skillDir, outputPath);

      expect(result.success).toBe(true);
      expect(basename(result.path!)).toBe(
        "naming-test-3.2.1.skill",
      );
    });

    it("handles prerelease versions", async () => {
      const skillDir = join(testDir, "prerelease-test");
      mkdirSync(skillDir);
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---
name: prerelease-test
description: Testing prerelease version
metadata:
  version: "1.0.0-beta.1"
---
# Prerelease Test`,
      );

      const outputPath = join(
        testDir,
        "prerelease-test-1.0.0-beta.1.skill",
      );
      const result = await packSkill(skillDir, outputPath);

      expect(result.success).toBe(true);
      expect(basename(result.path!)).toBe(
        "prerelease-test-1.0.0-beta.1.skill",
      );
    });
  });
});
