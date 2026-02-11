/**
 * User Repository
 * Handles operations for users (synced from Clerk)
 */

import type { User } from '@prisma/client';
import { getPrismaClient, type TransactionClient } from '../client.js';

export interface CreateUserData {
  clerkId: string;
  email: string;
  username?: string;
  name?: string;
  avatarUrl?: string;
  githubUsername?: string;
  githubUserId?: string;
  emailVerified?: boolean;
}

export interface UpdateUserData {
  email?: string;
  username?: string;
  name?: string;
  avatarUrl?: string;
  githubUsername?: string;
  githubUserId?: string;
  emailVerified?: boolean;
  lastLoginAt?: Date;
}

export class UserRepository {
  /**
   * Find user by internal UUID
   */
  async findById(id: string, tx?: TransactionClient): Promise<User | null> {
    const client = tx ?? getPrismaClient();
    return client.user.findUnique({
      where: { id },
    });
  }

  /**
   * Find user by Clerk ID
   */
  async findByClerkId(clerkId: string, tx?: TransactionClient): Promise<User | null> {
    const client = tx ?? getPrismaClient();
    return client.user.findUnique({
      where: { clerkId },
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string, tx?: TransactionClient): Promise<User | null> {
    const client = tx ?? getPrismaClient();
    return client.user.findUnique({
      where: { email },
    });
  }

  /**
   * Find user by GitHub username
   */
  async findByGitHubUsername(
    githubUsername: string,
    tx?: TransactionClient
  ): Promise<User | null> {
    const client = tx ?? getPrismaClient();
    return client.user.findFirst({
      where: { githubUsername },
    });
  }

  /**
   * Find user by username
   */
  async findByUsername(username: string, tx?: TransactionClient): Promise<User | null> {
    const client = tx ?? getPrismaClient();
    return client.user.findUnique({
      where: { username },
    });
  }

  /**
   * Create a user
   */
  async create(data: CreateUserData, tx?: TransactionClient): Promise<User> {
    const client = tx ?? getPrismaClient();
    return client.user.create({
      data: {
        clerkId: data.clerkId,
        email: data.email,
        username: data.username,
        name: data.name,
        avatarUrl: data.avatarUrl,
        githubUsername: data.githubUsername,
        githubUserId: data.githubUserId,
        emailVerified: data.emailVerified ?? false,
        lastLoginAt: new Date(),
      },
    });
  }

  /**
   * Update a user
   */
  async update(id: string, data: UpdateUserData, tx?: TransactionClient): Promise<User> {
    const client = tx ?? getPrismaClient();
    return client.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Upsert user (create or update)
   * Used when user logs in via Clerk
   */
  async upsert(data: CreateUserData, tx?: TransactionClient): Promise<User> {
    const client = tx ?? getPrismaClient();
    return client.user.upsert({
      where: { clerkId: data.clerkId },
      update: {
        email: data.email,
        username: data.username,
        name: data.name,
        avatarUrl: data.avatarUrl,
        githubUsername: data.githubUsername,
        githubUserId: data.githubUserId,
        emailVerified: data.emailVerified,
        lastLoginAt: new Date(),
      },
      create: {
        clerkId: data.clerkId,
        email: data.email,
        username: data.username,
        name: data.name,
        avatarUrl: data.avatarUrl,
        githubUsername: data.githubUsername,
        githubUserId: data.githubUserId,
        emailVerified: data.emailVerified ?? false,
        lastLoginAt: new Date(),
      },
    });
  }

  /**
   * Update last login time
   */
  async updateLastLogin(id: string, tx?: TransactionClient): Promise<User> {
    const client = tx ?? getPrismaClient();
    return client.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  /**
   * Delete a user
   */
  async delete(id: string, tx?: TransactionClient): Promise<void> {
    const client = tx ?? getPrismaClient();
    await client.user.delete({
      where: { id },
    });
  }

  /**
   * Get user statistics
   */
  async getStats(tx?: TransactionClient): Promise<{
    total: number;
    verified: number;
    withGitHub: number;
  }> {
    const client = tx ?? getPrismaClient();

    const [total, verified, withGitHub] = await Promise.all([
      client.user.count(),
      client.user.count({ where: { emailVerified: true } }),
      client.user.count({
        where: {
          githubUsername: { not: null },
        },
      }),
    ]);

    return { total, verified, withGitHub };
  }
}
