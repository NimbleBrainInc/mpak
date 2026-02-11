import { z } from 'zod';

// =============================================================================
// Agent Skills Specification - Skill Frontmatter Schema
// https://agentskills.io/specification
// =============================================================================

/**
 * Skill name validation
 * - 1-64 characters
 * - Lowercase alphanumeric with single hyphens
 * - Cannot start or end with hyphen
 * - Must match directory name (validated separately)
 */
export const SkillNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
    'Lowercase alphanumeric with single hyphens, cannot start/end with hyphen'
  );

/**
 * Skill description
 * - 1-1024 characters
 * - Should describe what the skill does AND when to use it
 */
export const SkillDescriptionSchema = z.string().min(1).max(1024);

// =============================================================================
// Discovery Metadata Extension (via metadata: field)
// =============================================================================

/**
 * Category taxonomy for skill discovery
 */
export const SkillCategorySchema = z.enum([
  'development', // Code, debugging, architecture
  'writing', // Documentation, content, editing
  'research', // Investigation, analysis, learning
  'consulting', // Strategy, decisions, planning
  'data', // Analysis, visualization, processing
  'design', // UI/UX, visual, creative
  'operations', // DevOps, infrastructure, automation
  'security', // Auditing, compliance, protection
  'other', // Uncategorized
]);

/**
 * Author information for attribution
 */
export const SkillAuthorSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  email: z.string().email().optional(),
});

/**
 * Example usage for discovery
 */
export const SkillExampleSchema = z.object({
  prompt: z.string().min(1),
  context: z.string().optional(),
});

/**
 * Discovery metadata (via metadata: field in frontmatter)
 * All fields optional - skills can start minimal and add discovery metadata later
 */
export const SkillDiscoveryMetadataSchema = z
  .object({
    // Discovery
    tags: z.array(z.string().max(32)).max(10).optional(),
    category: SkillCategorySchema.optional(),
    triggers: z.array(z.string().max(128)).max(20).optional(),
    keywords: z.array(z.string().max(32)).max(30).optional(),

    // Attribution
    author: SkillAuthorSchema.optional(),

    // Version (for registry tracking)
    version: z.string().optional(),

    // Examples
    examples: z.array(SkillExampleSchema).max(5).optional(),
  })
  .passthrough(); // Allow additional custom keys

// =============================================================================
// Complete SKILL.md Frontmatter Schema
// =============================================================================

/**
 * Complete SKILL.md frontmatter schema
 * Combines official Agent Skills spec with discovery metadata extension
 */
export const SkillFrontmatterSchema = z.object({
  // Required (official spec)
  name: SkillNameSchema,
  description: SkillDescriptionSchema,

  // Optional (official spec - informational pass-through)
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  'allowed-tools': z.string().optional(), // space-delimited, experimental

  // Extensible metadata (official spec) - our discovery extension
  metadata: SkillDiscoveryMetadataSchema.optional(),
});

// =============================================================================
// Registry API Schemas
// =============================================================================

/**
 * Scoped skill name for registry (e.g., @nimblebraininc/strategic-thought-partner)
 */
export const ScopedSkillNameSchema = z
  .string()
  .regex(
    /^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/,
    'Scoped name format: @scope/name'
  );

/**
 * Skill artifact info for announce endpoint
 */
export const SkillArtifactSchema = z.object({
  filename: z.string().regex(/\.skill$/, 'Must have .skill extension'),
  sha256: z.string().length(64),
  size: z.number().int().positive(),
});

/**
 * Announce request schema for POST /v1/skills/announce
 */
export const SkillAnnounceRequestSchema = z.object({
  name: ScopedSkillNameSchema,
  version: z.string(),
  skill: SkillFrontmatterSchema,
  release_tag: z.string(),
  prerelease: z.boolean().optional().default(false),
  artifact: SkillArtifactSchema,
});

/**
 * Announce response schema
 */
export const SkillAnnounceResponseSchema = z.object({
  skill: z.string(),
  version: z.string(),
  status: z.enum(['created', 'exists']),
});

// =============================================================================
// Search/List API Schemas
// =============================================================================

/**
 * Skill search parameters
 */
export const SkillSearchParamsSchema = z.object({
  q: z.string().optional(),
  tags: z.string().optional(), // comma-separated
  category: SkillCategorySchema.optional(),
  sort: z.enum(['downloads', 'recent', 'name']).optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  offset: z.union([z.string(), z.number()]).optional(),
});

/**
 * Skill summary for search results
 */
export const SkillSummarySchema = z.object({
  name: z.string(), // scoped name
  description: z.string(),
  latest_version: z.string(),
  tags: z.array(z.string()).optional(),
  category: SkillCategorySchema.optional(),
  downloads: z.number(),
  published_at: z.string(),
  author: SkillAuthorSchema.optional(),
});

/**
 * Skill search response
 */
export const SkillSearchResponseSchema = z.object({
  skills: z.array(SkillSummarySchema),
  total: z.number(),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    has_more: z.boolean(),
  }),
});

/**
 * Skill detail response
 */
export const SkillDetailSchema = z.object({
  name: z.string(), // scoped name
  description: z.string(),
  latest_version: z.string(),
  license: z.string().optional(),
  compatibility: z.string().optional(),
  allowed_tools: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  category: SkillCategorySchema.optional(),
  triggers: z.array(z.string()).optional(),
  downloads: z.number(),
  published_at: z.string(),
  author: SkillAuthorSchema.optional(),
  examples: z.array(SkillExampleSchema).optional(),
  versions: z.array(
    z.object({
      version: z.string(),
      published_at: z.string(),
      downloads: z.number(),
    })
  ),
});

/**
 * Skill download info response
 */
export const SkillDownloadInfoSchema = z.object({
  url: z.string(),
  skill: z.object({
    name: z.string(),
    version: z.string(),
    sha256: z.string(),
    size: z.number(),
  }),
  expires_at: z.string(),
});

// =============================================================================
// TypeScript Types
// =============================================================================

export type SkillName = z.infer<typeof SkillNameSchema>;
export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export type SkillAuthor = z.infer<typeof SkillAuthorSchema>;
export type SkillExample = z.infer<typeof SkillExampleSchema>;
export type SkillDiscoveryMetadata = z.infer<typeof SkillDiscoveryMetadataSchema>;
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;
export type ScopedSkillName = z.infer<typeof ScopedSkillNameSchema>;
export type SkillArtifact = z.infer<typeof SkillArtifactSchema>;
export type SkillAnnounceRequest = z.infer<typeof SkillAnnounceRequestSchema>;
export type SkillAnnounceResponse = z.infer<typeof SkillAnnounceResponseSchema>;
export type SkillSearchParams = z.infer<typeof SkillSearchParamsSchema>;
export type SkillSummary = z.infer<typeof SkillSummarySchema>;
export type SkillSearchResponse = z.infer<typeof SkillSearchResponseSchema>;
export type SkillDetail = z.infer<typeof SkillDetailSchema>;
export type SkillDownloadInfo = z.infer<typeof SkillDownloadInfoSchema>;
