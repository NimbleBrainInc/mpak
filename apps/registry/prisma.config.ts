import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

// Load .env from repo root (for local dev only - in production, env vars are set by K8s)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  datasource: {
    url: process.env['DIRECT_URL'] || process.env['DATABASE_URL']!,
  },
});
