import { z } from 'zod';

export const BundleSearchQuerySchema = z.object({
  q: z.optional(z.string()),
  type: z.optional(z.enum(['node', 'python', 'binary'])),
  sort: z.enum(['downloads', 'recent', 'name']).optional().default('downloads'),
  limit: z.number().min(1).max(100).optional().default(20),
  offset: z.number().min(0).optional().default(0),
});

export type BundleSearchQuery = z.infer<typeof BundleSearchQuerySchema>;
