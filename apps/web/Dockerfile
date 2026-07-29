# Build stage - pnpm in the monorepo
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --filter @nimblebrain/mpak-web...

COPY apps/web/ apps/web/

# Clerk's key is publishable and gets inlined into the client bundle. Absent it
# the app builds and serves read-only, which is the self-host default.
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_ENABLE_DEBUG_AUTH=false
ARG VITE_GTM_ID
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_ENABLE_DEBUG_AUTH=$VITE_ENABLE_DEBUG_AUTH
ENV VITE_GTM_ID=$VITE_GTM_ID

RUN pnpm --filter @nimblebrain/mpak-web build

RUN pnpm --filter @nimblebrain/mpak-web deploy --prod --legacy /prod

# Runtime — a Node server rather than nginx, because package and browse routes
# render per request so crawlers get real HTML instead of an empty shell.
FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=builder /prod/node_modules ./node_modules
COPY --from=builder /app/apps/web/build ./build
COPY --from=builder /app/apps/web/package.json ./package.json

# Address the registry Service directly. The public hostname resolves to the
# ingress, which would route the request back out of the cluster and in again.
ENV MPAK_API_URL=http://mpak-registry:3200
ENV PORT=8080
EXPOSE 8080

USER node

CMD ["npx", "react-router-serve", "./build/server/index.js"]
