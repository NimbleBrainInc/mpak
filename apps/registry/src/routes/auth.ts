import type { FastifyPluginAsync } from 'fastify';
import { toJsonSchema } from '../lib/zod-schema.js';
import { UserProfileSchema, type UserProfile } from '../schemas/generated/auth.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /app/auth/me - Get current authenticated user
  // This endpoint also syncs the user to the database when called
  fastify.get<{ Reply: UserProfile }>('/me', {
    schema: {
      tags: ['auth'],
      description: 'Get current authenticated user information',
      security: [{ bearerAuth: [] }],
      response: {
        200: toJsonSchema(UserProfileSchema),
      },
    },
    preHandler: fastify.authenticate,
    handler: async (request) => {
      if (!request.user) {
        throw new Error('Not authenticated');
      }

      // Fetch full user record from database (created by authenticate middleware)
      const dbUser = await fastify.repositories.users.findById(request.user.userId);

      return {
        id: request.user.userId,
        email: request.user.email,
        emailVerified: request.user.emailVerified,
        username: dbUser?.username ?? null,
        name: dbUser?.name ?? null,
        avatarUrl: dbUser?.avatarUrl ?? null,
        githubUsername: request.user.githubUsername ?? null,
        githubLinked: !!request.user.githubUsername,
        verified: request.user.metadata.verified ?? false,
        publishedBundles: request.user.metadata.publishedBundles ?? 0,
        totalDownloads: request.user.metadata.totalDownloads ?? 0,
        role: request.user.metadata.role ?? null,
        createdAt: dbUser?.createdAt ?? null,
        lastLoginAt: dbUser?.lastLoginAt ?? null,
      };
    },
  });
};
