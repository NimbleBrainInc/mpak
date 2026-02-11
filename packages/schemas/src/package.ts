import { z } from "zod";

// =============================================================================
// Enums & Search Params
// =============================================================================

/** Server runtime type */
export const ServerTypeSchema = z.enum(["node", "python", "binary"]);

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

// =============================================================================
// TypeScript Types
// =============================================================================

export type ServerType = z.infer<typeof ServerTypeSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
export type PackageSort = z.infer<typeof PackageSortSchema>;
export type PackageSearchParams = z.infer<typeof PackageSearchParamsSchema>;
