import { z } from 'zod';

/**
 * Convert a Zod schema to JSON Schema for Fastify route definitions.
 * Uses Zod v4's built-in toJSONSchema() with draft-07 target (required by Fastify).
 */
export function toJsonSchema<T extends z.ZodType>(schema: T): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'draft-07',
    unrepresentable: 'any',
  });
}
