import { writeFileSync } from "fs";
import { resolve } from "path";
import { MpakClient } from "@nimblebrain/mpak-sdk";
import { fmtError } from "../../utils/format.js";
import { createClient } from "../../utils/client.js";

export interface PullOptions {
  output?: string;
  json?: boolean;
  os?: string;
  arch?: string;
}

/**
 * Parse package specification into name and version
 * Examples:
 *   @scope/name -> { name: '@scope/name', version: undefined }
 *   @scope/name@1.0.0 -> { name: '@scope/name', version: '1.0.0' }
 */
function parsePackageSpec(spec: string): { name: string; version?: string } {
  // Find the last @ which separates version from package name
  // Package names start with @, so we need to find the second @
  const lastAtIndex = spec.lastIndexOf("@");

  if (lastAtIndex <= 0) {
    // No version specified or invalid format
    return { name: spec };
  }

  const name = spec.substring(0, lastAtIndex);
  const version = spec.substring(lastAtIndex + 1);

  // Validate that the name still starts with @
  if (!name.startsWith("@")) {
    // This means the @ was part of the package name, not a version separator
    return { name: spec };
  }

  return { name, version };
}

/**
 * Pull (download) a package from the registry
 */
export async function handlePull(
  packageSpec: string,
  options: PullOptions = {},
): Promise<void> {
  try {
    const { name, version } = parsePackageSpec(packageSpec);

    const client = createClient();

    // Detect platform (or use explicit overrides)
    const detectedPlatform = MpakClient.detectPlatform();
    const platform = {
      os: options.os || detectedPlatform.os,
      arch: options.arch || detectedPlatform.arch,
    };

    console.log(
      `=> Fetching ${version ? `${name}@${version}` : `${name} (latest)`}...`,
    );
    console.log(`   Platform: ${platform.os}-${platform.arch}`);

    // Get download info with platform
    const downloadInfo = await client.getBundleDownload(
      name,
      version || "latest",
      platform,
    );

    if (options.json) {
      console.log(JSON.stringify(downloadInfo, null, 2));
      return;
    }

    const bundle = downloadInfo.bundle;
    console.log(`   Version: ${bundle.version}`);
    console.log(
      `   Artifact: ${bundle.platform.os}-${bundle.platform.arch}`,
    );
    console.log(
      `   Size: ${(bundle.size / (1024 * 1024)).toFixed(2)} MB`,
    );

    // Determine output filename (include platform in name)
    const platformSuffix = `${bundle.platform.os}-${bundle.platform.arch}`;
    const defaultFilename = `${name.replace("@", "").replace("/", "-")}-${bundle.version}-${platformSuffix}.mcpb`;
    const outputPath = options.output
      ? resolve(options.output)
      : resolve(defaultFilename);

    console.log(`\n=> Downloading to ${outputPath}...`);

    // Download the bundle
    const response = await fetch(downloadInfo.url);
    if (!response.ok) {
      throw new Error(`Failed to download bundle: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    writeFileSync(outputPath, Buffer.from(arrayBuffer));

    console.log(`\n=> Bundle downloaded successfully!`);
    console.log(`   File: ${outputPath}`);
    console.log(`   SHA256: ${bundle.sha256.substring(0, 16)}...`);
  } catch (error) {
    fmtError(error instanceof Error ? error.message : "Failed to pull bundle");
  }
}
