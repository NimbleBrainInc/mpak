# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- **Agent Skills support.** mpak is refocused to do one thing: package MCP servers as portable, security-scanned MCPB bundles. Removed the `mpak skill` CLI namespace, the `/v1/skills` registry API and its OIDC announce path, the skill SDK methods (TypeScript and Python), the skill schemas, and the `skills` / `skill_versions` database tables. Skill packaging and distribution now live in the `skills.sh` / `npx skills` ecosystem. This is a breaking change: published skills, skill installs, and skill badge embeds are no longer served.

## [0.1.0] - 2026-02-10

Initial public release of mpak, the open-source MCP bundle and skill registry.

[0.1.0]: https://github.com/NimbleBrainInc/mpak/releases/tag/v0.1.0
