# @nimblebrain/mpak-web

The mpak web UI. A React single-page application for the mpak package registry, enabling users to discover, browse, and manage MCP bundles and Agent Skills.

## Stack

- React 19 with TypeScript
- Vite 7 for build tooling
- Tailwind CSS v4 for styling
- React Router DOM v7 (data router pattern)
- TanStack React Query v5 for server state
- Clerk for authentication
- Zod v4 for runtime validation

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start dev server
pnpm --filter @nimblebrain/mpak-web dev

# Type check
pnpm --filter @nimblebrain/mpak-web typecheck

# Build for production
pnpm --filter @nimblebrain/mpak-web build

# Preview production build
pnpm --filter @nimblebrain/mpak-web preview
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description |
|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for authentication |
| `VITE_API_URL` | Backend API URL (defaults to `http://localhost:3000`) |
| `VITE_ENABLE_DEBUG_AUTH` | Show auth debug panel (`true`/`false`) |

## Docker

```bash
docker build \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_xxx \
  --build-arg VITE_API_URL=https://registry.mpak.dev \
  -f apps/web/Dockerfile \
  -t mpak-web .

docker run -p 8080:8080 mpak-web
```

## Project Structure

```
src/
  components/    # Reusable UI components
  contexts/      # React context providers
  hooks/         # Custom React hooks
  layouts/       # Page layout components
  lib/           # API client, utilities
  pages/         # Route page components
  schemas/       # Zod schemas for API responses
  assets/        # Static assets (images)
scripts/         # Build scripts (sitemap generation)
public/          # Static public assets
```
