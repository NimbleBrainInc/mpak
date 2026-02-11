/**
 * Database layer exports
 * Main entry point for all database operations
 */

// Client and transaction helpers
export { getPrismaClient, disconnectDatabase, runInTransaction } from './client.js';
export type { TransactionClient, Prisma } from './client.js';

// Repositories
export {
  PackageRepository,
  UserRepository,
  SkillRepository,
} from './repositories/index.js';

export type {
  CreatePackageData,
  CreatePackageVersionData,
  PackageSearchResult,
  CreateUserData,
  UpdateUserData,
  CreateSkillData,
  CreateSkillVersionData,
  SkillSearchFilters,
  SkillSearchResult,
} from './repositories/index.js';

// Types
export type {
  IRepository,
  FindOptions,
  PackageSearchFilters,
  PackageWithRelations,
} from './types.js';
