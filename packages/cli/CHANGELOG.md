# Changelog

All notable changes to the mpak CLI (`@nimblebrain/mpak`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] - 2026-07-23

### Removed

- **The `mpak skill` command namespace.** mpak now does one thing: package MCP
  servers as portable, security-scanned MCPB bundles. `mpak skill search`,
  `show`, `install`, `validate`, and `pack` are gone, and `mpak search` is now
  bundle-only (`mpak bundle search --type` still filters by server type). Skill
  packaging and distribution have moved to the `skills.sh` / `npx skills`
  ecosystem. ([#126])

## [0.4.2] - 2026-05-06

### Changed

- Bumped SDK dependency to `0.7.0` and schemas to `0.3.0`. The schema layer now
  rejects manifests whose `server.entry_point` is absolute, contains `..`, or
  uses backslashes — closes a path-traversal vector at the manifest contract
  layer. ([#94])

### Fixed

- `mpak bundle show` and `mpak bundle search` output now uses namespaced
  command examples. ([#91])

## [0.4.1] - 2026-04-09

### Fixed

- Use published `@nimblebrain/mpak-schemas` instead of workspace reference so
  the published CLI resolves the schemas dependency correctly. ([#77])

## [0.4.0] - 2026-04-09

### Added

- CLI now uses the TypeScript SDK internally for bundle runtime, config, and
  cache operations (dogfooding). ([#35])

## [0.3.4] - 2026-04-07

### Added

- `MPAK_HOME` environment variable to override the default `~/.mpak/` base directory ([#72])

## [0.3.3] - 2026-03-04

### Changed

- Bumped SDK dependency to v0.1.3 (fixes bundle download URL resolution)

## [0.3.2] - 2026-03-04

### Fixed

- Fix CLI publish: use `pnpm pack` without `--filter` to resolve workspace dependencies

## [0.3.1] - 2026-03-04

### Fixed

- Fix CLI publish: resolve `workspace:*` dependencies to real versions before npm publish

## [0.3.0] - 2026-03-04

### Added

- `MPAK_WORKSPACE` environment variable set during `mpak run`, providing bundles a project-local directory for stateful data (defaults to `$CWD/.mpak`) ([#30])
- `mpak outdated` command to check for newer versions of cached bundles ([#37])
- `mpak update` command to update cached bundles to latest versions, with parallel downloads ([#37])
- Background update check during `mpak run` — notifies when a newer version is available
- `user_config` support — bundles can declare required configuration fields in `manifest.json`, CLI prompts interactively and stores values in `~/.mpak/config.json`
- `mpak config set|get|list|clear` commands for managing per-bundle configuration
- Zip bomb protection: rejects bundles exceeding 500MB uncompressed size before extraction

### Fixed

- Prevent CLI hang when background update check fails during exit
- Use cryptographically random temp file names to prevent collisions

## [0.1.0] - 2026-02-11

Initial public release.

### Added

- `mpak bundle run <package>` — download and run MCP servers from the registry
- `mpak bundle run --local <path>` — run a local `.mcpb` bundle file
- `mpak bundle search <query>` — search the registry for bundles
- `mpak bundle show <package>` — show bundle details and metadata
- `mpak bundle pull <package>` — download `.mcpb` file to current directory
- `mpak search <query>` — unified search across bundles and skills
- `mpak skill install <package>` — install skills for Claude Code, Goose, and other providers
- `mpak skill list` — list installed skills
- `mpak skill pack` — package a skill directory into an `.mcpb` bundle
- `mpak skill validate` — validate skill structure and metadata
- `mpak completion` — generate shell completions (bash, zsh, fish)
- Local bundle caching in `~/.mpak/cache/` for instant subsequent runs
- Platform-aware bundle resolution (os/arch matching)
- Python auto-detection (`python3` → `python` fallback) for Python-based bundles

[Unreleased]: https://github.com/NimbleBrainInc/mpak/compare/cli-v0.5.0...HEAD
[0.5.0]: https://github.com/NimbleBrainInc/mpak/compare/cli-v0.4.2...cli-v0.5.0
[0.4.2]: https://github.com/NimbleBrainInc/mpak/compare/cli-v0.4.1...cli-v0.4.2
[0.4.1]: https://github.com/NimbleBrainInc/mpak/compare/cli-v0.4.0...cli-v0.4.1
[0.4.0]: https://github.com/NimbleBrainInc/mpak/compare/cli-v0.3.4...cli-v0.4.0
[0.3.4]: https://github.com/NimbleBrainInc/mpak/compare/cli-v0.3.3...cli-v0.3.4
[0.3.3]: https://github.com/NimbleBrainInc/mpak/compare/cli-v0.3.2...cli-v0.3.3
[0.3.2]: https://github.com/NimbleBrainInc/mpak/compare/cli-v0.3.1...cli-v0.3.2
[0.3.1]: https://github.com/NimbleBrainInc/mpak/compare/cli-v0.3.0...cli-v0.3.1
[0.3.0]: https://github.com/NimbleBrainInc/mpak/compare/v0.1.0...cli-v0.3.0
[0.1.0]: https://github.com/NimbleBrainInc/mpak/releases/tag/v0.1.0

[#30]: https://github.com/NimbleBrainInc/mpak/issues/30
[#35]: https://github.com/NimbleBrainInc/mpak/issues/35
[#37]: https://github.com/NimbleBrainInc/mpak/issues/37
[#72]: https://github.com/NimbleBrainInc/mpak/issues/72
[#77]: https://github.com/NimbleBrainInc/mpak/issues/77
[#91]: https://github.com/NimbleBrainInc/mpak/issues/91
[#94]: https://github.com/NimbleBrainInc/mpak/issues/94
[#126]: https://github.com/NimbleBrainInc/mpak/pull/126
