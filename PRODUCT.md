# mpak

mpak is the open-source MCPB (MCP Bundle) registry: a package manager and distribution platform for MCP servers. It lets developers package MCP servers as self-contained bundles, publish them to the registry, and install them with a single CLI command.

## Status

OSS. Core registry (API, web, CLI, scanner) is public. Trust framework is a separate public repo. No private components.

## Domains

| Domain | Purpose |
|--------|---------|
| `mpak.dev` | Bundle registry web UI (search, browse, install) |
| `registry.mpak.dev` | MCP server discovery API |

## Repos / Paths in hq

| Path | Description |
|------|-------------|
| `products/mpak/code/` | This repo: monorepo (API, web, CLI, scanner, SDK) |
| `products/mpak/trust/` | mpak Trust Framework (MTF) security standard |
| `products/mpak/awesome/` | awesome-mcpb: curated list of MCPB bundles |
| `deployments/mpak/` | Kubernetes deployment config |

## Monorepo Layout

```
apps/
  api/         # REST API (Hono, Node)
  web/         # Registry web UI (Next.js)
  cli/         # mpak CLI (Node)
  scanner/     # Bundle scanner/validator
packages/
  sdk/         # JS/TS SDK
  python-sdk/  # Python SDK (OpenAPI-generated types)
```

## Deployment

See `deployments/mpak/CLAUDE.md` for environment config, deploy commands, and secrets management.

Environments: `staging` (default), `production`.

## Trust Framework

The mpak Trust Framework (MTF) defines security and provenance standards for published bundles. It lives at `products/mpak/trust/` and is published at `mpaktrust.org`.

## Key Concepts

- **MCPB bundle**: A zip containing an MCP server + `manifest.json` + deps. Self-contained, no install step.
- **mpak install**: Downloads a bundle, verifies integrity, configures the MCP client.
- **Registry**: Hosts bundle metadata, download counts, trust scores.
