# mpak

mpak is an open-source MCP bundle registry: search, download, publish, and scan MCPB bundles and skills.

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
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint all packages
pnpm test         # Run all tests
pnpm build        # Full build (includes prerender)
```

All four must pass with zero errors. Warnings are acceptable.

For a single package, use turbo filters:
```bash
pnpm --filter @nimblebrain/mpak-web typecheck
pnpm --filter @nimblebrain/mpak-registry test
```

## Key Conventions

- **API URL**: The web app derives the API URL from `window.location.hostname` at runtime (see `apps/web/src/lib/siteConfig.ts`). No build-time `VITE_API_URL` needed.
- **Scoped packages**: All package names are scoped (`@scope/name`)
- **Prisma**: Registry uses Prisma ORM. Run `npm run db:generate` in `apps/registry/` after schema changes.
- **Prerender**: Web build includes a prerender step for SEO. Check that all pages succeed.

## Scanner (Python)

The scanner lives in `apps/scanner/` and has its own CLAUDE.md. It uses Python with uv for dependency management and ruff for linting.
