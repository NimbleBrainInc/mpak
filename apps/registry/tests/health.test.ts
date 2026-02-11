import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('validateConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws when DATABASE_URL is empty', async () => {
    const { config, validateConfig } = await import('../src/config.js');
    // Mutate directly since the || default prevents empty via env
    config.database.url = '';
    expect(() => validateConfig()).toThrow('DATABASE_URL is required');
  });

  it('throws when CLERK_SECRET_KEY is missing in production', async () => {
    process.env['NODE_ENV'] = 'production';
    process.env['CLERK_SECRET_KEY'] = '';
    const { validateConfig } = await import('../src/config.js');
    expect(() => validateConfig()).toThrow('CLERK_SECRET_KEY is required in production');
  });

  it('throws when scanner enabled without callback secret', async () => {
    process.env['SCANNER_ENABLED'] = 'true';
    process.env['SCANNER_CALLBACK_SECRET'] = '';
    const { validateConfig } = await import('../src/config.js');
    expect(() => validateConfig()).toThrow('SCANNER_CALLBACK_SECRET is required when SCANNER_ENABLED=true');
  });

  it('passes with valid development config', async () => {
    process.env['DATABASE_URL'] = 'postgresql://localhost:5432/test';
    process.env['SCANNER_ENABLED'] = 'false';
    const { validateConfig } = await import('../src/config.js');
    expect(() => validateConfig()).not.toThrow();
  });
});
