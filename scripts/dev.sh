#!/usr/bin/env bash
# scripts/dev.sh - Start all mpak services for local development
#
# Usage: ./scripts/dev.sh [--docker]
#
# Without flags: Runs services natively (recommended for development)
#   - PostgreSQL via Docker (if not already running)
#   - Registry API via tsx watch
#   - Web UI via Vite dev server
#
# With --docker: Runs everything via Docker Compose
#   - All services in containers
#   - Useful for testing Docker builds

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; }

# -- Docker Compose mode -------------------------------------------------------

if [[ "${1:-}" == "--docker" ]]; then
  info "Starting all services via Docker Compose..."
  cd "$ROOT_DIR"
  docker compose -f deploy/docker/docker-compose.yml up --build
  exit 0
fi

# -- Native development mode ---------------------------------------------------

# Ensure PostgreSQL is running
info "Checking PostgreSQL..."
if pg_isready -h localhost -p 5432 &>/dev/null; then
  ok "PostgreSQL is running"
else
  info "Starting PostgreSQL via Docker..."
  docker run -d \
    --name mpak-postgres \
    -e POSTGRES_USER=mpak \
    -e POSTGRES_PASSWORD=mpak \
    -e POSTGRES_DB=mpak \
    -p 5432:5432 \
    postgres:16-alpine 2>/dev/null || docker start mpak-postgres 2>/dev/null || true

  info "Waiting for PostgreSQL..."
  for i in $(seq 1 30); do
    if pg_isready -h localhost -p 5432 &>/dev/null; then
      break
    fi
    sleep 1
  done

  if pg_isready -h localhost -p 5432 &>/dev/null; then
    ok "PostgreSQL is ready"
  else
    error "PostgreSQL failed to start"
    exit 1
  fi
fi

# Load .env if present
if [ -f "$ROOT_DIR/.env" ]; then
  info "Loading .env file..."
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

# Start services via turbo (parallel dev mode)
info "Starting all services via turbo dev..."
echo ""
echo -e "${GREEN}Services starting:${NC}"
echo "  Registry API:  http://localhost:3200"
echo "  Web UI:        http://localhost:5173"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

cd "$ROOT_DIR"
pnpm dev
