import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { config } from '../config.js';
import type { AuthenticatedUser } from '../types.js';
import { UnauthorizedError } from '../errors/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const clerkClient = createClerkClient({
    secretKey: config.clerk.secretKey,
  });

  async function authenticate(request: FastifyRequest): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    try {
      const verifyResult = await verifyToken(token, {
        secretKey: config.clerk.secretKey,
      });

      const user = await clerkClient.users.getUser(verifyResult.sub);

      const primaryEmail = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
      const email = primaryEmail?.emailAddress ?? '';
      const emailVerified = primaryEmail?.verification?.status === 'verified';

      const githubAccount = user.externalAccounts?.find((account) => account.provider === 'oauth_github');
      const githubUsername = githubAccount?.username ?? null;
      const githubUserId = (githubAccount as unknown as Record<string, unknown>)?.['providerUserId'] as string | null ?? null;

      const name = user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.firstName ?? user.lastName ?? user.username ?? null;

      const dbUser = await fastify.repositories.users.upsert({
        clerkId: user.id,
        email,
        username: user.username ?? undefined,
        name: name ?? undefined,
        avatarUrl: user.imageUrl ?? undefined,
        githubUsername: githubUsername ?? undefined,
        githubUserId: githubUserId ?? undefined,
        emailVerified,
      });

      const publicMetadata = user.publicMetadata as Record<string, unknown> | undefined;

      const authenticatedUser: AuthenticatedUser = {
        userId: dbUser.id,
        email,
        emailVerified,
        githubUsername: githubUsername ?? undefined,
        metadata: {
          verified: (publicMetadata?.['verified'] as boolean) ?? false,
          publishedBundles: (publicMetadata?.['publishedBundles'] as number) ?? 0,
          totalDownloads: (publicMetadata?.['totalDownloads'] as number) ?? 0,
          role: (publicMetadata?.['role'] as string) ?? undefined,
        },
      };

      request.user = authenticatedUser;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'UnknownError';
      fastify.log.error({ errorName, errorMessage, error }, 'Authentication error');
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  fastify.decorate('authenticate', authenticate);
};

export default fp(authPlugin);
export { authPlugin };
