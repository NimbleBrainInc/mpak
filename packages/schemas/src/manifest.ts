import { z } from "zod";

// =============================================================================
// Manifest Building Blocks
// =============================================================================

/** Server runtime type (v0.4 added "uv"). */
export const ServerTypeSchema = z.enum(["node", "python", "binary", "uv"]);

/**
 * A path that must resolve to a location within the bundle root.
 *
 * Rejects empty strings, NUL bytes, any backslash (MCPB bundles are zip
 * archives that use forward slashes), absolute paths (POSIX `/foo`, any
 * Windows drive prefix `C:`), and any segment equal to `..`.
 *
 * The MCPB spec defines path-typed manifest fields (e.g. `server.entry_point`)
 * as relative to the bundle root. Enforcing that at the schema layer means
 * every consumer — validators, runtime launchers, registry, scanner — gets
 * the same guarantee without duplicating the check.
 *
 * Pure-JS (no `node:path`) so this package stays browser-safe.
 */
export const SafeRelativePathSchema = z
  .string()
  .min(1, "must not be empty")
  .refine((p) => !p.includes("\0"), {
    message: "must not contain NUL bytes",
  })
  .refine((p) => !p.includes("\\"), {
    // MCPB bundles are zip archives; ZIP central directories use forward slashes.
    // Rejecting all backslashes blocks Windows-style traversal forms (`\foo`,
    // `C:\foo`, `\\server\share`, `foo\..\bar`) without needing per-form rules.
    message:
      "must use forward slashes only (backslashes are not permitted)",
  })
  .refine(
    (p) => {
      if (p.startsWith("/")) return false; // POSIX absolute
      if (/^[a-zA-Z]:/.test(p)) return false; // Windows drive (with or without separator)
      if (p.split("/").includes("..")) return false; // traversal segment
      return true;
    },
    {
      message:
        'must be a relative path within the bundle (no absolute paths or ".." segments)',
    },
  );

/** User-configurable field declared by a bundle author. */
export const UserConfigFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  title: z.string().optional(),
  description: z.string().optional(),
  sensitive: z.boolean().optional(),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

/**
 * MCP server launch configuration (command, args, env).
 *
 * `command` is optional per MCPB v0.4 — for `type: "uv"` the spec lets the
 * host manage execution, in which case the bundle may omit `mcp_config`
 * entirely. When present and `command` is omitted, the resolver supplies a
 * sensible default for the server type.
 */
export const McpConfigSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

/**
 * Runtime version requirements (`compatibility.runtimes`).
 *
 * Each value is a semver range (e.g. `">=3.13,<4.0"`). Bundle authors only
 * declare runtimes their bundle actually uses.
 */
export const CompatibilityRuntimesSchema = z.object({
  python: z.string().optional(),
  node: z.string().optional(),
});

/**
 * Compatibility block.
 *
 * Known fields (`platforms`, `runtimes`) are typed; unknown keys are treated
 * as client version constraints (e.g. `claude_desktop: ">=1.0.0"`,
 * `my_client: ">1.0.0"`) and pass through as semver strings, per MCPB spec.
 */
export const CompatibilitySchema = z
  .object({
    // Inlined `z.enum(["darwin", "win32", "linux"])` — the same enum exists as
    // `PlatformSchema` in package.ts but importing it here would create a
    // module cycle (package.ts already imports `ServerTypeSchema` from this
    // file). Three strings; not worth a shared module.
    platforms: z
      .array(z.enum(["darwin", "win32", "linux"]))
      .optional(),
    runtimes: CompatibilityRuntimesSchema.optional(),
  })
  .catchall(z.string());

/** Author information. */
export const ManifestAuthorSchema = z.object({
  name: z.string(),
  email: z.string().optional(),
  url: z.string().optional(),
});

/**
 * Server configuration block.
 *
 * `mcp_config` is optional per MCPB v0.4 — `type: "uv"` bundles may omit it
 * entirely and let the host manage execution.
 */
export const ManifestServerSchema = z.object({
  type: ServerTypeSchema,
  entry_point: SafeRelativePathSchema,
  // Optional per MCPB v0.4 — `type: "uv"` bundles may omit and let
  // the host manage execution.
  mcp_config: McpConfigSchema.optional(),
});

/** MCP capability descriptor (tool, prompt, or resource). */
export const CapabilitySchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

// =============================================================================
// MCPB Manifest Schema
// =============================================================================

/**
 * MCPB bundle manifest.
 *
 * Compatible with both v0.3 and v0.4 of the upstream spec.
 * The two versions are backward-compatible (v0.4 only adds "uv" server type).
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
  repository: z
    .object({
      type: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  user_config: z.record(z.string(), UserConfigFieldSchema).optional(),
  server: ManifestServerSchema,
  compatibility: CompatibilitySchema.optional(),
  tools: z.array(CapabilitySchema).optional(),
  prompts: z.array(CapabilitySchema).optional(),
  resources: z.array(CapabilitySchema).optional(),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

// =============================================================================
// TypeScript Types
// =============================================================================

export type ServerType = z.infer<typeof ServerTypeSchema>;
export type UserConfigField = z.infer<typeof UserConfigFieldSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type CompatibilityRuntimes = z.infer<typeof CompatibilityRuntimesSchema>;
export type Compatibility = z.infer<typeof CompatibilitySchema>;
export type ManifestAuthor = z.infer<typeof ManifestAuthorSchema>;
export type ManifestServer = z.infer<typeof ManifestServerSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type McpbManifest = z.infer<typeof McpbManifestSchema>;
