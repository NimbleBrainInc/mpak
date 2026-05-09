# Build stage — full monorepo install + build the registry + flatten its
# closure into /deploy via `pnpm deploy`. Workspace deps (e.g. the
# `workspace:*` link to @nimblebrain/mpak-schemas) and any future
# additions are handled automatically — pnpm walks the dependency
# graph and copies what's needed.
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /app

# Whole monorepo lands here. `.dockerignore` keeps the context small
# (no node_modules, dist, .git, etc.).
COPY . .

# One install resolves every workspace package's deps + workspace links.
RUN pnpm install --frozen-lockfile

# Generate the Prisma client into the pnpm hoisted store. tsc downstream
# consumes its types; the runtime stage copies the generated artifacts
# explicitly (see below).
RUN pnpm --filter @nimblebrain/mpak-registry exec prisma generate

# Build registry + every transitive workspace dep (schemas, etc.).
RUN pnpm --filter @nimblebrain/mpak-registry... build

# Flatten registry + production deps into /deploy. pnpm walks the
# dependency closure and copies every workspace package's `dist/` plus
# every external prod dep — single-stage output, no per-dep COPY pairs
# in the runtime stage as the workspace grows.
RUN pnpm deploy --filter=@nimblebrain/mpak-registry --prod /deploy

# Production stage — minimal runtime image.
FROM node:22-alpine AS production

WORKDIR /app

# Everything the registry needs at runtime, prepared by `pnpm deploy`:
# its own dist/, its production deps (including @prisma/client base),
# and every workspace dep's compiled output.
COPY --from=builder /deploy ./

# Prisma's generated client lands in the pnpm hoisted store at
# `node_modules/.pnpm/@prisma+client*/node_modules/{.prisma,@prisma/client}/`
# during `prisma generate`. `pnpm deploy` carries the @prisma/client
# package itself but not the sibling .prisma folder where the
# *generated* client and engine binaries live. Copy both explicitly so
# the runtime can find them at the canonical lookup paths.
COPY --from=builder /app/node_modules/.pnpm/@prisma+client*/node_modules/.prisma/ ./node_modules/.prisma/
COPY --from=builder /app/node_modules/.pnpm/@prisma+client*/node_modules/@prisma/client/ ./node_modules/@prisma/client/

# Environment
ENV NODE_ENV=production
ENV PORT=3200
ENV HOST=0.0.0.0

EXPOSE 3200

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3200/health || exit 1

CMD ["node", "dist/index.js"]
