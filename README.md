# mpak

[![mpak.dev](https://mpak.dev/badge.svg)](https://mpak.dev) [![CI](https://github.com/NimbleBrainInc/mpak/actions/workflows/ci.yml/badge.svg)](https://github.com/NimbleBrainInc/mpak/actions/workflows/ci.yml)

The open source package registry for [MCP](https://modelcontextprotocol.io/) (Model Context Protocol) servers. Every bundle scanned, every install scored.

mpak provides three things:

1. **MCPB** (MCP Bundle), a standardized package format for MCP servers with declared dependencies, locked versions, and reproducible installs.
2. **MTF** (mpak Trust Framework), a security scanner that scores every bundle across supply chain, code quality, artifact integrity, and provenance controls.
3. **A self-hostable registry** that stores, serves, and scores MCPB bundles. Use the public instance at [mpak.dev](https://mpak.dev) or run your own.

## Why this exists

MCP is the open protocol that lets AI agents call external tools. An MCP server exposes capabilities (API calls, file access, database queries) that agents invoke at runtime. That means MCP servers get privileged access to AI agent execution environments. A compromised server means arbitrary code execution inside your workflow.

The MCP ecosystem has no standardized supply chain security. Servers are distributed as loose scripts, GitHub repos, npm packages, and Docker images with no consistent packaging and no verification of what they contain before they run. The official MCP Registry indexes thousands of servers but makes no claims about their safety.

Discovery is solved. Trust is not. mpak handles what comes after discovery: packaging, verification, distribution, and governance.

## Concepts

### Bundles

A bundle is a `.mcpb` file (a ZIP archive) that contains everything needed to run an MCP server:

```
my-server.mcpb
├── manifest.json     # Metadata: name, version, server_type, how to run it
├── src/              # Server source code
└── deps/             # All dependencies, vendored
```

`manifest.json` is the required entry point. It declares the package name, version, server type (`node`, `python`, or `binary`), platform-specific run commands, and the tools/prompts/resources the server exposes. The schema is defined in `packages/schemas`.

### Skills

Skills are the knowledge counterpart to bundles. While bundles give an AI agent the ability to *do* things (call APIs, run commands), skills give it the ability to *think* about things (domain expertise, workflow instructions).

A skill is a markdown file (`SKILL.md`) with YAML frontmatter that declares metadata (name, description, category, trigger phrases). Skills can be packaged as `.skill` files (also ZIP archives) and distributed through the registry.

### Trust levels

Every bundle receives a trust score from the MTF scanner. The score has two parts: a level (L1 through L4) and a numeric score (0 to 100) representing how many controls passed within that level. See the full framework at [mpaktrust.org](https://mpaktrust.org).

| Level | Name | Controls | What it means |
|-------|------|----------|---------------|
| **L1** | Basic | 5 | SBOM generated, no secrets or malware detected, valid manifest, tools declared |
| **L2** | Standard | 15 | Adds vulnerability scanning, dependency pinning, static analysis, author identity |
| **L3** | Verified | 22 | Adds bundle signatures, build attestation, input validation, repo health checks |
| **L4** | Attested | 25 | Adds behavioral analysis, reproducible builds, commit linkage |

In the CLI output, `L3 87` means the bundle reached Level 3 and passed 87% of L3 controls.

### Publishing

Bundles are published through GitHub Actions, not the CLI. A GitHub Actions workflow calls `POST /v1/bundles/announce` with a GitHub OIDC token. The registry verifies the token, downloads the release artifact from GitHub, validates the SHA256 hash, stores the bundle, and triggers an MTF security scan. This design ensures every published bundle has a verifiable link back to a source repository and CI run.

### Claiming

Claiming lets a maintainer prove they own a package. To claim `@scope/my-server`, add a `mpak.json` file to your GitHub repo:

```json
{
  "name": "@scope/my-server",
  "maintainers": ["your-github-username"]
}
```

Then call the claim endpoint. The registry verifies the file exists in your repo with matching metadata. Once claimed, only the claimer (or the repo owner) can publish new versions.

## Quickstart

Install the CLI:

```bash
npm install -g @nimblebrain/mpak
```

Search for a bundle:

```bash
mpak search github

# NAME                      VERSION   TRUST    DESCRIPTION
# @anthropic/github-mcp     1.2.0     L3 87    GitHub API integration
# community/github-issues   2.0.1     L4 94    Issue management
```

Pull and run it:

```bash
mpak bundle run @anthropic/github-mcp
```

The CLI downloads the bundle from mpak.dev, extracts it to `~/.mpak/cache/`, and starts the MCP server.

### Use with Claude Desktop

Add a server to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "github": {
      "command": "mpak",
      "args": ["bundle", "run", "@anthropic/github-mcp"]
    }
  }
}
```

### Use with Claude Code

```bash
claude mcp add github -- mpak bundle run @anthropic/github-mcp
```

## Repository structure

This is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/).

```
packages/
  schemas/       Zod schemas and TypeScript types (foundation for everything else)
  sdk/           TypeScript client for the registry API
  cli/           The `mpak` CLI

apps/
  registry/      Fastify API server with Prisma/PostgreSQL
  web/           React + Vite web UI (browse, search, trust scores)
  scanner/       MTF security scanner (Python)
  docs/          Documentation site (Astro/Starlight)

deploy/
  docker/        Docker Compose for local dev and production
  kubernetes/    Helm chart

scripts/
  setup.sh       One-time dev environment setup
  dev.sh         Start all services for local development
  test.sh        Run the full test suite
  release.sh     Version bump, changelog, publish
```

### Dependency graph

```
schemas  (no internal deps)
   ↓
  sdk    (depends on schemas)
   ↓
  cli    (depends on sdk + schemas)

registry (depends on schemas, standalone Fastify server)
web      (standalone React app, talks to registry API)
scanner  (standalone Python project, not in pnpm workspaces)
```

## Packages

### `packages/schemas`

Zod schemas and inferred TypeScript types for the MCPB manifest format, API responses, trust scores, skills, and validation helpers. This is the source of truth for data shapes across the entire stack.

**Key exports:** `BundleSchema`, `SkillSchema`, `MpakJsonSchema`, `SearchParamsSchema`, validation functions.

### `packages/sdk`

TypeScript SDK for interacting with a mpak registry. Wraps the HTTP API with typed methods for searching, downloading, and inspecting bundles and skills.

```typescript
import { MpakClient } from "@nimblebrain/mpak-sdk";

const client = new MpakClient(); // defaults to https://mpak.dev
const results = await client.searchBundles("github");
const bundle = await client.getBundleDetails("@anthropic/github-mcp");
```

### `packages/cli`

The `mpak` command-line tool. Built with [Commander.js](https://github.com/tj/commander.js/).

| Command | Description |
|---------|-------------|
| `mpak search <query>` | Search bundles and skills |
| `mpak bundle search <query>` | Search bundles only |
| `mpak bundle show <name>` | Show bundle details and trust score |
| `mpak bundle pull <name>` | Download a bundle |
| `mpak bundle run <name>` | Download and run an MCP server |
| `mpak skill search <query>` | Search skills |
| `mpak skill show <name>` | Show skill details |
| `mpak skill install <name>` | Install a skill to `~/.claude/skills/` |
| `mpak skill validate <path>` | Validate a skill directory |
| `mpak skill pack <path>` | Create a `.skill` bundle |
| `mpak config set <pkg> <key=value>` | Set config for a package |
| `mpak config get <pkg>` | Show config for a package |

## Apps

### `apps/registry`

The registry API server. Fastify with Prisma ORM on PostgreSQL. Handles bundle storage, downloads, trust score tracking, and the MTF scanning pipeline.

**API surface:**

- `/v1/bundles/*` - Native mpak API for bundle operations
- `/v1/skills/*` - Native mpak API for skill operations
- `/v0.1/servers` - MCP Registry spec compatibility (so MCP clients can discover bundles through the standard protocol)
- `/app/*` - Routes used by the web UI (auth, admin, package claiming, scan results)
- `/health` - Health check
- `/docs` - OpenAPI/Swagger documentation

**Storage backends:** Local filesystem, S3, GCS, Azure Blob Storage. Configured via environment variables.

**Auth:** Clerk (OIDC). Optional for read endpoints, required for publish.

### `apps/web`

React SPA for browsing the registry. Built with Vite, Tailwind CSS 4, React Router, and TanStack Query. Includes trust score visualization, bundle details, skill browsing, and an admin panel.

### `apps/scanner`

Python security scanner implementing the mpak Trust Framework (MTF). Evaluates bundles against 20+ controls across five domains:

| Domain | Controls | What it checks |
|--------|----------|----------------|
| Supply Chain (SC) | SC-01 through SC-03 | SBOM, vulnerability scanning, dependency pinning |
| Code Quality (CQ) | CQ-01 through CQ-06 | Secrets, malicious patterns, static analysis, unsafe execution |
| Artifact Integrity (AI) | AI-01, AI-02 | Manifest validation, content hashes |
| Provenance (PR) | PR-01, PR-02 | Repository verification, author identity |
| Capability Declaration (CD) | CD-01 through CD-03 | Tool descriptions, permission scopes |

Produces a trust score from L1 (Basic) to L4 (Attested) based on which controls pass. See [Trust levels](#trust-levels) for details on each level.

**How scanning works:** When a bundle is published, the registry creates a Kubernetes Job that runs the scanner image. The scanner evaluates the bundle, writes results to S3, and POSTs the score back to the registry via a callback URL. In Docker Compose, the scanner runs as a standalone container instead of a K8s Job.

### `apps/docs`

Documentation site. Covers CLI usage, bundle format, skills, integrations (VS Code, Claude Desktop, Cursor, Claude Code), and security controls.

## Development setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- PostgreSQL 16+
- Python 3.13+ and [uv](https://docs.astral.sh/uv/) (for the scanner)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up PostgreSQL

If you already have PostgreSQL running locally:

```bash
psql -c "CREATE USER mpak WITH PASSWORD 'mpak' CREATEDB;"
psql -c "CREATE DATABASE mpak OWNER mpak;"
```

Or start one with Docker:

```bash
docker run -d --name mpak-postgres \
  -e POSTGRES_USER=mpak -e POSTGRES_PASSWORD=mpak -e POSTGRES_DB=mpak \
  -p 5432:5432 postgres:16-alpine
```

### 3. Configure environment

Each app that needs configuration has its own `.env.example`. Copy them:

```bash
cp apps/registry/.env.example apps/registry/.env
cp apps/web/.env.example apps/web/.env
```

The defaults work for local development with no changes needed.

### 4. Run database migrations

```bash
cd apps/registry && npx prisma migrate dev && cd ../..
```

### 5. Seed example data

Populate the database with example skills so the UI has something to show:

```bash
cd apps/registry && npm run db:seed && cd ../..
```

This inserts a handful of real skills (`@nimblebraininc/docs-auditor`, `@nimblebraininc/seo-optimizer`, `@nimblebraininc/strategic-thought-partner`) with multiple versions, download counts, tags, and triggers. Safe to run multiple times (uses upserts).

To add more seed data, edit `apps/registry/prisma/seed.ts`.

### 6. Build

```bash
pnpm build
```

### Running services

Start services individually. Each runs in its own terminal:

```bash
# Registry API (port 3200)
pnpm --filter @nimblebrain/mpak-registry dev

# Web UI (port 5173)
pnpm --filter @nimblebrain/mpak-web dev

# Docs site (port 4321)
pnpm --filter mpak-docs dev
```

Verify the registry is running:

```bash
curl http://localhost:3200/health
```

### Running with Docker Compose

```bash
docker compose -f deploy/docker/docker-compose.yml up --build
```

| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 | PostgreSQL 16 |
| `registry` | 3200 | Registry API |
| `web` | 8080 | Web UI (nginx) |
| `scanner` | - | MTF scanner (CLI tool) |

### Running tests

```bash
# All TypeScript tests
pnpm test

# Specific package
pnpm --filter @nimblebrain/mpak-schemas test
pnpm --filter @nimblebrain/mpak-sdk test
pnpm --filter @nimblebrain/mpak test       # CLI

# Python scanner tests
cd apps/scanner && uv sync --dev && uv run pytest

# Full verification (build + test + lint + typecheck)
pnpm build && pnpm test && pnpm lint && pnpm typecheck
```

### Build

```bash
# Build all packages (respects dependency order via Turborepo)
pnpm build

# Build a specific package
pnpm --filter @nimblebrain/mpak-schemas build

# CLI smoke test after building
node packages/cli/dist/index.js --help
```

## Environment variables

Each app manages its own `.env` file. There is no root `.env`.

### `apps/registry/.env`

See [`apps/registry/.env.example`](apps/registry/.env.example) for the full list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://mpak:mpak@localhost:5432/mpak` | PostgreSQL connection string |
| `PORT` | `3200` | Registry server port |
| `STORAGE_TYPE` | `local` | Bundle storage: `local` or `s3` |
| `STORAGE_PATH` | `./packages` | Local storage path (when `STORAGE_TYPE=local`) |
| `CLERK_SECRET_KEY` | (empty) | Clerk auth secret. Optional for local dev, required in production |
| `SCANNER_ENABLED` | `false` | Enable MTF scanning on publish |
| `SCANNER_CALLBACK_URL` | `http://localhost:3200/app/scan-results` | URL the scanner POSTs results to. Set to your cluster-internal service address in K8s |
| `SCANNER_SECRET_NAME` | `scanner-secrets` | Name of the K8s Secret mounted into scanner Jobs |

### `apps/web/.env`

See [`apps/web/.env.example`](apps/web/.env.example) for the full list.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3200` | Registry API endpoint |
| `VITE_CLERK_PUBLISHABLE_KEY` | (empty) | Clerk public key. Optional for local dev |
| `VITE_ENABLE_DEBUG_AUTH` | `true` | Show auth debug panel in UI |

## Deployment

### Database migrations

Run Prisma migrations directly:

```bash
# Check migration status
cd apps/registry && DATABASE_URL="postgresql://..." npx prisma migrate status

# Run pending migrations
cd apps/registry && DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

### Helm

```bash
helm lint deploy/kubernetes/helm/mpak/
helm install mpak deploy/kubernetes/helm/mpak/ \
  --set config.databaseUrl="postgresql://..." \
  --set config.storageBackend=s3
```

The Helm chart supports `existingSecret` for production secrets management.

### Docker (production)

```bash
docker compose -f deploy/docker/docker-compose.prod.yml up -d
```

Uses pre-built images with S3 storage and proper resource limits.

## Architecture

```
                    ┌─────────────┐
                    │   Web UI    │  React SPA
                    │  (Vite)     │  Browse, search, trust scores
                    └──────┬──────┘
                           │ HTTP
                           ▼
┌─────────┐       ┌─────────────┐       ┌──────────┐
│   CLI   │──────▶│  Registry   │──────▶│ Storage  │
│ (mpak)  │ HTTP  │  (Fastify)  │       │ (S3/GCS/ │
└─────────┘       └──────┬──────┘       │  local)  │
                         │              └──────────┘
                    ┌────┴────┐
                    │         │
                    ▼         ▼
              ┌──────────┐ ┌─────────┐
              │PostgreSQL│ │ Scanner │
              │ (Prisma) │ │ (Python)│
              └──────────┘ └─────────┘
```

The CLI and web UI both talk to the registry API. The registry stores bundles in configurable storage (S3, GCS, Azure, or local filesystem) and metadata in PostgreSQL. Bundles are published via GitHub Actions OIDC (not the CLI). When a bundle is published, the registry creates a Kubernetes Job running the scanner. The scanner evaluates MTF controls, writes detailed results to S3, and POSTs the trust score back to the registry via a callback URL.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, commit conventions, and code style guidelines.

## License

Apache 2.0. See [LICENSE](LICENSE).
