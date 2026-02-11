/**
 * Legacy Database Plugin for Fastify
 * Provides raw pg Pool access for schema initialization
 * Note: Primary database access should use the Prisma plugin instead
 */

import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

declare module 'fastify' {
  interface FastifyInstance {
    pg: pg.Pool;
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  const pool = new Pool({
    connectionString: config.database.url,
  });

  try {
    const client = await pool.connect();
    fastify.log.info('Database connected successfully');
    client.release();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    fastify.log.error(`Database connection failed: ${errorMessage}`);
    throw error;
  }

  await initializeSchema(pool);

  fastify.decorate('pg', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
  });
};

async function initializeSchema(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS reserved_names (
        name VARCHAR(255) PRIMARY KEY,
        reason TEXT,
        reserved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS namespaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL UNIQUE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('personal', 'organization')),
        display_name VARCHAR(255),
        description TEXT,
        avatar_url VARCHAR(512),
        website VARCHAR(512),
        verified BOOLEAN DEFAULT FALSE,
        created_by VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS namespace_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        namespace_id UUID NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL,
        user_email VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        added_by VARCHAR(255),
        UNIQUE(namespace_id, user_id)
      );
    `);

    await client.query(`
      INSERT INTO reserved_names (name, reason) VALUES
        ('mcp', 'Official MCP package'),
        ('claude', 'Official Claude package'),
        ('anthropic', 'Official Anthropic package'),
        ('official', 'Reserved'),
        ('admin', 'Reserved system name'),
        ('api', 'Reserved system name'),
        ('www', 'Reserved system name'),
        ('registry', 'Reserved system name'),
        ('support', 'Reserved system name'),
        ('help', 'Reserved system name'),
        ('security', 'Reserved system name'),
        ('abuse', 'Reserved system name'),
        ('root', 'Reserved system name'),
        ('system', 'Reserved system name')
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default fp(databasePlugin);
export { databasePlugin };
