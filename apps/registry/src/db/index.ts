/**
 * Database layer exports
 * Main entry point for all database operations
 */

export type { Prisma, TransactionClient } from './client.js';
// Client and transaction helpers
export { disconnectDatabase, getPrismaClient, runInTransaction } from './client.js';
export type {
  CreatePackageData,
  CreatePackageVersionData,
  CreateUserData,
  PackageSearchResult,
  UpdateUserData,
} from './repositories/index.js';
// Repositories
export {
  PackageRepository,
  UserRepository,
} from './repositories/index.js';

// Types
export type {
  FindOptions,
  IRepository,
  PackageSearchFilters,
  PackageWithRelations,
} from './types.js';
