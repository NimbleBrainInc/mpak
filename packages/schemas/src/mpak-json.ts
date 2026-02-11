import { z } from "zod";

// =============================================================================
// mpak.json Schema Definition
//
// Defines the schema for mpak.json files placed in GitHub repositories to
// claim ownership of packages in the registry.
//
// Location: https://github.com/{owner}/{repo}/mpak.json
//
// Example:
// {
//   "$schema": "https://cdn.mpak.dev/schemas/2025-10-19/mpak.json",
//   "name": "@username/package-name",
//   "maintainers": ["github-username"]
// }
// =============================================================================

/** Schema version (update when making breaking changes) */
export const MPAK_SCHEMA_VERSION = "2025-10-19";

/** Canonical schema URL for IDE autocompletion */
export const MPAK_SCHEMA_URL = `https://cdn.mpak.dev/schemas/${MPAK_SCHEMA_VERSION}/mpak.json`;

// =============================================================================
// Zod Schema
// =============================================================================

/** Scoped package name pattern */
const ScopedPackageNamePattern =
  /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9-]{0,213}$/;

/** GitHub username pattern */
const GitHubUsernamePattern = /^[a-z0-9][a-z0-9-]{0,38}$/i;

/** Zod schema for mpak.json */
export const MpakJsonSchema = z.object({
  $schema: z.string().optional(),
  name: z
    .string()
    .regex(
      ScopedPackageNamePattern,
      "Package name must be scoped (e.g., @username/package-name)",
    ),
  maintainers: z
    .array(
      z
        .string()
        .regex(GitHubUsernamePattern, "Must be a valid GitHub username"),
    )
    .min(1, "At least one maintainer is required"),
  version: z.string().optional(),
});

/** TypeScript type for mpak.json */
export type MpakJson = z.infer<typeof MpakJsonSchema>;

// =============================================================================
// JSON Schema (for IDE autocomplete and CDN hosting)
// =============================================================================

/** JSON Schema definition for mpak.json */
export const MPAK_JSON_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: MPAK_SCHEMA_URL,
  title: "mpak.json",
  description:
    "Configuration file for claiming package ownership in the mpak registry",
  type: "object" as const,
  required: ["name", "maintainers"],
  properties: {
    $schema: {
      type: "string" as const,
      description: "JSON Schema URL for validation",
      default: MPAK_SCHEMA_URL,
    },
    name: {
      type: "string" as const,
      description:
        "Package name in the registry (must be scoped, e.g., @username/package)",
      pattern: "^@[a-z0-9][a-z0-9-]{0,38}/[a-z0-9][a-z0-9-]{0,213}$",
    },
    maintainers: {
      type: "array" as const,
      description: "GitHub usernames of package maintainers",
      items: {
        type: "string" as const,
        pattern: "^[a-z0-9][a-z0-9-]{0,38}$",
      },
      minItems: 1,
    },
    version: {
      type: "string" as const,
      description: "Schema version",
    },
  },
  additionalProperties: false,
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate an example mpak.json content string.
 */
export function generateMpakJsonExample(
  packageName: string,
  githubUsername: string,
): string {
  const example: MpakJson = {
    $schema: MPAK_SCHEMA_URL,
    name: packageName,
    maintainers: [githubUsername],
  };
  return JSON.stringify(example, null, 2);
}
