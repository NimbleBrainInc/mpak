# @nimblebrain/mpak-sdk

TypeScript SDK for mpak registry - MCPB bundles and Agent Skills.

## Features

- Type-safe API (types from `@nimblebrain/mpak-schemas`)
- Fail-closed integrity verification
- Skill resolution from mpak, GitHub, and URL sources
- Requires Node.js 18+ (native fetch)

## Installation

```bash
pnpm add @nimblebrain/mpak-sdk
```

## Usage

### Search Bundles

```typescript
import { MpakClient } from '@nimblebrain/mpak-sdk';

const client = new MpakClient();

// Search for bundles
const results = await client.searchBundles({ q: 'mcp', limit: 10 });

for (const bundle of results.bundles) {
  console.log(`${bundle.name}@${bundle.latest_version}`);
}
```

### Get Bundle Details

```typescript
const bundle = await client.getBundle('@nimblebraininc/echo');

console.log(bundle.description);
console.log(`Versions: ${bundle.versions.map(v => v.version).join(', ')}`);
```

### Download a Bundle

```typescript
// Get download info for the latest version
const versions = await client.getBundleVersions('@nimblebraininc/echo');
const download = await client.getBundleDownload(
  '@nimblebraininc/echo',
  versions.latest
);

console.log(`Download URL: ${download.url}`);
console.log(`SHA256: ${download.bundle.sha256}`);
```

### Platform-Specific Downloads

```typescript
// Detect current platform
const platform = MpakClient.detectPlatform();

// Get platform-specific download
const download = await client.getBundleDownload(
  '@nimblebraininc/echo',
  '0.1.3',
  platform
);
```

### Search Skills

```typescript
const skills = await client.searchSkills({
  q: 'crm',
  surface: 'claude-code',
  limit: 10,
});

for (const skill of skills.skills) {
  console.log(`${skill.name}: ${skill.description}`);
}
```

### Download Skill with Integrity Verification

```typescript
// Get skill download info
const download = await client.getSkillDownload('@nimbletools/folk-crm');

// Download content with SHA256 verification (fail-closed)
const { content, verified } = await client.downloadSkillContent(
  download.url,
  download.skill.sha256 // If hash doesn't match, throws MpakIntegrityError
);

console.log(`Verified: ${verified}`);
console.log(content);
```

### Resolve Skill References

```typescript
import { MpakClient, SkillReference } from '@nimblebrain/mpak-sdk';

const client = new MpakClient();

// Resolve from mpak registry
const skill = await client.resolveSkillRef({
  source: 'mpak',
  name: '@nimblebraininc/folk-crm',
  version: '1.3.0',
});
console.log(skill.content);

// Resolve from GitHub
const ghSkill = await client.resolveSkillRef({
  source: 'github',
  name: '@example/my-skill',
  version: 'v1.0.0',
  repo: 'owner/repo',
  path: 'skills/my-skill/SKILL.md',
});

// Resolve from URL
const urlSkill = await client.resolveSkillRef({
  source: 'url',
  name: '@example/custom',
  version: '1.0.0',
  url: 'https://example.com/skill.md',
});
```

## Error Handling

```typescript
import {
  MpakClient,
  MpakNotFoundError,
  MpakIntegrityError,
  MpakNetworkError,
} from '@nimblebrain/mpak-sdk';

const client = new MpakClient();

try {
  const bundle = await client.getBundle('@nonexistent/bundle');
} catch (error) {
  if (error instanceof MpakNotFoundError) {
    console.error('Bundle not found:', error.message);
  } else if (error instanceof MpakIntegrityError) {
    // CRITICAL: Content was NOT returned (fail-closed)
    console.error('Integrity mismatch!');
    console.error('Expected:', error.expected);
    console.error('Actual:', error.actual);
  } else if (error instanceof MpakNetworkError) {
    console.error('Network error:', error.message);
  }
}
```

## Configuration

```typescript
const client = new MpakClient({
  registryUrl: 'https://registry.mpak.dev', // Custom registry URL
  timeout: 30000, // Request timeout in ms
});
```

## API Reference

### MpakClient

#### Bundle Methods

- `searchBundles(params?)` - Search for bundles
- `getBundle(name)` - Get bundle details
- `getBundleVersions(name)` - List all versions
- `getBundleVersion(name, version)` - Get specific version info
- `getBundleDownload(name, version, platform?)` - Get download URL

#### Skill Methods

- `searchSkills(params?)` - Search for skills
- `getSkill(name)` - Get skill details
- `getSkillDownload(name)` - Get latest version download
- `getSkillVersionDownload(name, version)` - Get specific version download
- `downloadSkillContent(url, expectedSha256?)` - Download with optional integrity check
- `resolveSkillRef(ref)` - Resolve a skill reference to content

#### Static Methods

- `MpakClient.detectPlatform()` - Detect current OS/arch

### Error Types

- `MpakError` - Base error class
- `MpakNotFoundError` - Resource not found (404)
- `MpakIntegrityError` - Hash mismatch (content NOT returned)
- `MpakNetworkError` - Network failures, timeouts

## Development

```bash
# Install dependencies
pnpm install

# Run unit tests
pnpm test

# Run integration tests (hits real API)
pnpm test:integration

# Type check
pnpm typecheck

# Build
pnpm build
```

## License

Apache-2.0
