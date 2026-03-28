import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpbManifest } from '@nimblebrain/mpak-schemas';
import { Mpak } from '../src/mpakSDK.js';
import { MpakBundleCache } from '../src/cache.js';
import { MpakClient } from '../src/client.js';
import { MpakConfigManager } from '../src/config-manager.js';
import { MpakCacheCorruptedError, MpakConfigError, MpakInvalidBundleError } from '../src/errors.js';

describe('Mpak facade', () => {
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
      const sdk = new Mpak({ mpakHome: testDir });

      expect(sdk.configManager).toBeInstanceOf(MpakConfigManager);
      expect(sdk.client).toBeInstanceOf(MpakClient);
      expect(sdk.bundleCache).toBeInstanceOf(MpakBundleCache);
    });

    it('components are readonly', () => {
      const sdk = new Mpak({ mpakHome: testDir });

      const configManager = sdk.configManager;
      const client = sdk.client;
      const bundleCache = sdk.bundleCache;

      expect(sdk.configManager).toBe(configManager);
      expect(sdk.client).toBe(client);
      expect(sdk.bundleCache).toBe(bundleCache);
    });

    it('works with no options at all', () => {
      const sdk = new Mpak();

      expect(sdk.configManager).toBeInstanceOf(MpakConfigManager);
      expect(sdk.client).toBeInstanceOf(MpakClient);
      expect(sdk.bundleCache).toBeInstanceOf(MpakBundleCache);
    });

    it('does not create mpakHome directory on construction', () => {
      const nestedDir = join(testDir, 'nested', 'deep', '.mpak');
      const sdk = new Mpak({ mpakHome: nestedDir });

      expect(existsSync(nestedDir)).toBe(false);
      expect(sdk.configManager.mpakHome).toBe(nestedDir);
    });
  });

  // ===========================================================================
  // Option propagation
  // ===========================================================================

  describe('option propagation', () => {
    it('shares mpakHome between configManager and bundleCache', () => {
      const sdk = new Mpak({ mpakHome: testDir });

      expect(sdk.configManager.mpakHome).toBe(testDir);
      expect(sdk.bundleCache.getBundleCacheDirName('@scope/pkg')).toBe(
        join(testDir, 'cache', 'scope-pkg'),
      );
    });

    it('propagates registryUrl to configManager', () => {
      const sdk = new Mpak({
        mpakHome: testDir,
        registryUrl: 'https://custom.registry.dev',
      });

      expect(sdk.configManager.getRegistryUrl()).toBe('https://custom.registry.dev');
    });

    it('uses config registryUrl as source of truth for client', () => {
      new Mpak({
        mpakHome: testDir,
        registryUrl: 'https://custom.registry.dev',
      });

      const sdk2 = new Mpak({ mpakHome: testDir });
      expect(sdk2.configManager.getRegistryUrl()).toBe('https://custom.registry.dev');
    });

    it('uses default registry URL when not specified', () => {
      const sdk = new Mpak({ mpakHome: testDir });

      expect(sdk.configManager.getRegistryUrl()).toBe('https://registry.mpak.dev');
    });

    it('passes timeout and userAgent to client', async () => {
      const sdk = new Mpak({
        mpakHome: testDir,
        timeout: 5000,
        userAgent: 'test-agent/1.0',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ bundles: [], pagination: { total: 0, limit: 20, offset: 0 } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
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
    it('configManager and bundleCache share the same mpakHome directory', () => {
      const sdk = new Mpak({ mpakHome: testDir });

      sdk.configManager.setPackageConfigValue('@scope/pkg', 'key', 'value');
      expect(existsSync(join(testDir, 'config.json'))).toBe(true);

      const cachePath = sdk.bundleCache.getBundleCacheDirName('@scope/pkg');
      mkdirSync(cachePath, { recursive: true });
      expect(existsSync(join(testDir, 'cache', 'scope-pkg'))).toBe(true);
    });

    it('two Mpak instances with different homes are independent', () => {
      const homeA = join(testDir, 'home-a');
      const homeB = join(testDir, 'home-b');

      const sdkA = new Mpak({ mpakHome: homeA });
      const sdkB = new Mpak({ mpakHome: homeB });

      sdkA.configManager.setPackageConfigValue('@scope/pkg', 'key', 'a-value');
      sdkB.configManager.setPackageConfigValue('@scope/pkg', 'key', 'b-value');

      expect(sdkA.configManager.getPackageConfig('@scope/pkg')).toEqual({ key: 'a-value' });
      expect(sdkB.configManager.getPackageConfig('@scope/pkg')).toEqual({ key: 'b-value' });
    });

    it('registryUrl override flows through to client requests', async () => {
      const customUrl = 'https://my-registry.example.com';
      const sdk = new Mpak({
        mpakHome: testDir,
        registryUrl: customUrl,
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ bundles: [], pagination: { total: 0, limit: 20, offset: 0 } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      await sdk.client.searchBundles({ q: 'test' });

      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain(customUrl);

      fetchSpy.mockRestore();
    });
  });

  // ===========================================================================
  // MpakClient standalone usage
  // ===========================================================================

  describe('MpakClient standalone', () => {
    it('MpakClient works without the facade', async () => {
      const client = new MpakClient({
        registryUrl: 'https://standalone.registry.dev',
        timeout: 5000,
        userAgent: 'standalone/1.0',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ bundles: [], pagination: { total: 0, limit: 20, offset: 0 } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      const result = await client.searchBundles({ q: 'test' });

      expect(result.bundles).toEqual([]);
      const calledUrl = fetchSpy.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('https://standalone.registry.dev');

      fetchSpy.mockRestore();
    });

    it('MpakClient can be shared across cache instances', () => {
      const client = new MpakClient({ registryUrl: 'https://shared.registry.dev' });

      const cache1 = new MpakBundleCache(client, { mpakHome: join(testDir, 'cache1') });
      const cache2 = new MpakBundleCache(client, { mpakHome: join(testDir, 'cache2') });

      expect(cache1.getBundleCacheDirName('@scope/pkg')).toContain('cache1');
      expect(cache2.getBundleCacheDirName('@scope/pkg')).toContain('cache2');
    });
  });

  // ===========================================================================
  // prepareServer
  // ===========================================================================

  describe('prepareServer', () => {
    const nodeManifest: McpbManifest = {
      manifest_version: '0.3',
      name: '@scope/echo',
      version: '1.0.0',
      description: 'Echo server',
      server: {
        type: 'node',
        entry_point: 'index.js',
        mcp_config: {
          command: 'node',
          args: ['${__dirname}/index.js'],
          env: {},
        },
      },
    };

    function setupSdk(manifest: McpbManifest | null = nodeManifest) {
      const sdk = new Mpak({ mpakHome: testDir });
      const cacheDir = join(testDir, 'cache', 'scope-echo');

      vi.spyOn(sdk.bundleCache, 'loadBundle').mockResolvedValue({
        cacheDir,
        version: '1.0.0',
        pulled: false,
      });
      vi.spyOn(sdk.bundleCache, 'getBundleManifest').mockReturnValue(manifest);

      return { sdk, cacheDir };
    }

    it('resolves a node server', async () => {
      const { sdk, cacheDir } = setupSdk();

      const result = await sdk.prepareServer({ name: '@scope/echo' });

      expect(result.command).toBe('node');
      expect(result.args).toEqual([`${cacheDir}/index.js`]);
      expect(result.cwd).toBe(cacheDir);
      expect(result.name).toBe('@scope/echo');
      expect(result.version).toBe('1.0.0');
    });

    it('resolves a node server with no args (falls back to entry_point)', async () => {
      const manifest: McpbManifest = {
        ...nodeManifest,
        server: {
          ...nodeManifest.server,
          mcp_config: { command: 'node', args: [], env: {} },
        },
      };
      const { sdk, cacheDir } = setupSdk(manifest);

      const result = await sdk.prepareServer({ name: '@scope/echo' });

      expect(result.args).toEqual([join(cacheDir, 'index.js')]);
    });

    it('resolves a python server', async () => {
      const pythonManifest: McpbManifest = {
        ...nodeManifest,
        server: {
          type: 'python',
          entry_point: 'main.py',
          mcp_config: { command: 'python', args: ['${__dirname}/main.py'], env: {} },
        },
      };
      const { sdk, cacheDir } = setupSdk(pythonManifest);

      const result = await sdk.prepareServer({ name: '@scope/echo' });

      expect(['python', 'python3']).toContain(result.command);
      expect(result.args).toEqual([`${cacheDir}/main.py`]);
      expect(result.env['PYTHONPATH']).toContain(join(cacheDir, 'deps'));
    });

    it('resolves a binary server', async () => {
      const binaryManifest: McpbManifest = {
        ...nodeManifest,
        server: {
          type: 'binary',
          entry_point: 'server',
          mcp_config: { command: 'server', args: ['--port', '3000'], env: {} },
        },
      };
      const { sdk, cacheDir } = setupSdk(binaryManifest);

      const result = await sdk.prepareServer({ name: '@scope/echo' });

      expect(result.command).toBe(join(cacheDir, 'server'));
      expect(result.args).toEqual(['--port', '3000']);
    });

    it('passes version from spec to loadBundle', async () => {
      const { sdk } = setupSdk();

      await sdk.prepareServer({ name: '@scope/echo', version: '2.0.0' });

      expect(sdk.bundleCache.loadBundle).toHaveBeenCalledWith('@scope/echo', {
        version: '2.0.0',
      });
    });

    it('passes force option to loadBundle', async () => {
      const { sdk } = setupSdk();

      await sdk.prepareServer({ name: '@scope/echo' }, { force: true });

      expect(sdk.bundleCache.loadBundle).toHaveBeenCalledWith('@scope/echo', {
        force: true,
      });
    });

    it('throws MpakCacheCorruptedError when manifest is null', async () => {
      const { sdk } = setupSdk(null);

      await expect(sdk.prepareServer({ name: '@scope/echo' })).rejects.toThrow(MpakCacheCorruptedError);
      await expect(sdk.prepareServer({ name: '@scope/echo' })).rejects.toThrow(
        'Manifest file missing for @scope/echo',
      );
    });

    it('sets MPAK_WORKSPACE from workspaceDir option', async () => {
      const { sdk } = setupSdk();

      const result = await sdk.prepareServer({ name: '@scope/echo' }, {
        workspaceDir: '/custom/workspace',
      });

      expect(result.env['MPAK_WORKSPACE']).toBe('/custom/workspace');
    });

    it('defaults MPAK_WORKSPACE to $cwd/.mpak', async () => {
      const { sdk } = setupSdk();

      const result = await sdk.prepareServer({ name: '@scope/echo' });

      expect(result.env['MPAK_WORKSPACE']).toBe(join(process.cwd(), '.mpak'));
    });

    it('caller env overrides MPAK_WORKSPACE default', async () => {
      const { sdk } = setupSdk();

      const result = await sdk.prepareServer({ name: '@scope/echo' }, {
        env: { MPAK_WORKSPACE: '/caller/wins' },
      });

      expect(result.env['MPAK_WORKSPACE']).toBe('/caller/wins');
    });

    it('merges caller-provided env on top of manifest env', async () => {
      const manifestWithEnv: McpbManifest = {
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

      const result = await sdk.prepareServer({ name: '@scope/echo' }, {
        env: { FROM_CALLER: 'added', SHARED: 'caller-wins' },
      });

      expect(result.env['FROM_MANIFEST']).toBe('original');
      expect(result.env['FROM_CALLER']).toBe('added');
      expect(result.env['SHARED']).toBe('caller-wins');
    });

    it('substitutes user_config placeholders in manifest env', async () => {
      const manifestWithConfig: McpbManifest = {
        ...nodeManifest,
        user_config: {
          api_key: { type: 'string', required: true },
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
      sdk.configManager.setPackageConfigValue('@scope/echo', 'api_key', 'sk-secret');

      const result = await sdk.prepareServer({ name: '@scope/echo' });

      expect(result.env['API_KEY']).toBe('sk-secret');
    });

    it('uses default value when user config is not stored', async () => {
      const manifestWithDefault: McpbManifest = {
        ...nodeManifest,
        user_config: {
          port: { type: 'number', default: 3000 },
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

      const result = await sdk.prepareServer({ name: '@scope/echo' });

      expect(result.env['PORT']).toBe('3000');
    });

    it('throws MpakConfigError when required user config is missing', async () => {
      const manifestWithRequired: McpbManifest = {
        ...nodeManifest,
        user_config: {
          api_key: {
            type: 'string',
            title: 'API Key',
            required: true,
          },
        },
      };
      const { sdk } = setupSdk(manifestWithRequired);

      await expect(sdk.prepareServer({ name: '@scope/echo' })).rejects.toThrow(MpakConfigError);
      await expect(sdk.prepareServer({ name: '@scope/echo' })).rejects.toThrow('API Key');
    });

    it('MpakConfigError contains structured missingFields', async () => {
      const manifestWithRequired: McpbManifest = {
        ...nodeManifest,
        user_config: {
          api_key: {
            type: 'string',
            title: 'API Key',
            required: true,
            sensitive: true,
          },
          endpoint: {
            type: 'string',
            title: 'Endpoint URL',
            required: true,
          },
        },
      };
      const { sdk } = setupSdk(manifestWithRequired);

      try {
        await sdk.prepareServer({ name: '@scope/echo' });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MpakConfigError);
        const configErr = err as MpakConfigError;
        expect(configErr.packageName).toBe('@scope/echo');
        expect(configErr.missingFields).toEqual([
          { key: 'api_key', title: 'API Key', sensitive: true },
          { key: 'endpoint', title: 'Endpoint URL', sensitive: false },
        ]);
      }
    });

    it('throws MpakCacheCorruptedError for unsupported server type', async () => {
      const badManifest: McpbManifest = {
        ...nodeManifest,
        server: {
          type: 'ruby' as unknown as 'node',
          entry_point: 'main.rb',
          mcp_config: { command: 'ruby', args: [], env: {} },
        },
      };
      const { sdk } = setupSdk(badManifest);

      await expect(sdk.prepareServer({ name: '@scope/echo' })).rejects.toThrow(MpakCacheCorruptedError);
      await expect(sdk.prepareServer({ name: '@scope/echo' })).rejects.toThrow('Unsupported server type');
    });
  });

  // ===========================================================================
  // prepareServer — local bundles
  // ===========================================================================

  describe('prepareServer (local)', () => {
    const nodeManifest: McpbManifest = {
      manifest_version: '0.3',
      name: '@scope/local-echo',
      version: '2.0.0',
      description: 'Local echo server',
      server: {
        type: 'node',
        entry_point: 'index.js',
        mcp_config: {
          command: 'node',
          args: ['${__dirname}/index.js'],
          env: {},
        },
      },
    };

    /**
     * Create a valid .mcpb zip file containing a manifest.json and a dummy entry point.
     */
    function createMcpbBundle(dir: string, manifest: McpbManifest): string {
      const srcDir = join(dir, 'bundle-src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'manifest.json'), JSON.stringify(manifest));
      writeFileSync(join(srcDir, 'index.js'), 'console.log("hello")');

      const mcpbPath = join(dir, 'test-bundle.mcpb');
      execFileSync('zip', ['-j', mcpbPath, join(srcDir, 'manifest.json'), join(srcDir, 'index.js')], {
        stdio: 'pipe',
      });
      return mcpbPath;
    }

    it('extracts and resolves a local bundle', async () => {
      const sdk = new Mpak({ mpakHome: testDir });
      const mcpbPath = createMcpbBundle(testDir, nodeManifest);

      const result = await sdk.prepareServer({ local: mcpbPath });

      expect(result.name).toBe('@scope/local-echo');
      expect(result.version).toBe('2.0.0');
      expect(result.command).toBe('node');
      expect(result.args).toEqual([`${result.cwd}/index.js`]);
      expect(result.cwd).toContain('_local');
    });

    it('reads from cache on second call (no re-extraction)', async () => {
      const sdk = new Mpak({ mpakHome: testDir });
      const mcpbPath = createMcpbBundle(testDir, nodeManifest);

      const result1 = await sdk.prepareServer({ local: mcpbPath });
      const result2 = await sdk.prepareServer({ local: mcpbPath });

      expect(result1.cwd).toBe(result2.cwd);
      // Metadata file should exist from first extraction
      const metaPath = join(result1.cwd, '.mpak-local-meta.json');
      expect(existsSync(metaPath)).toBe(true);
    });

    it('re-extracts when force is set', async () => {
      const sdk = new Mpak({ mpakHome: testDir });
      const mcpbPath = createMcpbBundle(testDir, nodeManifest);

      // First call to populate cache
      const result1 = await sdk.prepareServer({ local: mcpbPath });
      const meta1 = JSON.parse(readFileSync(join(result1.cwd, '.mpak-local-meta.json'), 'utf8'));

      // Small delay so extractedAt differs
      await new Promise((r) => setTimeout(r, 50));

      const result2 = await sdk.prepareServer({ local: mcpbPath }, { force: true });
      const meta2 = JSON.parse(readFileSync(join(result2.cwd, '.mpak-local-meta.json'), 'utf8'));

      expect(meta2.extractedAt).not.toBe(meta1.extractedAt);
    });

    it('writes local metadata with path and timestamp', async () => {
      const sdk = new Mpak({ mpakHome: testDir });
      const mcpbPath = createMcpbBundle(testDir, nodeManifest);

      const result = await sdk.prepareServer({ local: mcpbPath });

      const meta = JSON.parse(readFileSync(join(result.cwd, '.mpak-local-meta.json'), 'utf8'));
      expect(meta.localPath).toContain('test-bundle.mcpb');
      expect(meta.extractedAt).toBeDefined();
    });

    it('throws MpakInvalidBundleError for a corrupt zip', async () => {
      const sdk = new Mpak({ mpakHome: testDir });
      const badPath = join(testDir, 'bad.mcpb');
      writeFileSync(badPath, 'not a zip');

      await expect(sdk.prepareServer({ local: badPath })).rejects.toThrow(MpakInvalidBundleError);
    });

    it('throws MpakInvalidBundleError when manifest is missing from zip', async () => {
      const sdk = new Mpak({ mpakHome: testDir });

      // Create a zip with no manifest.json
      const srcDir = join(testDir, 'no-manifest-src');
      mkdirSync(srcDir);
      writeFileSync(join(srcDir, 'index.js'), 'console.log("hello")');
      const mcpbPath = join(testDir, 'no-manifest.mcpb');
      execFileSync('zip', ['-j', mcpbPath, join(srcDir, 'index.js')], { stdio: 'pipe' });

      await expect(sdk.prepareServer({ local: mcpbPath })).rejects.toThrow(MpakInvalidBundleError);
      await expect(sdk.prepareServer({ local: mcpbPath })).rejects.toThrow('File does not exist');
    });

    it('throws MpakInvalidBundleError when manifest fails schema validation', async () => {
      const sdk = new Mpak({ mpakHome: testDir });

      const srcDir = join(testDir, 'bad-manifest-src');
      mkdirSync(srcDir);
      writeFileSync(join(srcDir, 'manifest.json'), JSON.stringify({ name: 'missing fields' }));
      const mcpbPath = join(testDir, 'bad-manifest.mcpb');
      execFileSync('zip', ['-j', mcpbPath, join(srcDir, 'manifest.json')], { stdio: 'pipe' });

      await expect(sdk.prepareServer({ local: mcpbPath })).rejects.toThrow(MpakInvalidBundleError);
      await expect(sdk.prepareServer({ local: mcpbPath })).rejects.toThrow('File failed validation');
    });

    it('resolves a python server from local bundle', async () => {
      const pythonManifest: McpbManifest = {
        ...nodeManifest,
        server: {
          type: 'python',
          entry_point: 'main.py',
          mcp_config: { command: 'python', args: ['${__dirname}/main.py'], env: {} },
        },
      };
      const sdk = new Mpak({ mpakHome: testDir });
      const mcpbPath = createMcpbBundle(testDir, pythonManifest);

      const result = await sdk.prepareServer({ local: mcpbPath });

      expect(['python', 'python3']).toContain(result.command);
      expect(result.args).toEqual([`${result.cwd}/main.py`]);
      expect(result.env['PYTHONPATH']).toContain(join(result.cwd, 'deps'));
    });

    it('sets MPAK_WORKSPACE from options', async () => {
      const sdk = new Mpak({ mpakHome: testDir });
      const mcpbPath = createMcpbBundle(testDir, nodeManifest);

      const result = await sdk.prepareServer({ local: mcpbPath }, {
        workspaceDir: '/custom/workspace',
      });

      expect(result.env['MPAK_WORKSPACE']).toBe('/custom/workspace');
    });

    it('throws MpakConfigError when required user config is missing', async () => {
      const manifestWithConfig: McpbManifest = {
        ...nodeManifest,
        user_config: {
          api_key: { type: 'string', title: 'API Key', required: true },
        },
      };
      const sdk = new Mpak({ mpakHome: testDir });
      const mcpbPath = createMcpbBundle(testDir, manifestWithConfig);

      await expect(sdk.prepareServer({ local: mcpbPath })).rejects.toThrow(MpakConfigError);
    });
  });
});
