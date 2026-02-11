import { fmtError } from "../../utils/format.js";
import { createClient } from "../../utils/client.js";

export interface ShowOptions {
  json?: boolean;
}

const CERT_LEVEL_LABELS: Record<number, string> = {
  1: "L1 Basic",
  2: "L2 Verified",
  3: "L3 Hardened",
  4: "L4 Certified",
};

/**
 * Show detailed information about a bundle (v1 API)
 */
export async function handleShow(
  packageName: string,
  options: ShowOptions = {},
): Promise<void> {
  try {
    const client = createClient();

    // Fetch bundle details and versions in parallel
    const [bundle, versionsInfo] = await Promise.all([
      client.getBundle(packageName),
      client.getBundleVersions(packageName),
    ]);

    if (options.json) {
      console.log(
        JSON.stringify(
          { ...bundle, versions_detail: versionsInfo.versions },
          null,
          2,
        ),
      );
      return;
    }

    // Header
    const verified = bundle.verified ? "\u2713 " : "";
    const provenance = bundle.provenance ? "\uD83D\uDD12 " : "";
    console.log(
      `\n${verified}${provenance}${bundle.display_name || bundle.name} v${bundle.latest_version}\n`,
    );

    // Description
    if (bundle.description) {
      console.log(bundle.description);
      console.log();
    }

    // Basic info
    console.log("Bundle Information:");
    console.log(`  Name: ${bundle.name}`);
    if (bundle.author?.name) {
      console.log(`  Author: ${bundle.author.name}`);
    }
    if (bundle.server_type) {
      console.log(`  Type: ${bundle.server_type}`);
    }
    if (bundle.license) {
      console.log(`  License: ${bundle.license}`);
    }
    if (bundle.homepage) {
      console.log(`  Homepage: ${bundle.homepage}`);
    }
    console.log();

    // Trust / Certification
    const certLevel = bundle.certification_level;
    const certification = bundle.certification;

    if (certLevel != null) {
      const label = CERT_LEVEL_LABELS[certLevel] ?? `L${certLevel}`;
      console.log(`Trust: ${label}`);
      if (certification?.controls_passed != null && certification?.controls_total != null) {
        console.log(`  Controls: ${certification.controls_passed}/${certification.controls_total} passed`);
      }
      console.log();
    }

    // Provenance info
    if (bundle.provenance) {
      console.log("Provenance:");
      console.log(`  Repository: ${bundle.provenance.repository}`);
      console.log(`  Commit: ${bundle.provenance.sha.substring(0, 12)}`);
      console.log(`  Provider: ${bundle.provenance.provider}`);
      console.log();
    }

    // Stats
    console.log("Statistics:");
    console.log(`  Downloads: ${bundle.downloads.toLocaleString()}`);
    console.log(
      `  Published: ${new Date(bundle.published_at as string).toLocaleDateString()}`,
    );
    console.log();

    // Tools
    if (bundle.tools && bundle.tools.length > 0) {
      console.log(`Tools (${bundle.tools.length}):`);
      for (const tool of bundle.tools) {
        console.log(`  - ${tool.name}`);
        if (tool.description) {
          console.log(`    ${tool.description}`);
        }
      }
      console.log();
    }

    // Versions with platforms
    if (versionsInfo.versions && versionsInfo.versions.length > 0) {
      console.log(`Versions (${versionsInfo.versions.length}):`);
      const recentVersions = versionsInfo.versions.slice(0, 5);
      for (const version of recentVersions) {
        const date = new Date(
          version.published_at as string,
        ).toLocaleDateString();
        const downloads = version.downloads.toLocaleString();
        const isLatest =
          version.version === versionsInfo.latest ? " (latest)" : "";
        const provTag = version.provenance ? " \uD83D\uDD12" : "";

        // Format platforms
        const platformStrs = version.platforms.map(
          (p) => `${p.os}-${p.arch}`,
        );
        const platformsDisplay =
          platformStrs.length > 0
            ? ` [${platformStrs.join(", ")}]`
            : "";

        console.log(
          `  ${version.version}${isLatest}${provTag} - ${date} - ${downloads} downloads${platformsDisplay}`,
        );
      }
      if (versionsInfo.versions.length > 5) {
        console.log(
          `  ... and ${versionsInfo.versions.length - 5} more`,
        );
      }
      console.log();
    }

    // Available platforms for latest version
    const latestVersion = versionsInfo.versions.find(
      (v) => v.version === versionsInfo.latest,
    );
    if (latestVersion && latestVersion.platforms.length > 0) {
      console.log("Available Platforms:");
      for (const platform of latestVersion.platforms) {
        console.log(`  - ${platform.os}-${platform.arch}`);
      }
      console.log();
    }

    // Install instructions
    console.log("Install:");
    console.log(`  mpak install ${bundle.name}`);
    console.log();
    console.log("Pull (download only):");
    console.log(`  mpak pull ${bundle.name}`);
  } catch (error) {
    fmtError(error instanceof Error ? error.message : "Failed to get bundle details");
  }
}
