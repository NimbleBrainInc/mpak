# Publishing the mpak CLI

## Overview

Each package in the monorepo is versioned and published independently:

| Package | npm | Depends on |
|---------|-----|------------|
| `@nimblebrain/mpak-schemas` | [link](https://www.npmjs.com/package/@nimblebrain/mpak-schemas) | (none) |
| `@nimblebrain/mpak-sdk` | [link](https://www.npmjs.com/package/@nimblebrain/mpak-sdk) | schemas |
| `@nimblebrain/mpak` (CLI) | [link](https://www.npmjs.com/package/@nimblebrain/mpak) | schemas, sdk |

Only publish a package when it has changes. If you change schemas, you may also need to publish sdk and cli if they depend on the new schema behavior.

During `pnpm publish`, `workspace:*` references are automatically replaced with the current version of that workspace package.

## Prerequisites

- Logged in to npm: `npm whoami` (should show your username)
- If not logged in: `npm login`
- Ensure you have publish access to the `@nimblebrain` scope

## Publishing a package

These steps apply to any of the three packages. Repeat for each package that has changes, in dependency order (schemas, then sdk, then cli).

### 1. Verify

From the monorepo root (`apps/mpak/`):

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All four must pass with zero errors.

### 2. Bump the version

```bash
cd packages/<package>
npm version <patch|minor|major>
```

Or edit `version` in `package.json` manually.

### 3. Build

```bash
pnpm build
```

### 4. Publish

```bash
pnpm publish --no-git-checks
```

> `--no-git-checks` skips the dirty-tree check, which is useful if you haven't committed the version bump yet. If you prefer, commit first and omit this flag.

### 5. Verify

```bash
npm view @nimblebrain/<package> version
```

### 6. Commit and tag

```bash
git add packages/<package>/package.json
git commit -m "release: @nimblebrain/<package>@<version>"
git tag "<package>@<version>"
git push && git push --tags
```

## Example: publishing only the CLI

```bash
cd packages/cli
npm version patch
pnpm build
pnpm publish --no-git-checks
git add package.json
git commit -m "release: @nimblebrain/mpak@0.1.1"
git tag "mpak@0.1.1"
git push && git push --tags
```

## Example: publishing schemas + sdk + cli

When a schema change cascades through all packages:

```bash
# 1. Verify from monorepo root
pnpm typecheck && pnpm lint && pnpm test && pnpm build

# 2. Bump and publish schemas
cd packages/schemas
npm version minor
pnpm build && pnpm publish --no-git-checks
cd -

# 3. Bump and publish sdk
cd packages/sdk-typescript
npm version patch
pnpm build && pnpm publish --no-git-checks
cd -

# 4. Bump and publish cli
cd packages/cli
npm version patch
pnpm build && pnpm publish --no-git-checks
cd -

# 5. Commit and tag each
git add packages/schemas/package.json packages/sdk-typescript/package.json packages/cli/package.json
git commit -m "release: mpak-schemas@0.2.0, mpak-sdk@0.1.1, mpak@0.1.1"
git push
```

## Dry run

Preview what would be published without actually publishing:

```bash
cd packages/cli && pnpm publish --dry-run
```

## Smoke test after publishing

```bash
npm install -g @nimblebrain/mpak@latest
mpak --version
mpak search echo
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm ERR! 403` | You don't have publish access to `@nimblebrain`. Ask an org admin to add you. |
| `npm ERR! 402` | The package is trying to publish as private. Check `publishConfig.access` is `"public"`. |
| `workspace:*` in published package | pnpm should replace this automatically. Ensure you're using `pnpm publish`, not `npm publish`. |
| Version already exists | You need to bump the version. npm does not allow republishing the same version. |
