#!/usr/bin/env bash
# scripts/test.sh - Run all tests across the monorepo
#
# Usage:
#   ./scripts/test.sh           # Run all tests
#   ./scripts/test.sh --ts      # TypeScript tests only
#   ./scripts/test.sh --py      # Python tests only
#   ./scripts/test.sh --lint    # Lint + typecheck only
#   ./scripts/test.sh --ci      # Full CI pipeline (lint + typecheck + test)

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

MODE="${1:-all}"
FAILURES=0

# -- TypeScript tests ----------------------------------------------------------

run_ts_tests() {
  info "Running TypeScript tests..."
  cd "$ROOT_DIR"
  if pnpm test; then
    ok "TypeScript tests passed"
  else
    error "TypeScript tests failed"
    FAILURES=$((FAILURES + 1))
  fi
}

# -- Python tests --------------------------------------------------------------

run_py_tests() {
  info "Running Python tests (scanner)..."
  cd "$ROOT_DIR/apps/scanner"

  if command -v uv &>/dev/null; then
    if uv run pytest; then
      ok "Python tests passed"
    else
      error "Python tests failed"
      FAILURES=$((FAILURES + 1))
    fi
  else
    warn "uv not found, trying pytest directly..."
    if python3 -m pytest; then
      ok "Python tests passed"
    else
      error "Python tests failed"
      FAILURES=$((FAILURES + 1))
    fi
  fi
}

# -- Lint & typecheck ----------------------------------------------------------

run_lint() {
  info "Running TypeScript lint..."
  cd "$ROOT_DIR"
  if pnpm lint; then
    ok "TypeScript lint passed"
  else
    error "TypeScript lint failed"
    FAILURES=$((FAILURES + 1))
  fi

  info "Running TypeScript typecheck..."
  if pnpm typecheck; then
    ok "TypeScript typecheck passed"
  else
    error "TypeScript typecheck failed"
    FAILURES=$((FAILURES + 1))
  fi

  info "Running Python lint (scanner)..."
  cd "$ROOT_DIR/apps/scanner"
  if command -v uv &>/dev/null; then
    if uv run ruff check src/ tests/; then
      ok "Python ruff check passed"
    else
      error "Python ruff check failed"
      FAILURES=$((FAILURES + 1))
    fi

    if uv run ruff format --check src/ tests/; then
      ok "Python ruff format passed"
    else
      error "Python ruff format failed"
      FAILURES=$((FAILURES + 1))
    fi

    if uv run ty check src/; then
      ok "Python ty check passed"
    else
      error "Python ty check failed"
      FAILURES=$((FAILURES + 1))
    fi
  else
    warn "uv not found, skipping Python lint"
  fi
}

# -- Format check --------------------------------------------------------------

run_format_check() {
  info "Checking formatting..."
  cd "$ROOT_DIR"
  if pnpm format:check; then
    ok "Formatting check passed"
  else
    error "Formatting check failed"
    FAILURES=$((FAILURES + 1))
  fi
}

# -- Execute based on mode -----------------------------------------------------

case "$MODE" in
  --ts)
    run_ts_tests
    ;;
  --py)
    run_py_tests
    ;;
  --lint)
    run_lint
    ;;
  --ci)
    run_format_check
    run_lint
    run_ts_tests
    run_py_tests
    ;;
  all|*)
    run_ts_tests
    run_py_tests
    ;;
esac

# -- Report --------------------------------------------------------------------

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo -e "${GREEN}All checks passed.${NC}"
  exit 0
else
  echo -e "${RED}$FAILURES check(s) failed.${NC}"
  exit 1
fi
