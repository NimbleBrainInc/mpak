# @nimblebrain/mpak-schemas

Shared Zod schemas and TypeScript types for the mpak registry monorepo.

## Overview

This package is the single source of truth for all data schemas used across the mpak ecosystem (server, client, CLI, SDK). Schemas are defined using [Zod](https://zod.dev/) v4, which provides:

- Runtime validation
- Type-safe schema definitions
- Automatic TypeScript type inference

## Installation

```bash
pnpm add @nimblebrain/mpak-schemas
```

Within the monorepo, add it as a workspace dependency:

```json
{
  "dependencies": {
    "@nimblebrain/mpak-schemas": "workspace:*"
  }
}
```

## Usage

### Import schemas and types

```typescript
import {
  PackageSchema,
  BundleSchema,
  type Package,
  type Bundle,
} from "@nimblebrain/mpak-schemas";
```

### Validate data

```typescript
import { validatePackage, validateBundle } from "@nimblebrain/mpak-schemas";

const result = validatePackage(unknownData);
if (result.success) {
  console.log(result.data.name); // typed as Package
} else {
  console.error(result.errors); // string[]
}
```

### Use Zod schemas directly

```typescript
import { PackageSchema } from "@nimblebrain/mpak-schemas";

// Parse (throws on invalid)
const pkg = PackageSchema.parse(data);

// Safe parse (returns result object)
const result = PackageSchema.safeParse(data);
```

## Schema Modules

### `package.ts`

Enums and search parameter schemas.

- `ServerTypeSchema` - node, python, binary
- `PlatformSchema` - darwin, win32, linux
- `PackageSortSchema` - downloads, recent, name
- `PackageSearchParamsSchema` - query parameters for search

### `api-responses.ts`

All API response schemas for both internal and v1 APIs.

**Package schemas**: `PackageSchema`, `PackageDetailSchema`, `PackageSearchResponseSchema`, `PackageVersionSchema`, etc.

**Bundle schemas (v1 API)**: `BundleSchema`, `BundleDetailSchema`, `BundleSearchResponseSchema`, `VersionInfoSchema`, `VersionDetailSchema`, `DownloadInfoSchema`, `MCPBIndexSchema`, `AnnounceRequestSchema`, `AnnounceResponseSchema`

**Internal API schemas**: `PublishResponseSchema`, `ClaimStatusResponseSchema`, `ClaimResponseSchema`, `MyPackagesResponseSchema`, `UnclaimedPackagesResponseSchema`

### `auth.ts`

- `UserProfileSchema` - user profile from /app/auth/me

### `skill.ts`

Agent Skills specification schemas.

- `SkillFrontmatterSchema` - SKILL.md frontmatter
- `SkillAnnounceRequestSchema` - POST /v1/skills/announce
- `SkillSearchResponseSchema`, `SkillDetailSchema`, etc.

### `mpak-json.ts`

mpak.json ownership claim file schema.

- `MpakJsonSchema` - Zod schema for mpak.json
- `MPAK_JSON_SCHEMA` - JSON Schema for IDE autocomplete
- `generateMpakJsonExample()` - utility to generate example files

### `validation.ts`

Convenience validation helpers that return `{ success, data, errors }`.

- `validatePackage()`, `validatePackageDetail()`, `validateBundle()`, etc.

## Development

```bash
# Build (ESM + CJS)
pnpm build

# Type check
pnpm typecheck

# Run tests
pnpm test

# Watch mode
pnpm dev
```

## License

Apache-2.0
