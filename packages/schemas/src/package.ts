import { z } from "zod";

import { ServerTypeSchema } from "./manifest.js";

// Re-export manifest schemas so existing consumers of package.ts are not broken.
export {
  CapabilitySchema,
  ManifestAuthorSchema,
  ManifestServerSchema,
  McpbManifestSchema,
  McpConfigSchema,
  ServerTypeSchema,
  UserConfigFieldSchema,
  type ManifestAuthor,
  type ManifestServer,
  type McpbManifest,
  type McpConfig,
  type ServerType,
  type UserConfigField,
} from "./manifest.js";

// =============================================================================
// Enums & Search Params
// =============================================================================

/** Supported operating system platforms */
export const PlatformSchema = z.enum(["darwin", "win32", "linux"]);

/** Sort options for package listings */
export const PackageSortSchema = z.enum(["downloads", "recent", "name"]);

/**
 * Package search query parameters.
 * HTTP query params arrive as strings, so limit/offset accept both.
 */
export const PackageSearchParamsSchema = z.object({
  q: z.string().optional(),
  type: ServerTypeSchema.optional(),
  tool: z.string().optional(),
  prompt: z.string().optional(),
  platform: PlatformSchema.optional(),
  sort: PackageSortSchema.optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  offset: z.union([z.string(), z.number()]).optional(),
});

/** Bundle search query parameters. */
export const BundleSearchParamsSchema = z.object({
  q: z.string().max(200).optional(),
  type: ServerTypeSchema.optional(),
  sort: PackageSortSchema.optional().default("downloads"),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

/** Bundle download query parameters (os + arch). */
export const BundleDownloadParamsSchema = z.object({
  os: z.enum(["darwin", "linux", "win32"]).describe("Target OS (darwin, linux, win32)").optional(),
  arch: z.enum(["x64", "arm64"]).describe("Target arch (x64, arm64)").optional(),
});

// =============================================================================
// TypeScript Types
// =============================================================================

export type Platform = z.infer<typeof PlatformSchema>;
export type PackageSort = z.infer<typeof PackageSortSchema>;
export type PackageSearchParams = z.infer<typeof PackageSearchParamsSchema>;
export type BundleSearchParams = z.infer<typeof BundleSearchParamsSchema>;
/** Input type — all fields optional (before defaults are applied). */
export type BundleSearchParamsInput = z.input<typeof BundleSearchParamsSchema>;
export type BundleDownloadParams = z.infer<typeof BundleDownloadParamsSchema>;
