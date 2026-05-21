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
  CreateSkillData,
  CreateSkillVersionData,
  CreateUserData,
  PackageSearchResult,
  SkillSearchFilters,
  SkillSearchResult,
  UpdateUserData,
} from './repositories/index.js';
// Repositories
export {
  PackageRepository,
  SkillRepository,
  UserRepository,
} from './repositories/index.js';

// Types
export type {
  FindOptions,
  IRepository,
  PackageSearchFilters,
  PackageWithRelations,
} from './types.js';
