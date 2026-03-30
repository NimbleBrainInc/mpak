import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MpakConfigManager } from '../src/config-manager.js';
import { MpakConfigCorruptedError } from '../src/errors.js';

describe('MpakConfigManager', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-config-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('construction', () => {
    it('does not create the config directory on construction', () => {
      const configDir = join(testDir, 'nested', '.mpak');
      new MpakConfigManager({ mpakHome: configDir });

      expect(existsSync(configDir)).toBe(false);
    });

    it('does not throw if the config directory already exists', () => {
      mkdirSync(join(testDir, '.mpak'), { recursive: true });

      expect(() => new MpakConfigManager({ mpakHome: join(testDir, '.mpak') })).not.toThrow();
    });

    it('exposes mpakHome as the resolved base directory', () => {
      const customDir = join(testDir, 'custom');
      const manager = new MpakConfigManager({ mpakHome: customDir });

      expect(manager.mpakHome).toBe(customDir);
    });

    it('persists registry URL to disk when passed in constructor', () => {
      const manager = new MpakConfigManager({
        mpakHome: testDir,
        registryUrl: 'https://custom.registry.dev',
      });

      expect(manager.getRegistryUrl()).toBe('https://custom.registry.dev');
      expect(existsSync(join(testDir, 'config.json'))).toBe(true);
    });
  });

  describe('lazy filesystem behavior', () => {
    it('does not create config file on read-only usage', () => {
      const configDir = join(testDir, 'lazy');
      const manager = new MpakConfigManager({ mpakHome: configDir });

      manager.getRegistryUrl();
      manager.getPackageConfig('@scope/pkg');
      manager.getPackageNames();

      expect(existsSync(configDir)).toBe(false);
      expect(existsSync(join(configDir, 'config.json'))).toBe(false);
    });

    it('creates config directory and file on first write', () => {
      const configDir = join(testDir, 'nested', '.mpak');
      const manager = new MpakConfigManager({ mpakHome: configDir });

      manager.setPackageConfigValue('@scope/pkg', 'key', 'value');

      expect(existsSync(configDir)).toBe(true);
      expect(existsSync(join(configDir, 'config.json'))).toBe(true);
    });
  });

  describe('config file permissions', () => {
    it('writes config with 0o600 permissions', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });
      manager.setPackageConfigValue('@scope/pkg', 'key', 'value');

      const stats = statSync(join(testDir, 'config.json'));
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('registry URL', () => {
    it('returns default registry URL when nothing is configured', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });

      expect(manager.getRegistryUrl()).toBe('https://registry.mpak.dev');
    });

    it('returns saved registry URL from config file', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          registryUrl: 'https://custom.example.com',
        }),
        { mode: 0o600 },
      );

      const manager = new MpakConfigManager({ mpakHome: testDir });
      expect(manager.getRegistryUrl()).toBe('https://custom.example.com');
    });

    it('returns constructor registry URL', () => {
      const manager = new MpakConfigManager({
        mpakHome: testDir,
        registryUrl: 'https://constructor.example.com',
      });

      expect(manager.getRegistryUrl()).toBe('https://constructor.example.com');
    });

    it('persists constructor registry URL across instances', () => {
      new MpakConfigManager({
        mpakHome: testDir,
        registryUrl: 'https://persisted.example.com',
      });

      const manager2 = new MpakConfigManager({ mpakHome: testDir });
      expect(manager2.getRegistryUrl()).toBe('https://persisted.example.com');
    });
  });

  describe('package config', () => {
    it('returns undefined for a package with no config', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });

      expect(manager.getPackageConfig('@nonexistent/pkg')).toBeUndefined();
    });

    it('sets and gets config for a package', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });
      manager.setPackageConfigValue('@scope/name', 'api_key', 'test-value');

      expect(manager.getPackageConfig('@scope/name')).toEqual({
        api_key: 'test-value',
      });
    });

    it('sets multiple values for a package', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });
      manager.setPackageConfigValue('@scope/name', 'key1', 'value1');
      manager.setPackageConfigValue('@scope/name', 'key2', 'value2');

      expect(manager.getPackageConfig('@scope/name')).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('overwrites an existing value', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });
      manager.setPackageConfigValue('@scope/name', 'key', 'old');
      manager.setPackageConfigValue('@scope/name', 'key', 'new');

      expect(manager.getPackageConfig('@scope/name')).toEqual({ key: 'new' });
    });

    it('clears a specific key', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });
      manager.setPackageConfigValue('@scope/name', 'key1', 'value1');
      manager.setPackageConfigValue('@scope/name', 'key2', 'value2');

      expect(manager.clearPackageConfigValue('@scope/name', 'key1')).toBe(true);
      expect(manager.getPackageConfig('@scope/name')).toEqual({ key2: 'value2' });
    });

    it('returns false when clearing a non-existent key', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });
      manager.setPackageConfigValue('@scope/name', 'key1', 'value1');

      expect(manager.clearPackageConfigValue('@scope/name', 'nonexistent')).toBe(false);
    });

    it('clears all config for a package', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });
      manager.setPackageConfigValue('@scope/name', 'key1', 'value1');
      manager.setPackageConfigValue('@scope/name', 'key2', 'value2');

      expect(manager.clearPackageConfig('@scope/name')).toBe(true);
      expect(manager.getPackageConfig('@scope/name')).toBeUndefined();
    });

    it('returns false when clearing a non-existent package', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });

      expect(manager.clearPackageConfig('@nonexistent/pkg')).toBe(false);
    });

    it('cleans up empty package entry after clearing last key', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });
      manager.setPackageConfigValue('@scope/name', 'only_key', 'value');
      manager.clearPackageConfigValue('@scope/name', 'only_key');

      expect(manager.getPackageConfig('@scope/name')).toBeUndefined();
      expect(manager.getPackageNames()).not.toContain('@scope/name');
    });

    it('lists all packages with config', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });
      manager.setPackageConfigValue('@scope/pkg1', 'key', 'value');
      manager.setPackageConfigValue('@scope/pkg2', 'key', 'value');

      const packages = manager.getPackageNames();
      expect(packages).toContain('@scope/pkg1');
      expect(packages).toContain('@scope/pkg2');
      expect(packages).toHaveLength(2);
    });

    it('returns empty array when no packages are configured', () => {
      const manager = new MpakConfigManager({ mpakHome: testDir });

      expect(manager.getPackageNames()).toEqual([]);
    });
  });

  describe('persistence', () => {
    it('config persists across instances', () => {
      const manager1 = new MpakConfigManager({ mpakHome: testDir });
      manager1.setPackageConfigValue('@scope/pkg', 'api_key', 'sk-test');

      const manager2 = new MpakConfigManager({ mpakHome: testDir });
      expect(manager2.getPackageConfig('@scope/pkg')).toEqual({ api_key: 'sk-test' });
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

      const manager = new MpakConfigManager({ mpakHome: testDir });

      expect(manager.getRegistryUrl()).toBe('https://custom.registry.com');
      expect(manager.getPackageConfig('@scope/pkg')).toEqual({
        api_key: 'secret',
        other_key: 'value',
      });
    });
  });

  describe('validation errors', () => {
    it('throws MpakConfigCorruptedError for invalid JSON', () => {
      writeFileSync(join(testDir, 'config.json'), 'not valid json {{{', { mode: 0o600 });

      const manager = new MpakConfigManager({ mpakHome: testDir });
      expect(() => manager.getRegistryUrl()).toThrow(MpakConfigCorruptedError);
      expect(() => manager.getRegistryUrl()).toThrow(/invalid JSON/);
    });

    it('throws MpakConfigCorruptedError when version is missing', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({ lastUpdated: '2024-01-01T00:00:00Z' }),
        { mode: 0o600 },
      );

      const manager = new MpakConfigManager({ mpakHome: testDir });
      expect(() => manager.getRegistryUrl()).toThrow(MpakConfigCorruptedError);
    });

    it('throws MpakConfigCorruptedError when lastUpdated is missing', () => {
      writeFileSync(join(testDir, 'config.json'), JSON.stringify({ version: '1.0.0' }), {
        mode: 0o600,
      });

      const manager = new MpakConfigManager({ mpakHome: testDir });
      expect(() => manager.getRegistryUrl()).toThrow(MpakConfigCorruptedError);
    });

    it('throws MpakConfigCorruptedError for unknown fields', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          unknownField: 'should not be here',
        }),
        { mode: 0o600 },
      );

      const manager = new MpakConfigManager({ mpakHome: testDir });
      expect(() => manager.getRegistryUrl()).toThrow(MpakConfigCorruptedError);
    });

    it('throws MpakConfigCorruptedError when registryUrl is not a string', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          registryUrl: 12345,
        }),
        { mode: 0o600 },
      );

      const manager = new MpakConfigManager({ mpakHome: testDir });
      expect(() => manager.getRegistryUrl()).toThrow(MpakConfigCorruptedError);
    });

    it('throws MpakConfigCorruptedError when packages is not an object', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          packages: 'not an object',
        }),
        { mode: 0o600 },
      );

      const manager = new MpakConfigManager({ mpakHome: testDir });
      expect(() => manager.getPackageNames()).toThrow(MpakConfigCorruptedError);
    });

    it('throws MpakConfigCorruptedError when a package config value is not a string', () => {
      writeFileSync(
        join(testDir, 'config.json'),
        JSON.stringify({
          version: '1.0.0',
          lastUpdated: '2024-01-01T00:00:00Z',
          packages: { '@scope/pkg': { api_key: 12345 } },
        }),
        { mode: 0o600 },
      );

      const manager = new MpakConfigManager({ mpakHome: testDir });
      expect(() => manager.getPackageConfig('@scope/pkg')).toThrow(MpakConfigCorruptedError);
    });

    it('includes config path in error', () => {
      writeFileSync(join(testDir, 'config.json'), 'invalid json', { mode: 0o600 });

      const manager = new MpakConfigManager({ mpakHome: testDir });
      try {
        manager.getRegistryUrl();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MpakConfigCorruptedError);
        expect((err as MpakConfigCorruptedError).configPath).toBe(join(testDir, 'config.json'));
      }
    });
  });
});
