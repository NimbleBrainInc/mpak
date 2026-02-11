/**
 * Shared types and interfaces for the repository layer
 */

import type { Prisma, TransactionClient } from './client.js';

/**
 * Base repository interface
 */
export interface IRepository<T> {
  findById(id: string, tx?: TransactionClient): Promise<T | null>;
  create(data: unknown, tx?: TransactionClient): Promise<T>;
  update(id: string, data: unknown, tx?: TransactionClient): Promise<T>;
  delete(id: string, tx?: TransactionClient): Promise<void>;
}

/**
 * Common query options
 */
export interface FindOptions {
  skip?: number;
  take?: number;
  orderBy?: unknown;
}

/**
 * Package search filters
 */
export interface PackageSearchFilters {
  query?: string;
  serverType?: string;
  verified?: boolean;
  createdBy?: string;
  claimedBy?: string;
}

/**
 * Package with relations
 */
export type PackageWithRelations = Prisma.PackageGetPayload<{
  include: {
    versions: true;
  };
}>;
