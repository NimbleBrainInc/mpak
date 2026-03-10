import { z } from "zod";

export const BundleSearchQuerySchema = z.object({
	q: z.optional(z.string()),
	type: z.optional(z.enum(["node", "python", "binary"])),
	sort: z.optional(
		z.enum(["downloads", "recent", "name"]).default("downloads"),
	),
	limit: z.optional(z.number().min(1).max(100).default(20)),
	offset: z.optional(z.number().min(0).default(0)),
});

export type BundleSearchQuery = z.infer<typeof BundleSearchQuerySchema>;
