/**
 * Prisma Database Client
 * Singleton pattern for database connection management
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import type { Prisma } from '@prisma/client';

let prismaInstance: PrismaClient | null = null;
let pgPool: pg.Pool | null = null;

/**
 * Get the Prisma client instance (singleton)
 */
export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    pgPool = new pg.Pool({
      connectionString: process.env['DATABASE_URL'],
    });

    const adapter = new PrismaPg(pgPool);

    prismaInstance = new PrismaClient({
      adapter,
      log: process.env['NODE_ENV'] === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return prismaInstance;
}

/**
 * Disconnect from the database
 */
export async function disconnectDatabase(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

/**
 * Transaction helper - provides a clean way to run multiple operations atomically
 *
 * Default timeout is 30 seconds (increased from Prisma's default 5s to handle
 * complex operations like package publishing with file uploads and verification)
 */
export async function runInTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
  }
): Promise<T> {
  const client = getPrismaClient();
  return client.$transaction(fn, {
    maxWait: options?.maxWait ?? 2000,
    timeout: options?.timeout ?? 30000,
  });
}

export type TransactionClient = Prisma.TransactionClient;
export type { Prisma };
