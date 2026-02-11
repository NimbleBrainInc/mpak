# Build stage - using pnpm in monorepo
FROM node:22-slim AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

# Copy root workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/

# Install dependencies (workspace-aware)
RUN pnpm install --frozen-lockfile --filter @nimblebrain/mpak-web...

# Copy application code
COPY apps/web/ apps/web/

# Accept build arguments for Vite environment variables
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_ENABLE_DEBUG_AUTH=false
ARG VITE_GTM_ID

# Set environment variables for the build
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_ENABLE_DEBUG_AUTH=$VITE_ENABLE_DEBUG_AUTH
ENV VITE_GTM_ID=$VITE_GTM_ID

# Install Playwright's Chromium for prerendering
RUN pnpm --filter @nimblebrain/mpak-web exec playwright install --with-deps chromium

# Build the application (Vite will inject these at build time)
RUN pnpm --filter @nimblebrain/mpak-web build

# Production stage - use unprivileged nginx for non-root execution (UID 101)
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copy built assets from builder stage
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 8080
EXPOSE 8080

# Start nginx (runs as nginx user, UID 101)
CMD ["nginx", "-g", "daemon off;"]
