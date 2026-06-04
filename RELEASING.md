# Releasing

mpak is a monorepo with two kinds of "release", deliberately handled differently:

- **Libraries** — `cli`, `sdk-typescript`, `sdk-python`, `schemas`, `scanner` — are
  **published** to npm / PyPI. You release one by pushing a git tag.
- **Apps** — `registry`, `web` — are **deployed** services, not published packages.
  They ship by commit, not by version.

## Libraries: the tag *is* the release

Each library versions independently. There is exactly **one way** to release one,
and it is a single action: **push a tag.**

```
<package>-v<version>     e.g.  sdk-typescript-v0.8.0,  schemas-v0.4.0,  cli-v0.4.2
```

Pushing that tag triggers the package's workflow (`.github/workflows/<package>-publish.yml`),
which runs three jobs:

1. **verify** — build, lint, typecheck, test.
2. **publish** — checks the tag matches the manifest version, then publishes to npm / PyPI.
3. **release** — creates the GitHub Release with auto-generated notes.

That is the entire model: **tag → CI publishes → CI creates the GitHub Release.**
The tag is both the trigger and the source of truth. The GitHub Release and the
npm/PyPI artifact are *products* of the tag — you never create them by hand.

### To cut a release

1. Bump the version in the package's manifest, on `main`:
   - npm packages: `packages/<pkg>/package.json` → `version`
   - PyPI packages: `pyproject.toml` → `[project].version`
2. Commit it (e.g. `release: <pkg>@<version>`) and get it onto `main`.
3. Tag that commit and push the tag:
   ```sh
   git tag <pkg>-v<version> <commit-on-main>
   git push origin <pkg>-v<version>
   ```
4. Watch the Actions run. When it's green, npm/PyPI has the version and the
   GitHub Release exists.

### The one hard rule: never publish by hand

Do **not** run `npm publish` / `uv publish` / `twine upload` from a laptop —
ever. The tag-triggered workflow is the only sanctioned path. A manual publish
puts npm/PyPI *ahead* of the git tags, which silently breaks release tracking
(this is exactly the drift that produced untagged-but-published `sdk@0.8.0` /
`schemas@0.4.0` and a bumped-but-never-published `sdk-python` 0.2.0). If the tag
isn't pushed, the release didn't happen.

### Package → registry → tag map

| Package | Manifest | Registry | Tag prefix |
|---|---|---|---|
| `cli` | `packages/cli/package.json` | npm `@nimblebrain/mpak` | `cli-v*` |
| `sdk-typescript` | `packages/sdk-typescript/package.json` | npm `@nimblebrain/mpak-sdk` | `sdk-typescript-v*` |
| `schemas` | `packages/schemas/package.json` | npm `@nimblebrain/mpak-schemas` | `schemas-v*` |
| `sdk-python` | `packages/sdk-python/pyproject.toml` | PyPI `mpak` | `sdk-python-v*` |
| `scanner` | `apps/scanner/pyproject.toml` | PyPI `mpak-scanner` | `scanner-v*` |

### Idempotency — re-tagging is safe

The publish step is idempotent: if the version is already on npm/PyPI it **skips
the publish** and the workflow still (re)creates the GitHub Release. So a
re-pushed or backfilled tag never errors on "version already exists."

### Recovering from drift

If a manifest version is **ahead of its latest tag**, a release was bumped but
never tagged (or published out-of-band). To reconcile, just push the missing tag
at the release commit:

```sh
git tag <pkg>-v<version> <release-commit>
git push origin <pkg>-v<version>
```

Because publish is idempotent, this is safe whether or not the version is already
on the registry — it publishes if missing, skips if present, and creates the
GitHub Release either way. Then verify `git tag` and the registry agree.

## Apps: deployed by commit, not version

`registry` (registry.mpak.dev) and `web` (mpak.dev) are long-running services,
**not** published packages. They have no version tags. An operator deploys them
from a chosen commit on `main`; the build is tagged with the commit's short SHA
and rolled out through the deployment pipeline. There is no version to bump — you
deploy a commit. (Operator deployment runbooks live with the deployment config,
outside this repository.)
