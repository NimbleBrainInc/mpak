# mpak - Open source MCP bundle registry
#
# This Makefile provides convenience targets for development.
# Most commands delegate to pnpm/turbo (Node) or docker compose.
#
# Quick start:
#   make setup       # install deps + generate prisma client
#   make dev         # start all services in dev mode
#   make test        # run all tests
#
# Docker (full stack with Postgres):
#   make up          # docker compose up (dev)
#   make down        # docker compose down
#   make up-prod     # docker compose up (production config)

.PHONY: setup dev build test lint typecheck format format-check clean \
        up down up-prod logs \
        db-generate db-migrate db-push db-studio \
        docker-build-api docker-build-web docker-build-scanner \
        verify help

# --- Setup ---

setup:
	pnpm install
	cd apps/registry && npx prisma generate

# --- Development ---

dev:
	pnpm dev

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

typecheck:
	pnpm typecheck

format:
	pnpm format

format-check:
	pnpm format:check

clean:
	pnpm clean

# --- Full verification (CI-equivalent) ---

verify: lint typecheck test build
	@echo "All checks passed"

# --- Docker Compose ---

up:
	docker compose -f deploy/docker/docker-compose.yml up --build

down:
	docker compose -f deploy/docker/docker-compose.yml down

up-prod:
	docker compose -f deploy/docker/docker-compose.prod.yml up --build -d

logs:
	docker compose -f deploy/docker/docker-compose.yml logs -f

# --- Database (local development) ---

db-generate:
	cd apps/registry && npx prisma generate

db-migrate:
	cd apps/registry && npx prisma migrate dev

db-push:
	cd apps/registry && npx prisma db push

db-studio:
	cd apps/registry && npx prisma studio

# --- Docker images (standalone builds) ---

docker-build-api:
	docker build -t mpak-registry:latest -f apps/registry/Dockerfile .

docker-build-web:
	docker build -t mpak-web:latest -f apps/web/Dockerfile .

docker-build-scanner:
	docker build -t mpak-scanner:latest -f apps/scanner/Dockerfile apps/scanner/

# --- Help ---

help:
	@echo "mpak Development Targets"
	@echo ""
	@echo "  setup          Install dependencies and generate Prisma client"
	@echo "  dev            Start all services in development mode"
	@echo "  build          Build all packages and apps"
	@echo "  test           Run all tests"
	@echo "  lint           Run linting"
	@echo "  typecheck      Run TypeScript type checking"
	@echo "  format         Format all files"
	@echo "  format-check   Check formatting (CI)"
	@echo "  verify         Run lint + typecheck + test + build"
	@echo "  clean          Remove build artifacts and node_modules"
	@echo ""
	@echo "Docker Compose:"
	@echo "  up             Start dev stack (Postgres + registry + web + scanner)"
	@echo "  down           Stop dev stack"
	@echo "  up-prod        Start production-like stack"
	@echo "  logs           Follow docker compose logs"
	@echo ""
	@echo "Database:"
	@echo "  db-generate    Regenerate Prisma client"
	@echo "  db-migrate     Run migrations (development)"
	@echo "  db-push        Push schema to database (no migration file)"
	@echo "  db-studio      Open Prisma Studio"
	@echo ""
	@echo "Docker Images:"
	@echo "  docker-build-api      Build registry API image"
	@echo "  docker-build-web      Build web frontend image"
	@echo "  docker-build-scanner  Build scanner image"
