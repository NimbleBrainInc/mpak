import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import matter from "gray-matter";
import { resolveProvider } from "../../utils/providers.js";

interface InstalledSkill {
  name: string;
  description: string;
  version: string | null;
  path: string;
}

/**
 * List all installed skills
 */
function listInstalledSkills(skillsDir: string): InstalledSkill[] {
  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills: InstalledSkill[] = [];
  const entries = readdirSync(skillsDir);

  for (const entry of entries) {
    // Skip hidden files
    if (entry.startsWith(".")) continue;

    const skillPath = join(skillsDir, entry);
    const stat = statSync(skillPath);

    if (!stat.isDirectory()) continue;

    // Check for SKILL.md
    const skillMdPath = join(skillPath, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    // Parse SKILL.md
    try {
      const content = readFileSync(skillMdPath, "utf-8");
      const parsed = matter(content);

      skills.push({
        name: (parsed.data["name"] as string) || entry,
        description: (parsed.data["description"] as string) || "",
        version:
          ((parsed.data as Record<string, unknown>)["metadata"] as Record<string, unknown> | undefined)
            ?.["version"] as string | null ?? null,
        path: skillPath,
      });
    } catch {
      // If we can't parse, still include with basic info
      skills.push({
        name: entry,
        description: "(unable to parse SKILL.md)",
        version: null,
        path: skillPath,
      });
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

export interface ListOptions {
  json?: boolean;
  provider?: string;
}

/**
 * Handle the skill list command
 */
export async function handleSkillList(
  options: ListOptions,
): Promise<void> {
  const { provider, skillsDir } = resolveProvider(options.provider);
  const skills = listInstalledSkills(skillsDir);

  if (options.json) {
    console.log(JSON.stringify(skills, null, 2));
    return;
  }

  if (skills.length === 0) {
    console.log("No skills installed.");
    console.log("");
    console.log("Install skills with: mpak skill install <name>");
    console.log(`Or create your own in ${skillsDir}/`);
    return;
  }

  console.log("");
  console.log("Installed skills:");
  console.log("");

  const nameWidth =
    Math.max(20, ...skills.map((s) => s.name.length)) + 2;
  const versionWidth = 10;

  console.log(
    "NAME".padEnd(nameWidth) +
      "VERSION".padEnd(versionWidth) +
      "DESCRIPTION",
  );

  for (const skill of skills) {
    const name = skill.name.padEnd(nameWidth);
    const version = (skill.version || "-").padEnd(versionWidth);
    const desc =
      skill.description.length > 50
        ? skill.description.slice(0, 47) + "..."
        : skill.description;

    console.log(name + version + desc);
  }

  console.log("");
  console.log(
    `${skills.length} skill(s) installed in ${skillsDir} (${provider})`,
  );
}
