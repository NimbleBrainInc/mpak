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
// MCPB Manifest (v0.3 spec)
// =============================================================================

/** User-configurable field declared by a bundle author. */
export const UserConfigFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  title: z.string().optional(),
  description: z.string().optional(),
  sensitive: z.boolean().optional(),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

/** MCP server launch configuration (command, args, env). */
export const McpConfigSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).optional(),
});

/** Author information. */
export const ManifestAuthorSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  url: z.string().optional(),
});

/** Server configuration block. */
export const ManifestServerSchema = z.object({
  type: ServerTypeSchema,
  entry_point: z.string(),
  mcp_config: McpConfigSchema,
});

/** MCP capability descriptor (tool, prompt, or resource). */
const CapabilitySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

/**
 * MCPB bundle manifest (v0.3).
 *
 * This is the `manifest.json` file that lives inside every `.mcpb` bundle.
 * It is the single source of truth for how to run the bundled MCP server.
 */
export const McpbManifestSchema = z.object({
  manifest_version: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  display_name: z.string().optional(),
  author: ManifestAuthorSchema.optional(),
  homepage: z.string().optional(),
  license: z.string().optional(),
  icon: z.string().optional(),
  repository: z.object({
    type: z.string().optional(),
    url: z.string().optional(),
  }).optional(),
  user_config: z.record(z.string(), UserConfigFieldSchema).optional(),
  server: ManifestServerSchema,
  tools: z.array(CapabilitySchema).optional(),
  prompts: z.array(CapabilitySchema).optional(),
  resources: z.array(CapabilitySchema).optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

// =============================================================================
// TypeScript Types
// =============================================================================

export type ServerType = z.infer<typeof ServerTypeSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
export type PackageSort = z.infer<typeof PackageSortSchema>;
export type PackageSearchParams = z.infer<typeof PackageSearchParamsSchema>;
export type BundleSearchParams = z.infer<typeof BundleSearchParamsSchema>;
export type BundleDownloadParams = z.infer<typeof BundleDownloadParamsSchema>;
export type UserConfigField = z.infer<typeof UserConfigFieldSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type ManifestAuthor = z.infer<typeof ManifestAuthorSchema>;
export type ManifestServer = z.infer<typeof ManifestServerSchema>;
export type McpbManifest = z.infer<typeof McpbManifestSchema>;
