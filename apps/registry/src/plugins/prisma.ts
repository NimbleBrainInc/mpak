/**
 * Prisma Database Plugin for Fastify
 * Provides database access via repositories throughout the application
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import {
  getPrismaClient,
  disconnectDatabase,
  PackageRepository,
  UserRepository,
  SkillRepository,
} from '../db/index.js';
import type { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    repositories: {
      packages: PackageRepository;
      users: UserRepository;
      skills: SkillRepository;
    };
  }
}

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  const prisma = getPrismaClient();

  try {
    await prisma.$connect();
    fastify.log.info('Database connected successfully (Prisma)');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    fastify.log.error(`Database connection failed: ${errorMessage}`);
    throw error;
  }

  const repositories = {
    packages: new PackageRepository(),
    users: new UserRepository(),
    skills: new SkillRepository(),
  };

  fastify.decorate('prisma', prisma);
  fastify.decorate('repositories', repositories);

  fastify.addHook('onClose', async () => {
    fastify.log.info('Disconnecting from database...');
    await disconnectDatabase();
  });
};

export default fp(prismaPlugin);
export { prismaPlugin };
