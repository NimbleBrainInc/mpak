# @nimblebrain/mpak-sdk

[![CI](https://github.com/NimbleBrainInc/mpak/actions/workflows/sdk-typescript-ci.yml/badge.svg)](https://github.com/NimbleBrainInc/mpak/actions/workflows/sdk-typescript-ci.yml)
[![npm](https://img.shields.io/npm/v/@nimblebrain/mpak-sdk)](https://www.npmjs.com/package/@nimblebrain/mpak-sdk)
[![Node](https://img.shields.io/node/v/@nimblebrain/mpak-sdk)](https://www.npmjs.com/package/@nimblebrain/mpak-sdk)
[![License](https://img.shields.io/npm/l/@nimblebrain/mpak-sdk)](https://github.com/NimbleBrainInc/mpak/blob/main/packages/sdk-typescript/LICENSE)
[![mpak.dev](https://mpak.dev/badge.svg)](https://mpak.dev)

TypeScript SDK for the mpak registry — search, download, cache, configure, and run MCPB bundles and Agent Skills.

## Installation

```bash
pnpm add @nimblebrain/mpak-sdk
```

## Quick Start

The `MpakSDK` facade is the primary entry point. It wires together the registry client, local cache, and config manager:

```typescript
import { MpakSDK } from '@nimblebrain/mpak-sdk';

const mpak = new MpakSDK();

// Prepare a bundle for execution (downloads if not cached)
const server = await mpak.prepareServer('@nimblebraininc/echo');

// Spawn the MCP server
import { spawn } from 'child_process';
const child = spawn(server.command, server.args, {
  env: { ...server.env, ...process.env },
  cwd: server.cwd,
  stdio: 'inherit',
});
```

## Usage

### Prepare and Run a Server

`prepareServer` handles the full lifecycle: download, cache, read manifest, validate config, and resolve the command:

```typescript
const mpak = new MpakSDK();

// Latest version
const server = await mpak.prepareServer('@scope/bundle');

// Pinned version (inline)
const server = await mpak.prepareServer('@scope/bundle@1.2.0');

// Pinned version (option) + force re-download
const server = await mpak.prepareServer('@scope/bundle', {
  version: '1.2.0',
  force: true,
});

// Custom workspace directory for stateful bundles
const server = await mpak.prepareServer('@scope/bundle', {
  workspaceDir: '/path/to/project/.mpak',
});

// Extra env vars merged on top of manifest env
const server = await mpak.prepareServer('@scope/bundle', {
  env: { DEBUG: 'true' },
});
```

The returned `ServerCommand` contains everything needed to spawn:

```typescript
server.command;  // e.g. 'node', 'python3', or '/path/to/binary'
server.args;     // e.g. ['/cache/dir/index.js']
server.env;      // manifest env + user config substitutions + overrides
server.cwd;      // extracted bundle cache directory
server.name;     // resolved package name
server.version;  // resolved version string
```

### User Config (per-package settings)

Bundles can declare required configuration (API keys, ports, etc.) in their manifest. Store values before running:

```typescript
const mpak = new MpakSDK();

// Set a config value
mpak.config.setPackageConfigValue('@scope/bundle', 'api_key', 'sk-...');

// Values are substituted into ${user_config.*} placeholders in the manifest env
// If required config is missing, prepareServer throws with a clear message
```

### Parse Package Specs

Validate and parse `@scope/name` or `@scope/name@version` strings:

```typescript
MpakSDK.parsePackageSpec('@scope/name');
// { name: '@scope/name' }

MpakSDK.parsePackageSpec('@scope/name@1.0.0');
// { name: '@scope/name', version: '1.0.0' }

MpakSDK.parsePackageSpec('invalid');
// throws: Invalid package spec
```

### Search Bundles

```typescript
const mpak = new MpakSDK();

const results = await mpak.client.searchBundles({ q: 'mcp', limit: 10 });
for (const bundle of results.bundles) {
  console.log(`${bundle.name}@${bundle.latest_version}`);
}
```

### Get Bundle Details

```typescript
const bundle = await mpak.client.getBundle('@nimblebraininc/echo');

console.log(bundle.description);
console.log(`Versions: ${bundle.versions.map(v => v.version).join(', ')}`);
```

### Platform-Specific Downloads

```typescript
const platform = MpakClient.detectPlatform();

const download = await mpak.client.getBundleDownload(
  '@nimblebraininc/echo',
  '0.1.3',
  platform
);
```

### Cache Operations

```typescript
const mpak = new MpakSDK();

// Download and cache a bundle
const result = await mpak.cache.loadBundle('@scope/name');
console.log(result.cacheDir);   // path to extracted bundle
console.log(result.version);    // resolved version
console.log(result.pulled);     // true if downloaded, false if from cache

// Read a cached bundle's manifest
const manifest = mpak.cache.readManifest('@scope/name');

// List all cached bundles
const bundles = mpak.cache.listCachedBundles();

// Check for updates (fire-and-forget, logs via logger callback)
await mpak.cache.checkForUpdateAsync('@scope/name');

// Read/write cache metadata
const meta = mpak.cache.getCacheMetadata('@scope/name');
```

### Config Manager

```typescript
const mpak = new MpakSDK();

// Registry URL
mpak.config.getRegistryUrl();
mpak.config.setRegistryUrl('https://custom.registry.dev');

// Per-package config
mpak.config.setPackageConfigValue('@scope/name', 'api_key', 'sk-...');
mpak.config.getPackageConfigValue('@scope/name', 'api_key');
mpak.config.getPackageConfig('@scope/name');       // all values for a package
mpak.config.clearPackageConfig('@scope/name');      // remove all config for a package
mpak.config.clearPackageConfigValue('@scope/name', 'api_key');  // remove one key
mpak.config.listPackagesWithConfig();               // list configured packages
```

### Search & Download Skills

```typescript
const mpak = new MpakSDK();

const skills = await mpak.client.searchSkills({ q: 'crm', limit: 10 });
for (const skill of skills.skills) {
  console.log(`${skill.name}: ${skill.description}`);
}

// Download skill with SHA256 integrity verification
const download = await mpak.client.getSkillDownload('@nimbletools/folk-crm');
const data = await mpak.client.downloadContent(download.url, download.skill.sha256);
```

## Constructor Options

```typescript
const mpak = new MpakSDK({
  mpakHome: '~/.mpak',                       // Root directory for config + cache
  registryUrl: 'https://registry.mpak.dev',   // Registry API URL
  timeout: 30000,                             // Request timeout in ms
  userAgent: 'my-app/1.0',                    // User-Agent header
  logger: (msg) => console.error(msg),        // Logger for cache operations
});
```

## Error Handling

```typescript
import {
  MpakSDK,
  MpakNotFoundError,
  MpakIntegrityError,
  MpakNetworkError,
} from '@nimblebrain/mpak-sdk';

try {
  const server = await mpak.prepareServer('@nonexistent/bundle');
} catch (error) {
  if (error instanceof MpakNotFoundError) {
    console.error('Bundle not found:', error.message);
  } else if (error instanceof MpakIntegrityError) {
    // Content was NOT returned (fail-closed)
    console.error('Expected SHA256:', error.expected);
    console.error('Actual SHA256:', error.actual);
  } else if (error instanceof MpakNetworkError) {
    console.error('Network error:', error.message);
  }
}
```

## API Reference

### MpakSDK (facade)

| Method | Description |
|---|---|
| `prepareServer(packageName, options?)` | Resolve a bundle into a ready-to-spawn `ServerCommand` |
| `MpakSDK.parsePackageSpec(spec)` | Parse and validate a `@scope/name[@version]` string |

Properties: `config` (ConfigManager), `client` (MpakClient), `cache` (BundleCache).

### MpakClient (`mpak.client`)

#### Bundle Methods

| Method | Description |
|---|---|
| `searchBundles(params?)` | Search for bundles |
| `getBundle(name)` | Get bundle details |
| `getBundleVersions(name)` | List all versions |
| `getBundleVersion(name, version)` | Get specific version info |
| `getBundleDownload(name, version, platform?)` | Get download URL and metadata |
| `downloadBundle(name, version?)` | Download bundle with integrity verification |
| `downloadContent(url, sha256)` | Download any content with SHA256 verification |

#### Skill Methods

| Method | Description |
|---|---|
| `searchSkills(params?)` | Search for skills |
| `getSkill(name)` | Get skill details |
| `getSkillDownload(name)` | Get latest version download info |
| `getSkillVersionDownload(name, version)` | Get specific version download info |
| `downloadSkillBundle(name, version?)` | Download skill bundle with integrity verification |

#### Static Methods

| Method | Description |
|---|---|
| `MpakClient.detectPlatform()` | Detect current OS and architecture |

### BundleCache (`mpak.cache`)

| Method | Description |
|---|---|
| `loadBundle(name, options?)` | Download and cache a bundle (skips if cached) |
| `readManifest(packageName)` | Read and validate a cached bundle's `manifest.json` |
| `getCacheMetadata(packageName)` | Read cache metadata for a package |
| `writeCacheMetadata(packageName, metadata)` | Write cache metadata |
| `listCachedBundles()` | List all cached registry bundles |
| `getPackageCachePath(packageName)` | Get the cache directory path for a package |
| `checkForUpdateAsync(packageName)` | Fire-and-forget update check (logs result) |

#### Static Methods

| Method | Description |
|---|---|
| `BundleCache.extractZip(zipPath, destDir)` | Extract a ZIP with zip-bomb protection |
| `BundleCache.isSemverEqual(a, b)` | Compare semver strings (ignores `v` prefix) |

### ConfigManager (`mpak.config`)

| Method | Description |
|---|---|
| `getRegistryUrl()` | Get the registry URL (respects `MPAK_REGISTRY_URL` env var) |
| `setRegistryUrl(url)` | Override the registry URL |
| `getPackageConfig(packageName)` | Get all stored config for a package |
| `getPackageConfigValue(packageName, key)` | Get a single config value |
| `setPackageConfigValue(packageName, key, value)` | Store a config value |
| `clearPackageConfig(packageName)` | Remove all config for a package |
| `clearPackageConfigValue(packageName, key)` | Remove a single config key |
| `listPackagesWithConfig()` | List packages that have stored config |

Property: `mpakHome` (readonly) — the root directory for mpak state.

### Error Types

| Class | Description |
|---|---|
| `MpakError` | Base error class |
| `MpakNotFoundError` | Resource not found (404) |
| `MpakIntegrityError` | SHA256 hash mismatch (content NOT returned) |
| `MpakNetworkError` | Network failures, timeouts |

### Types

| Type | Description |
|---|---|
| `MpakSDKOptions` | Constructor options for `MpakSDK` |
| `MpakClientConfig` | Constructor options for `MpakClient` |
| `PrepareServerOptions` | Options for `prepareServer` |
| `ServerCommand` | Return type of `prepareServer` |
| `McpbManifest` | Parsed MCPB manifest schema |
| `UserConfigField` | User config field definition from manifest |

## Development

```bash
pnpm install          # Install dependencies
pnpm test             # Run unit tests
pnpm test:integration # Run integration tests (hits live registry)
pnpm typecheck        # Type check
pnpm build            # Build
```

### Verification

Run all checks before submitting changes:

```bash
pnpm --filter @nimblebrain/mpak-sdk lint
pnpm --filter @nimblebrain/mpak-sdk typecheck
pnpm --filter @nimblebrain/mpak-sdk test
pnpm --filter @nimblebrain/mpak-sdk test:integration
```

## Releasing

Releases are automated via GitHub Actions. The publish workflow is triggered by git tags.

**Version is defined in one place:** `package.json`.

### Steps

1. **Bump version** in `package.json`:
   ```bash
   cd packages/sdk-typescript
   npm version patch   # 0.1.0 -> 0.1.1
   npm version minor   # 0.1.0 -> 0.2.0
   npm version major   # 0.1.0 -> 1.0.0
   ```

2. **Commit and push:**
   ```bash
   git commit -am "sdk-typescript: bump to X.Y.Z"
   git push
   ```

3. **Tag and push** (this triggers the publish):
   ```bash
   git tag sdk-typescript-vX.Y.Z
   git push origin sdk-typescript-vX.Y.Z
   ```

CI will run the full verification suite, verify the tag matches `package.json`, build, and publish to npm. See [`sdk-typescript-publish.yml`](../../.github/workflows/sdk-typescript-publish.yml).

## License

Apache-2.0
