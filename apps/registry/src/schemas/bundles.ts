import { z } from 'zod';

/** Path params for routes like /@:scope/:package/versions/:version/download */
export const BundleVersionPathParamsSchema = z.object({
  scope: z.string(),
  package: z.string(),
  version: z.string(),
});

export type BundleVersionPathParams = z.infer<typeof BundleVersionPathParamsSchema>;
