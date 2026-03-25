import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MpakSDK } from '../src/MpakSDK.js';
import { BundleCache } from '../src/cache.js';
import { MpakClient } from '../src/client.js';
import { MpakConfigManager } from '../src/config-manager.js';

describe('MpakSDK facade', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'mpak-facade-test-'));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // Construction & component wiring
  // ===========================================================================

  describe('construction', () => {
    it('creates all components with defaults', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      expect(sdk.config).toBeInstanceOf(MpakConfigManager);
      expect(sdk.client).toBeInstanceOf(MpakClient);
      expect(sdk.cache).toBeInstanceOf(BundleCache);
    });

    it('components are readonly', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      const config = sdk.config;
      const client = sdk.client;
      const cache = sdk.cache;

      expect(sdk.config).toBe(config);
      expect(sdk.client).toBe(client);
      expect(sdk.cache).toBe(cache);
    });

    it('works with no options at all', () => {
      const noOptsSdk = new MpakSDK();

      expect(noOptsSdk.config).toBeInstanceOf(MpakConfigManager);
      expect(noOptsSdk.client).toBeInstanceOf(MpakClient);
      expect(noOptsSdk.cache).toBeInstanceOf(BundleCache);
    });

    it('does not create mpakHome directory on construction', () => {
      const nestedDir = join(testDir, 'nested', 'deep', '.mpak');
      const sdk = new MpakSDK({ mpakHome: nestedDir });

      expect(existsSync(nestedDir)).toBe(false);
      expect(sdk.config.mpakHome).toBe(nestedDir);
    });
  });

  // ===========================================================================
  // Option propagation
  // ===========================================================================

  describe('option propagation', () => {
    it('shares mpakHome between config and cache', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      expect(sdk.config.mpakHome).toBe(testDir);
      expect(sdk.cache.getPackageCachePath('@scope/pkg')).toBe(
        join(testDir, 'cache', 'scope-pkg'),
      );
    });

    it('propagates registryUrl to config and client', () => {
      const sdk = new MpakSDK({
        mpakHome: testDir,
        registryUrl: 'https://custom.registry.dev',
      });

      expect(sdk.config.getRegistryUrl()).toBe('https://custom.registry.dev');
    });

    it('uses config registryUrl as source of truth for client', () => {
      new MpakSDK({
        mpakHome: testDir,
        registryUrl: 'https://custom.registry.dev',
      });

      const sdk2 = new MpakSDK({ mpakHome: testDir });
      expect(sdk2.config.getRegistryUrl()).toBe('https://custom.registry.dev');
    });

    it('uses default registry URL when not specified', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      expect(sdk.config.getRegistryUrl()).toBe('https://registry.mpak.dev');
    });

    it('passes logger to cache', () => {
      const logs: string[] = [];
      const logger = (msg: string) => { logs.push(msg); };
      const sdk = new MpakSDK({ mpakHome: testDir, logger });

      const bundleDir = join(testDir, 'cache', 'scope-pkg');
      mkdirSync(bundleDir, { recursive: true });
      writeFileSync(
        join(bundleDir, '.mpak-meta.json'),
        JSON.stringify({
          version: '1.0.0',
          pulledAt: '2026-03-21T00:00:00.000Z',
          platform: { os: 'darwin', arch: 'arm64' },
        }),
      );

      sdk.cache.listCachedBundles();

      expect(logs.some((l) => l.includes('missing manifest.json'))).toBe(true);
    });

    it('passes timeout and userAgent to client', async () => {
      const sdk = new MpakSDK({
        mpakHome: testDir,
        timeout: 5000,
        userAgent: 'test-agent/1.0',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ bundles: [], pagination: { total: 0, limit: 20, offset: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await sdk.client.searchBundles({ q: 'test' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const callArgs = fetchSpy.mock.calls[0];
      const init = callArgs?.[1] as RequestInit;
      expect((init.headers as Record<string, string>)['User-Agent']).toBe('test-agent/1.0');

      fetchSpy.mockRestore();
    });
  });

  // ===========================================================================
  // Cross-component integration
  // ===========================================================================

  describe('cross-component integration', () => {
    it('config and cache share the same mpakHome directory', () => {
      const sdk = new MpakSDK({ mpakHome: testDir });

      sdk.config.setPackageConfigValue('@scope/pkg', 'key', 'value');
      expect(existsSync(join(testDir, 'config.json'))).toBe(true);

      mkdirSync(sdk.cache.getPackageCachePath('@scope/pkg'), { recursive: true });
      sdk.cache.writeCacheMetadata('@scope/pkg', {
        version: '1.0.0',
        pulledAt: '2026-03-21T00:00:00.000Z',
        platform: { os: 'darwin', arch: 'arm64' },
      });
      expect(existsSync(join(testDir, 'cache', 'scope-pkg', '.mpak-meta.json'))).toBe(true);
    });

    it('two SDK instances with different homes are independent', () => {
      const homeA = join(testDir, 'home-a');
      const homeB = join(testDir, 'home-b');

      const sdkA = new MpakSDK({ mpakHome: homeA });
      const sdkB = new MpakSDK({ mpakHome: homeB });

      sdkA.config.setPackageConfigValue('@scope/pkg', 'key', 'a-value');
      sdkB.config.setPackageConfigValue('@scope/pkg', 'key', 'b-value');

      expect(sdkA.config.getPackageConfig('@scope/pkg')).toEqual({ key: 'a-value' });
      expect(sdkB.config.getPackageConfig('@scope/pkg')).toEqual({ key: 'b-value' });
    });

    it('registryUrl override flows through to client requests', async () => {
      const customUrl = 'https://my-registry.example.com';
      const sdk = new MpakSDK({
        mpakHome: testDir,
        registryUrl: customUrl,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ bundles: [], pagination: { total: 0, limit: 20, offset: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await sdk.client.searchBundles({ q: 'test' });

      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain(customUrl);

      fetchSpy.mockRestore();
    });
  });

  // ===========================================================================
  // MpakClient standalone usage (only component usable standalone)
  // ===========================================================================

  describe('MpakClient standalone', () => {
    it('MpakClient works without the facade', async () => {
      const client = new MpakClient({
        registryUrl: 'https://standalone.registry.dev',
        timeout: 5000,
        userAgent: 'standalone/1.0',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ bundles: [], pagination: { total: 0, limit: 20, offset: 0 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await client.searchBundles({ q: 'test' });

      expect(result.bundles).toEqual([]);
      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('https://standalone.registry.dev');

      fetchSpy.mockRestore();
    });

    it('MpakClient can be shared across cache instances', () => {
      const client = new MpakClient({ registryUrl: 'https://shared.registry.dev' });

      const cache1 = new BundleCache({ mpakHome: join(testDir, 'cache1'), client });
      const cache2 = new BundleCache({ mpakHome: join(testDir, 'cache2'), client });

      expect(cache1.getPackageCachePath('@scope/pkg')).toContain('cache1');
      expect(cache2.getPackageCachePath('@scope/pkg')).toContain('cache2');
    });
  });

  // ===========================================================================
  // parsePackageSpec
  // ===========================================================================

  describe('parsePackageSpec', () => {
    it('parses @scope/name', () => {
      expect(MpakSDK.parsePackageSpec('@scope/name')).toEqual({
        name: '@scope/name',
      });
    });

    it('parses @scope/name@1.0.0', () => {
      expect(MpakSDK.parsePackageSpec('@scope/name@1.0.0')).toEqual({
        name: '@scope/name',
        version: '1.0.0',
      });
    });

    it('parses @scope/name@latest', () => {
      expect(MpakSDK.parsePackageSpec('@scope/name@latest')).toEqual({
        name: '@scope/name',
        version: 'latest',
      });
    });

    it('throws for unscoped name', () => {
      expect(() => MpakSDK.parsePackageSpec('simple')).toThrow(
        'Invalid package spec',
      );
    });

    it('throws for name without slash', () => {
      expect(() => MpakSDK.parsePackageSpec('@noslash')).toThrow(
        'Invalid package spec',
      );
    });

    it('throws for empty string', () => {
      expect(() => MpakSDK.parsePackageSpec('')).toThrow(
        'Invalid package spec',
      );
    });
  });

  // ===========================================================================
  // prepareServer
  // ===========================================================================

  describe('prepareServer', () => {
    const nodeManifest = {
      manifest_version: '0.3',
      name: '@scope/echo',
      version: '1.0.0',
      description: 'Echo server',
      server: {
        type: 'node' as const,
        entry_point: 'index.js',
        mcp_config: {
          command: 'node',
          args: ['${__dirname}/index.js'],
        },
      },
    };

    function setupSdk(manifest: typeof nodeManifest | null = nodeManifest) {
      const sdk = new MpakSDK({ mpakHome: testDir });
      const cacheDir = join(testDir, 'cache', 'scope-echo');

      vi.spyOn(sdk.cache, 'loadBundle').mockResolvedValue({
        cacheDir,
        version: '1.0.0',
        pulled: false,
      });
      vi.spyOn(sdk.cache, 'readManifest').mockReturnValue(manifest);

      return { sdk, cacheDir };
    }

    it('resolves a node server', async () => {
      const { sdk, cacheDir } = setupSdk();

      const result = await sdk.prepareServer('@scope/echo');

      expect(result.command).toBe('node');
      expect(result.args).toEqual([`${cacheDir}/index.js`]);
      expect(result.cwd).toBe(cacheDir);
      expect(result.name).toBe('@scope/echo');
      expect(result.version).toBe('1.0.0');
    });

    it('resolves a node server with no args (falls back to entry_point)', async () => {
      const manifest = {
        ...nodeManifest,
        server: {
          ...nodeManifest.server,
          mcp_config: { command: 'node', args: [] as string[] },
        },
      };
      const { sdk, cacheDir } = setupSdk(manifest);

      const result = await sdk.prepareServer('@scope/echo');

      expect(result.args).toEqual([join(cacheDir, 'index.js')]);
    });

    it('resolves a python server', async () => {
      const pythonManifest = {
        ...nodeManifest,
        server: {
          type: 'python' as const,
          entry_point: 'main.py',
          mcp_config: { command: 'python', args: ['${__dirname}/main.py'] },
        },
      };
      const { sdk, cacheDir } = setupSdk(pythonManifest);

      const result = await sdk.prepareServer('@scope/echo');

      // findPythonCommand should resolve 'python' to 'python3' or 'python'
      expect(['python', 'python3']).toContain(result.command);
      expect(result.args).toEqual([`${cacheDir}/main.py`]);
      // PYTHONPATH should include deps/ directory
      expect(result.env['PYTHONPATH']).toContain(join(cacheDir, 'deps'));
    });

    it('resolves a binary server', async () => {
      const binaryManifest = {
        ...nodeManifest,
        server: {
          type: 'binary' as const,
          entry_point: 'server',
          mcp_config: { command: 'server', args: ['--port', '3000'] },
        },
      };
      const { sdk, cacheDir } = setupSdk(binaryManifest);

      const result = await sdk.prepareServer('@scope/echo');

      expect(result.command).toBe(join(cacheDir, 'server'));
      expect(result.args).toEqual(['--port', '3000']);
    });

    it('parses inline version from package name', async () => {
      const { sdk } = setupSdk();

      await sdk.prepareServer('@scope/echo@2.0.0');

      expect(sdk.cache.loadBundle).toHaveBeenCalledWith('@scope/echo', {
        version: '2.0.0',
      });
    });

    it('options.version takes precedence over inline version', async () => {
      const { sdk } = setupSdk();

      await sdk.prepareServer('@scope/echo@2.0.0', { version: '3.0.0' });

      expect(sdk.cache.loadBundle).toHaveBeenCalledWith('@scope/echo', {
        version: '3.0.0',
      });
    });

    it('passes force option to loadBundle', async () => {
      const { sdk } = setupSdk();

      await sdk.prepareServer('@scope/echo', { force: true });

      expect(sdk.cache.loadBundle).toHaveBeenCalledWith('@scope/echo', {
        force: true,
      });
    });

    it('throws when manifest is null', async () => {
      const { sdk } = setupSdk(null);

      await expect(sdk.prepareServer('@scope/echo')).rejects.toThrow(
        'Manifest missing or corrupt',
      );
    });

    it('sets MPAK_WORKSPACE from workspaceDir option', async () => {
      const { sdk } = setupSdk();

      const result = await sdk.prepareServer('@scope/echo', {
        workspaceDir: '/custom/workspace',
      });

      expect(result.env['MPAK_WORKSPACE']).toBe('/custom/workspace');
    });

    it('defaults MPAK_WORKSPACE to $cwd/.mpak', async () => {
      const { sdk } = setupSdk();

      const result = await sdk.prepareServer('@scope/echo');

      expect(result.env['MPAK_WORKSPACE']).toBe(
        join(process.cwd(), '.mpak'),
      );
    });

    it('merges caller-provided env on top of manifest env', async () => {
      const manifestWithEnv = {
        ...nodeManifest,
        server: {
          ...nodeManifest.server,
          mcp_config: {
            ...nodeManifest.server.mcp_config,
            env: { FROM_MANIFEST: 'original', SHARED: 'manifest' },
          },
        },
      };
      const { sdk } = setupSdk(manifestWithEnv);

      const result = await sdk.prepareServer('@scope/echo', {
        env: { FROM_CALLER: 'added', SHARED: 'caller-wins' },
      });

      expect(result.env['FROM_MANIFEST']).toBe('original');
      expect(result.env['FROM_CALLER']).toBe('added');
      expect(result.env['SHARED']).toBe('caller-wins');
    });

    it('substitutes user_config placeholders in manifest env', async () => {
      const manifestWithConfig = {
        ...nodeManifest,
        user_config: {
          api_key: { type: 'string' as const, required: true },
        },
        server: {
          ...nodeManifest.server,
          mcp_config: {
            ...nodeManifest.server.mcp_config,
            env: { API_KEY: '${user_config.api_key}' },
          },
        },
      };
      const { sdk } = setupSdk(manifestWithConfig);
      sdk.config.setPackageConfigValue('@scope/echo', 'api_key', 'sk-secret');

      const result = await sdk.prepareServer('@scope/echo');

      expect(result.env['API_KEY']).toBe('sk-secret');
    });

    it('uses default value when user config is not stored', async () => {
      const manifestWithDefault = {
        ...nodeManifest,
        user_config: {
          port: { type: 'number' as const, default: 3000 },
        },
        server: {
          ...nodeManifest.server,
          mcp_config: {
            ...nodeManifest.server.mcp_config,
            env: { PORT: '${user_config.port}' },
          },
        },
      };
      const { sdk } = setupSdk(manifestWithDefault);

      const result = await sdk.prepareServer('@scope/echo');

      expect(result.env['PORT']).toBe('3000');
    });

    it('throws when required user config is missing', async () => {
      const manifestWithRequired = {
        ...nodeManifest,
        user_config: {
          api_key: {
            type: 'string' as const,
            title: 'API Key',
            required: true,
          },
        },
      };
      const { sdk } = setupSdk(manifestWithRequired);

      await expect(sdk.prepareServer('@scope/echo')).rejects.toThrow(
        'Missing required config for @scope/echo: API Key',
      );
    });

    it('throws for unsupported server type', async () => {
      const badManifest = {
        ...nodeManifest,
        server: {
          type: 'ruby' as unknown as 'node',
          entry_point: 'main.rb',
          mcp_config: { command: 'ruby', args: [] as string[] },
        },
      };
      const { sdk } = setupSdk(badManifest);

      await expect(sdk.prepareServer('@scope/echo')).rejects.toThrow(
        'Unsupported server type: ruby',
      );
    });
  });
});
