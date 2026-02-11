import { fmtError } from "../../utils/format.js";
import { createClient } from "../../utils/client.js";

export interface ShowOptions {
  json?: boolean;
}

/**
 * Handle the skill show command
 */
export async function handleSkillShow(
  name: string,
  options: ShowOptions,
): Promise<void> {
  try {
    const client = createClient();
    const skill = await client.getSkill(name);

    if (options.json) {
      console.log(JSON.stringify(skill, null, 2));
      return;
    }

    console.log("");
    console.log(`${skill.name}@${skill.latest_version}`);
    console.log("");
    console.log(skill.description);
    console.log("");

    // Metadata section
    console.log("Metadata:");
    if (skill.license) console.log(`  License: ${skill.license}`);
    if (skill.category)
      console.log(`  Category: ${skill.category}`);
    if (skill.tags && skill.tags.length > 0)
      console.log(`  Tags: ${skill.tags.join(", ")}`);
    if (skill.author)
      console.log(
        `  Author: ${skill.author.name}${skill.author.url ? ` (${skill.author.url})` : ""}`,
      );
    console.log(
      `  Downloads: ${skill.downloads.toLocaleString()}`,
    );
    console.log(
      `  Published: ${new Date(skill.published_at).toLocaleDateString()}`,
    );

    // Triggers
    if (skill.triggers && skill.triggers.length > 0) {
      console.log("");
      console.log("Triggers:");
      skill.triggers.forEach((t: string) =>
        console.log(`  - ${t}`),
      );
    }

    // Examples
    if (skill.examples && skill.examples.length > 0) {
      console.log("");
      console.log("Examples:");
      skill.examples.forEach(
        (ex: { prompt: string; context?: string | undefined }) => {
          console.log(
            `  - "${ex.prompt}"${ex.context ? ` (${ex.context})` : ""}`,
          );
        },
      );
    }

    // Versions
    if (skill.versions && skill.versions.length > 0) {
      console.log("");
      console.log("Versions:");
      skill.versions
        .slice(0, 5)
        .forEach(
          (v: {
            version: string;
            published_at: string;
            downloads: number;
          }) => {
            console.log(
              `  ${v.version.padEnd(12)} ${new Date(v.published_at).toLocaleDateString().padEnd(12)} ${v.downloads.toLocaleString()} downloads`,
            );
          },
        );
      if (skill.versions.length > 5) {
        console.log(
          `  ... and ${skill.versions.length - 5} more`,
        );
      }
    }

    console.log("");
    console.log(`Install: mpak skill install ${skill.name}`);
  } catch (err) {
    fmtError(err instanceof Error ? err.message : String(err));
  }
}
