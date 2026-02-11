import { z } from 'zod';

// Server type enum
export const ServerTypeSchema = z.enum(['node', 'python', 'binary']);

// Platform enum
export const PlatformSchema = z.enum(['darwin', 'win32', 'linux']);

// Sort options
export const PackageSortSchema = z.enum(['downloads', 'recent', 'name']);

// Package search params schema
// Query params from HTTP are always strings, but we parse them to proper types
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

// Export TypeScript types
export type ServerType = z.infer<typeof ServerTypeSchema>;
export type Platform = z.infer<typeof PlatformSchema>;
export type PackageSort = z.infer<typeof PackageSortSchema>;
export type PackageSearchParams = z.infer<typeof PackageSearchParamsSchema>;
