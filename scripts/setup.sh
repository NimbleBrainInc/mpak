#!/usr/bin/env bash
# scripts/setup.sh - Set up the mpak development environment
#
# Usage: ./scripts/setup.sh
#
# This script:
#   1. Checks prerequisites (node, pnpm, python, uv)
#   2. Installs all dependencies
#   3. Sets up .env from .env.example if needed
#   4. Starts PostgreSQL (via Docker) if not running
#   5. Runs database migrations
#   6. Generates Prisma client

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; }

# -- Check prerequisites ------------------------------------------------------

check_command() {
  local cmd="$1"
  local install_hint="$2"
  if ! command -v "$cmd" &>/dev/null; then
    error "$cmd is not installed. $install_hint"
    return 1
  fi
  ok "$cmd found: $(command -v "$cmd")"
}

info "Checking prerequisites..."

MISSING=0

check_command "node" "Install via nvm: https://github.com/nvm-sh/nvm" || MISSING=1
check_command "pnpm" "Install: corepack enable pnpm" || MISSING=1
check_command "python3" "Install Python 3.13+: https://www.python.org" || MISSING=1
check_command "docker" "Install Docker Desktop: https://www.docker.com" || MISSING=1

# uv is optional but recommended for the scanner
if command -v uv &>/dev/null; then
  ok "uv found: $(command -v uv)"
else
  warn "uv not found. Recommended for scanner development: https://docs.astral.sh/uv/"
fi

if [ "$MISSING" -ne 0 ]; then
  error "Missing prerequisites. Install them and re-run this script."
  exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  error "Node.js 22+ is required. Current: $(node -v)"
  exit 1
fi
ok "Node.js version: $(node -v)"

# -- Install dependencies -----------------------------------------------------

info "Installing pnpm dependencies..."
cd "$ROOT_DIR"
pnpm install
ok "pnpm dependencies installed"

# -- Set up .env file ----------------------------------------------------------

if [ ! -f "$ROOT_DIR/.env" ]; then
  info "Creating .env from .env.example..."
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  ok ".env file created. Edit it with your secrets."
else
  ok ".env file already exists"
fi

# -- Start PostgreSQL ----------------------------------------------------------

info "Checking PostgreSQL..."

# Check if postgres is already running on port 5432
if pg_isready -h localhost -p 5432 &>/dev/null; then
  ok "PostgreSQL is already running on localhost:5432"
else
  info "Starting PostgreSQL via Docker..."
  docker run -d \
    --name mpak-postgres \
    -e POSTGRES_USER=mpak \
    -e POSTGRES_PASSWORD=mpak \
    -e POSTGRES_DB=mpak \
    -p 5432:5432 \
    --health-cmd="pg_isready -U mpak" \
    --health-interval=5s \
    --health-timeout=5s \
    --health-retries=5 \
    postgres:16-alpine 2>/dev/null || {
      # Container might already exist but be stopped
      docker start mpak-postgres 2>/dev/null || true
    }

  info "Waiting for PostgreSQL to be ready..."
  for i in $(seq 1 30); do
    if pg_isready -h localhost -p 5432 &>/dev/null; then
      break
    fi
    sleep 1
  done

  if pg_isready -h localhost -p 5432 &>/dev/null; then
    ok "PostgreSQL is ready"
  else
    error "PostgreSQL failed to start. Check: docker logs mpak-postgres"
    exit 1
  fi
fi

# -- Run database migrations ---------------------------------------------------

info "Running database migrations..."
cd "$ROOT_DIR/apps/registry"

# Generate Prisma client
npx prisma generate
ok "Prisma client generated"

# Run migrations (dev mode creates the database if needed)
npx dotenv -e ../../.env -- npx prisma migrate dev --name init 2>/dev/null || {
  warn "Migration may have already been applied. Running prisma db push as fallback..."
  npx dotenv -e ../../.env -- npx prisma db push
}
ok "Database migrations applied"

# -- Install scanner dependencies (optional) -----------------------------------

if command -v uv &>/dev/null; then
  info "Installing scanner dependencies..."
  cd "$ROOT_DIR/apps/scanner"
  uv sync --dev
  ok "Scanner dependencies installed"
else
  warn "Skipping scanner setup (uv not installed)"
fi

# -- Done ----------------------------------------------------------------------

cd "$ROOT_DIR"

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your Clerk and storage credentials"
echo "  2. Run: ./scripts/dev.sh    (start all services)"
echo "  3. Open: http://localhost:5173  (web UI via Vite)"
echo "  4. API:  http://localhost:3200  (registry API)"
echo ""
