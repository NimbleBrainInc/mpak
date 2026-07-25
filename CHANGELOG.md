# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **S3 credentials now come from the AWS SDK's default provider chain.** The registry no longer reads its own credential variables and no longer passes credentials to the S3 client, so a container or instance role, an IRSA-bound ServiceAccount, or a shared `~/.aws` profile all work without a code change. **This is a breaking change to configuration**, and a quiet one: a missed rename leaves the credential simply absent, the registry starts normally (only `S3_BUCKET` is checked at boot), and the failure appears on the first bundle upload or download. Rename depending on how you deploy:

  | Deployment | Rename |
  |---|---|
  | Environment variables (Docker, bare process) | `S3_ACCESS_KEY_ID` → `AWS_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` → `AWS_SECRET_ACCESS_KEY` |
  | Helm, chart-managed Secret | `secrets.s3AccessKeyId` → `secrets.awsAccessKeyId`, `secrets.s3SecretAccessKey` → `secrets.awsSecretAccessKey` (the chart fails the render if the old keys are set) |
  | Helm, `secrets.existingSecret` | the keys *inside your Secret*: `s3-access-key-id` → `aws-access-key-id`, `s3-secret-access-key` → `aws-secret-access-key` |

  Deploying some other way, the rule is the same: the SDK reads `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (and `AWS_SESSION_TOKEN` for temporary credentials) and nothing mpak-specific, so any mapping that still produces `S3_ACCESS_KEY_ID` delivers no credential. Where the host already supplies an AWS identity, drop the variables entirely rather than renaming them. `S3_BUCKET` and `S3_REGION` are unchanged.

### Removed

- **Agent Skills support.** mpak is refocused to do one thing: package MCP servers as portable, security-scanned MCPB bundles. Removed the `mpak skill` CLI namespace, the `/v1/skills` registry API and its OIDC announce path, the skill SDK methods (TypeScript and Python), the skill schemas, and the `skills` / `skill_versions` database tables. Skill packaging and distribution now live in the `skills.sh` / `npx skills` ecosystem. This is a breaking change: published skills, skill installs, and skill badge embeds are no longer served.

## [0.1.0] - 2026-02-10

Initial public release of mpak, the open-source MCP bundle and skill registry.

[0.1.0]: https://github.com/NimbleBrainInc/mpak/releases/tag/v0.1.0
