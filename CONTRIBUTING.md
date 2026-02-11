# Contributing to mpak

Thank you for your interest in contributing to mpak! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- Python 3.13+ (for the scanner)
- Docker (optional, for integration testing)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/NimbleBrainInc/mpak.git
cd mpak

# Install dependencies
pnpm install

# Set up the database (requires PostgreSQL, see README for setup)
cd apps/registry && cp .env.example .env && npx prisma migrate dev && cd ../..

# Seed example data (skills with versions, tags, triggers)
cd apps/registry && npm run db:seed && cd ../..

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Project Structure

```
mpak/
├── packages/
│   ├── schemas/    # JSON schemas and TypeScript types
│   ├── sdk/        # TypeScript SDK for the registry API
│   └── cli/        # CLI tool (mpak command)
├── apps/
│   ├── registry/   # Registry API server
│   ├── web/        # Web UI
│   ├── scanner/    # MTF security scanner (Python)
│   └── docs/       # Documentation site (Astro)
├── deploy/         # Docker Compose, Helm, Terraform
└── scripts/        # Development scripts
```

### Package Dependencies

```
schemas -> sdk -> cli
schemas -> sdk -> registry
schemas -> sdk -> web
scanner (independent Python)
docs (independent Astro)
```

## Development Workflow

### Running Individual Packages

```bash
# Build a specific package
pnpm --filter @nimblebrain/mpak-schemas build

# Run tests for a specific package
pnpm --filter @nimblebrain/mpak-sdk test

# Start the registry in dev mode
pnpm --filter @nimblebrain/mpak-registry dev
```

### Running Everything Locally

```bash
# Start all services with Docker Compose
cd deploy/docker
docker compose up

# Or use the dev script
./scripts/dev.sh
```

### Code Quality

```bash
# Lint all packages
pnpm lint

# Type check all packages
pnpm typecheck

# Format code
pnpm format
```

## Making Changes

1. Create a branch from `main`
2. Make your changes
3. Add tests for new functionality
4. Ensure all checks pass: `pnpm build && pnpm test && pnpm lint && pnpm typecheck`
5. Submit a pull request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(schemas): add skill manifest schema
fix(cli): handle missing config file gracefully
docs(registry): update API reference
chore(ci): update Node.js version in workflows
```

**Scopes:** `schemas`, `sdk`, `cli`, `registry`, `web`, `scanner`, `docs`, `deploy`, `ci`, `root`

## Reporting Issues

- Use [GitHub Issues](https://github.com/NimbleBrainInc/mpak/issues)
- Include steps to reproduce, expected behavior, and actual behavior
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
