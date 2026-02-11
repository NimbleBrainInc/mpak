# Build stage
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./

# Copy the registry app
COPY apps/registry/package.json apps/registry/tsconfig.json apps/registry/prisma.config.ts ./apps/registry/
COPY apps/registry/prisma/ ./apps/registry/prisma/
COPY apps/registry/src/ ./apps/registry/src/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN cd apps/registry && npx prisma generate

# Build
RUN cd apps/registry && pnpm build

# Production stage
FROM node:22-alpine AS production

RUN corepack enable pnpm

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy the registry app package.json
COPY apps/registry/package.json ./apps/registry/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy Prisma schema and generated client (Prisma 7 generates to hoisted node_modules)
COPY --from=builder /app/apps/registry/prisma/ ./apps/registry/prisma/
COPY --from=builder /app/node_modules/.pnpm/@prisma+client*/node_modules/@prisma/client/ ./node_modules/@prisma/client/
COPY --from=builder /app/node_modules/.pnpm/@prisma+client*/node_modules/.prisma/ ./node_modules/.prisma/
COPY --from=builder /app/node_modules/.pnpm/@prisma+client-runtime-utils*/node_modules/@prisma/client-runtime-utils/ ./node_modules/@prisma/client-runtime-utils/
COPY --from=builder /app/node_modules/.pnpm/@prisma+client-runtime-utils*/node_modules/@prisma/client-runtime-utils/ ./node_modules/@prisma/client-runtime-utils/

# Copy built output
COPY --from=builder /app/apps/registry/dist/ ./apps/registry/dist/

WORKDIR /app/apps/registry

# Environment
ENV NODE_ENV=production
ENV PORT=3200
ENV HOST=0.0.0.0

EXPOSE 3200

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3200/health || exit 1

CMD ["node", "dist/index.js"]
