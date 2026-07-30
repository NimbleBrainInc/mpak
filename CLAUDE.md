# mpak

mpak is an open-source MCP bundle registry: search, download, publish, and scan MCPB bundles. It does one thing — package MCP servers as portable, security-scanned MCPB bundles.

## Monorepo Structure

```
apps/
  registry/     # Fastify API (Node, Prisma, S3, Clerk auth)
  web/          # React SPA (Vite, Tailwind, React Router)
  scanner/      # Security scanner (Python, runs as K8s Jobs)
  docs/         # Documentation site (Astro/Starlight)
packages/
  cli/              # mpak CLI
  schemas/          # Shared Zod schemas
  sdk-typescript/   # TypeScript SDK
  sdk-python/       # Python SDK (OpenAPI-generated types)
```

## Verification

**Always run before considering a task done:**

```bash
pnpm verify    # CI-equivalent gate: typecheck, lint, format check, and tests
```

It must pass with zero errors. Warnings are acceptable.

For a single package, use turbo filters:
```bash
pnpm --filter @nimblebrain/mpak-web typecheck
pnpm --filter @nimblebrain/mpak-registry test
```

## Key Conventions

- **API URL**: In the browser the web app calls the API same-origin, so the address is empty. Server-side loaders have no origin to be relative to and read `MPAK_API_URL` at request time (see `apps/web/src/lib/siteConfig.ts`). It is deliberately not a `VITE_` variable: those are inlined at build time, so a value set on a running container would never be seen.
- **Scoped packages**: All package names are scoped (`@scope/name`)
- **Prisma**: Registry uses Prisma ORM. Run `npm run db:generate` in `apps/registry/` after schema changes.
- **Rendering**: Routes are server-rendered (`ssr: true` in `apps/web/react-router.config.ts`), so crawlers get real HTML on first byte.

## Scanner (Python)

The scanner lives in `apps/scanner/` and has its own CLAUDE.md. It uses Python with uv for dependency management and ruff for linting.
