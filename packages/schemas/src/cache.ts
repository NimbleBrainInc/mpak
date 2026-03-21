import { z } from "zod";
import { PlatformInfoSchema } from "./api-responses.js";

// =============================================================================
// Cache Metadata
// =============================================================================

/**
 * Zod schema for the `.mpak-meta.json` file written alongside cached bundles.
 *
 * `.strict()` rejects unknown fields so corrupted or hand-edited files
 * are caught on read rather than silently accepted.
 */
export const CacheMetadataSchema = z
  .object({
    version: z.string(),
    pulledAt: z.string(),
    lastCheckedAt: z.string().optional(),
    platform: PlatformInfoSchema,
  })
  .strict();

export type CacheMetadata = z.infer<typeof CacheMetadataSchema>;
