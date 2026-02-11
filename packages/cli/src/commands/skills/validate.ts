import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import matter from "gray-matter";
import { SkillFrontmatterSchema } from "@nimblebrain/mpak-schemas";
import type { SkillFrontmatter } from "@nimblebrain/mpak-schemas";

export interface ValidationResult {
  valid: boolean;
  name: string | null;
  path: string;
  frontmatter: SkillFrontmatter | null;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a skill directory against the Agent Skills spec
 */
export function validateSkillDirectory(skillPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    name: null,
    path: skillPath,
    frontmatter: null,
    errors: [],
    warnings: [],
  };

  // Check directory exists
  if (!existsSync(skillPath)) {
    result.valid = false;
    result.errors.push(`Directory not found: ${skillPath}`);
    return result;
  }

  const stats = statSync(skillPath);
  if (!stats.isDirectory()) {
    result.valid = false;
    result.errors.push(`Path is not a directory: ${skillPath}`);
    return result;
  }

  // Check SKILL.md exists
  const skillMdPath = join(skillPath, "SKILL.md");
  if (!existsSync(skillMdPath)) {
    result.valid = false;
    result.errors.push("SKILL.md not found");
    return result;
  }

  // Read and parse SKILL.md
  let content: string;
  try {
    content = readFileSync(skillMdPath, "utf-8");
  } catch (err) {
    result.valid = false;
    result.errors.push(`Failed to read SKILL.md: ${err}`);
    return result;
  }

  // Parse frontmatter
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(content);
  } catch (err) {
    result.valid = false;
    result.errors.push(`Failed to parse frontmatter: ${err}`);
    return result;
  }

  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    result.valid = false;
    result.errors.push("No frontmatter found in SKILL.md");
    return result;
  }

  // Validate against schema
  const validation = SkillFrontmatterSchema.safeParse(parsed.data);

  if (!validation.success) {
    result.valid = false;
    for (const issue of validation.error.issues) {
      const path = issue.path.join(".");
      result.errors.push(`${path}: ${issue.message}`);
    }
    return result;
  }

  result.frontmatter = validation.data;
  result.name = validation.data.name;

  // Validate name matches directory name
  const dirName = basename(skillPath);
  if (validation.data.name !== dirName) {
    result.valid = false;
    result.errors.push(
      `Skill name "${validation.data.name}" does not match directory name "${dirName}"`,
    );
  }

  // Check for optional directories and files
  const contents = readdirSync(skillPath);

  // Standard optional directories
  const optionalDirs = ["scripts", "references", "assets"];
  for (const dir of optionalDirs) {
    if (contents.includes(dir)) {
      const dirPath = join(skillPath, dir);
      if (!statSync(dirPath).isDirectory()) {
        result.warnings.push(
          `"${dir}" exists but is not a directory`,
        );
      }
    }
  }

  // Check for discovery metadata (not required, but recommended)
  if (!validation.data.metadata) {
    result.warnings.push(
      "No metadata field - consider adding for better discovery",
    );
  } else {
    const meta = validation.data.metadata;
    if (!meta.tags || meta.tags.length === 0) {
      result.warnings.push(
        "No tags in metadata - consider adding for better discovery",
      );
    }
    if (!meta.category) {
      result.warnings.push(
        "No category in metadata - consider adding for better discovery",
      );
    }
    if (!meta.version) {
      result.warnings.push(
        "No version in metadata - required for registry publishing",
      );
    }
  }

  return result;
}

/**
 * Format validation result for CLI output
 */
export function formatValidationResult(
  result: ValidationResult,
): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push(`\u2713 Valid: ${result.name || result.path}`);
  } else {
    lines.push(`\u2717 Invalid: ${result.name || result.path}`);
  }

  lines.push("");

  if (result.frontmatter) {
    lines.push("\u2713 SKILL.md found");
    lines.push("\u2713 Required fields");
    lines.push(`  \u251c\u2500 name: ${result.frontmatter.name}`);
    lines.push(
      `  \u2514\u2500 description: ${result.frontmatter.description.slice(0, 60)}${result.frontmatter.description.length > 60 ? "..." : ""} (${result.frontmatter.description.length} chars)`,
    );

    // Optional fields
    const optionalFields: string[] = [];
    if (result.frontmatter.license)
      optionalFields.push(`license: ${result.frontmatter.license}`);
    if (result.frontmatter.compatibility)
      optionalFields.push(
        `compatibility: ${result.frontmatter.compatibility}`,
      );
    if (result.frontmatter["allowed-tools"])
      optionalFields.push(
        `allowed-tools: ${result.frontmatter["allowed-tools"]}`,
      );

    if (optionalFields.length > 0) {
      lines.push("");
      lines.push("\u2713 Optional fields");
      optionalFields.forEach((field, i) => {
        const prefix =
          i === optionalFields.length - 1
            ? "\u2514\u2500"
            : "\u251c\u2500";
        lines.push(`  ${prefix} ${field}`);
      });
    }

    // Discovery metadata
    if (result.frontmatter.metadata) {
      const meta = result.frontmatter.metadata;
      lines.push("");
      lines.push("\u2713 Discovery metadata (metadata:)");
      if (meta.tags)
        lines.push(
          `  \u251c\u2500 tags: [${meta.tags.join(", ")}]`,
        );
      if (meta.category)
        lines.push(`  \u251c\u2500 category: ${meta.category}`);
      if (meta.triggers)
        lines.push(
          `  \u251c\u2500 triggers: ${meta.triggers.length} defined`,
        );
      if (meta.version)
        lines.push(`  \u251c\u2500 version: ${meta.version}`);
      if (meta.author)
        lines.push(`  \u2514\u2500 author: ${meta.author.name}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    result.errors.forEach((err) => lines.push(`  \u2717 ${err}`));
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    result.warnings.forEach((warn) =>
      lines.push(`  \u26a0 ${warn}`),
    );
  }

  return lines.join("\n");
}

export interface ValidateOptions {
  json?: boolean;
}

/**
 * Handle the validate command
 */
export async function handleSkillValidate(
  skillPath: string,
  options: ValidateOptions,
): Promise<void> {
  const result = validateSkillDirectory(skillPath);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("");
    console.log(`Validating ${skillPath}...`);
    console.log("");
    console.log(formatValidationResult(result));
  }

  if (!result.valid) {
    process.exit(1);
  }
}
