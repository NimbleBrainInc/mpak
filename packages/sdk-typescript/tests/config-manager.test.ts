import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { ConfigManager, ConfigCorruptedError, CONFIG_VERSION } from '../src/config-manager.js';

describe('ConfigManager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-config-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('construction', () => {
    it('creates the config directory if it does not exist', () => {
      const configDir = join(testDir, 'nested', '.mpak');
      new ConfigManager(configDir);

      expect(existsSync(configDir)).toBe(true);
    });

    it('does not throw if the config directory already exists', () => {
      mkdirSync(join(testDir, '.mpak'), { recursive: true });

      expect(() => new ConfigManager(join(testDir, '.mpak'))).not.toThrow();
    });
  });

  describe('loadConfig', () => {
    it('creates a new config file if none exists', () => {
      const manager = new ConfigManager(testDir);
      const config = manager.loadConfig();

      expect(config.version).toBe(CONFIG_VERSION);
      expect(config.lastUpdated).toBeTruthy();
      expect(existsSync(join(testDir, 'config.json'))).toBe(true);
    });

    it('returns cached config on subsequent calls', () => {
      const manager = new ConfigManager(testDir);
      const first = manager.loadConfig();
      const second = manager.loadConfig();

      expect(first).toBe(second);
    });

    it('loads a valid minimal config from disk', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({ version: '1.0.0', lastUpdated: '2024-01-01T00:00:00Z' }),
        { mode: 0o600 },
      );

      const manager = new ConfigManager(testDir);
      const config = manager.loadConfig();

      expect(config.version).toBe('1.0.0');
      expect(config.lastUpdated).toBe('2024-01-01T00:00:00Z');
    });

    it('loads a valid full config from disk', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          registryUrl: 'https://custom.registry.com',
          packages: {
            '@scope/pkg': { api_key: 'secret', other_key: 'value' },
          },
        }),
        { mode: 0o600 },
      );

      const manager = new ConfigManager(testDir);
      const config = manager.loadConfig();

      expect(config.registryUrl).toBe('https://custom.registry.com');
      expect(config.packages?.['@scope/pkg']?.['api_key']).toBe('secret');
    });
  });

  describe('config file permissions', () => {
    it('writes config with 0o600 permissions', () => {
      const manager = new ConfigManager(testDir);
      manager.loadConfig();

      const stats = statSync(join(testDir, 'config.json'));
      // Mask out file type bits, keep permission bits only
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('registry URL', () => {
    it('returns default registry URL when nothing is configured', () => {
      const manager = new ConfigManager(testDir);

      expect(manager.getRegistryUrl()).toBe('https://registry.mpak.dev');
    });

    it('returns saved registry URL after setRegistryUrl', () => {
      const manager = new ConfigManager(testDir);
      manager.setRegistryUrl('https://custom.example.com');

      expect(manager.getRegistryUrl()).toBe('https://custom.example.com');
    });

    it('falls back to MPAK_REGISTRY_URL env var', () => {
      const original = process.env['MPAK_REGISTRY_URL'];
      try {
        process.env['MPAK_REGISTRY_URL'] = 'https://env.example.com';
        const manager = new ConfigManager(testDir);

        expect(manager.getRegistryUrl()).toBe('https://env.example.com');
      } finally {
        if (original === undefined) {
          delete process.env['MPAK_REGISTRY_URL'];
        } else {
          process.env['MPAK_REGISTRY_URL'] = original;
        }
      }
    });

    it('prefers saved URL over env var', () => {
      const original = process.env['MPAK_REGISTRY_URL'];
      try {
        process.env['MPAK_REGISTRY_URL'] = 'https://env.example.com';
        const manager = new ConfigManager(testDir);
        manager.setRegistryUrl('https://saved.example.com');

        expect(manager.getRegistryUrl()).toBe('https://saved.example.com');
      } finally {
        if (original === undefined) {
          delete process.env['MPAK_REGISTRY_URL'];
        } else {
          process.env['MPAK_REGISTRY_URL'] = original;
        }
      }
    });
  });

  describe('package config', () => {
    it('returns undefined for a package with no config', () => {
      const manager = new ConfigManager(testDir);

      expect(manager.getPackageConfig('@nonexistent/pkg')).toBeUndefined();
    });

    it('returns undefined for a non-existent key', () => {
      const manager = new ConfigManager(testDir);
      manager.setPackageConfigValue('@scope/name', 'existing', 'value');

      expect(manager.getPackageConfigValue('@scope/name', 'nonexistent')).toBeUndefined();
    });

    it('sets and gets a single value', () => {
      const manager = new ConfigManager(testDir);
      manager.setPackageConfigValue('@scope/name', 'api_key', 'test-value');

      expect(manager.getPackageConfigValue('@scope/name', 'api_key')).toBe('test-value');
    });

    it('gets all config for a package', () => {
      const manager = new ConfigManager(testDir);
      manager.setPackageConfigValue('@scope/name', 'key1', 'value1');
      manager.setPackageConfigValue('@scope/name', 'key2', 'value2');

      expect(manager.getPackageConfig('@scope/name')).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('clears a specific key', () => {
      const manager = new ConfigManager(testDir);
      manager.setPackageConfigValue('@scope/name', 'key1', 'value1');
      manager.setPackageConfigValue('@scope/name', 'key2', 'value2');

      expect(manager.clearPackageConfigValue('@scope/name', 'key1')).toBe(true);
      expect(manager.getPackageConfigValue('@scope/name', 'key1')).toBeUndefined();
      expect(manager.getPackageConfigValue('@scope/name', 'key2')).toBe('value2');
    });

    it('returns false when clearing a non-existent key', () => {
      const manager = new ConfigManager(testDir);
      manager.setPackageConfigValue('@scope/name', 'key1', 'value1');

      expect(manager.clearPackageConfigValue('@scope/name', 'nonexistent')).toBe(false);
    });

    it('clears all config for a package', () => {
      const manager = new ConfigManager(testDir);
      manager.setPackageConfigValue('@scope/name', 'key1', 'value1');
      manager.setPackageConfigValue('@scope/name', 'key2', 'value2');

      expect(manager.clearPackageConfig('@scope/name')).toBe(true);
      expect(manager.getPackageConfig('@scope/name')).toBeUndefined();
    });

    it('returns false when clearing a non-existent package', () => {
      const manager = new ConfigManager(testDir);

      expect(manager.clearPackageConfig('@nonexistent/pkg')).toBe(false);
    });

    it('cleans up empty package entry after clearing last key', () => {
      const manager = new ConfigManager(testDir);
      manager.setPackageConfigValue('@scope/name', 'only_key', 'value');
      manager.clearPackageConfigValue('@scope/name', 'only_key');

      expect(manager.getPackageConfig('@scope/name')).toBeUndefined();
      expect(manager.listPackagesWithConfig()).not.toContain('@scope/name');
    });

    it('lists all packages with config', () => {
      const manager = new ConfigManager(testDir);
      manager.setPackageConfigValue('@scope/pkg1', 'key', 'value');
      manager.setPackageConfigValue('@scope/pkg2', 'key', 'value');

      const packages = manager.listPackagesWithConfig();
      expect(packages).toContain('@scope/pkg1');
      expect(packages).toContain('@scope/pkg2');
      expect(packages).toHaveLength(2);
    });
  });

  describe('validation errors', () => {
    it('throws ConfigCorruptedError for invalid JSON', () => {
      writeFileSync(join(testDir, 'config.json'), 'not valid json {{{', { mode: 0o600 });

      const manager = new ConfigManager(testDir);
      expect(() => manager.loadConfig()).toThrow(ConfigCorruptedError);
      expect(() => manager.loadConfig()).toThrow(/invalid JSON/);
    });

    it('throws ConfigCorruptedError when version is missing', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({ lastUpdated: '2024-01-01T00:00:00Z' }),
        { mode: 0o600 },
      );

      const manager = new ConfigManager(testDir);
      expect(() => manager.loadConfig()).toThrow(ConfigCorruptedError);
    });

    it('throws ConfigCorruptedError when lastUpdated is missing', () => {
      writeFileSync(join(testDir, 'config.json'), JSON.stringify({ version: '1.0.0' }), {
        mode: 0o600,
      });

      const manager = new ConfigManager(testDir);
      expect(() => manager.loadConfig()).toThrow(ConfigCorruptedError);
    });

    it('throws ConfigCorruptedError for unknown fields', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          unknownField: 'should not be here',
        }),
        { mode: 0o600 },
      );

      const manager = new ConfigManager(testDir);
      expect(() => manager.loadConfig()).toThrow(ConfigCorruptedError);
    });

    it('throws ConfigCorruptedError when registryUrl is not a string', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          registryUrl: 12345,
        }),
        { mode: 0o600 },
      );

      const manager = new ConfigManager(testDir);
      expect(() => manager.loadConfig()).toThrow(ConfigCorruptedError);
    });

    it('throws ConfigCorruptedError when packages is not an object', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          packages: 'not an object',
        }),
        { mode: 0o600 },
      );

      const manager = new ConfigManager(testDir);
      expect(() => manager.loadConfig()).toThrow(ConfigCorruptedError);
    });

    it('throws ConfigCorruptedError when a package config value is not a string', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          packages: { '@scope/pkg': { api_key: 12345 } },
        }),
        { mode: 0o600 },
      );

      const manager = new ConfigManager(testDir);
      expect(() => manager.loadConfig()).toThrow(ConfigCorruptedError);
    });

    it('includes config path in error', () => {
      writeFileSync(join(testDir, 'config.json'), 'invalid json', { mode: 0o600 });

      const manager = new ConfigManager(testDir);
      try {
        manager.loadConfig();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigCorruptedError);
        expect((err as ConfigCorruptedError).configPath).toBe(join(testDir, 'config.json'));
      }
    });
  });
});
