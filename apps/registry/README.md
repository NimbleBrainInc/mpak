# @nimblebrain/mpak-registry

Backend API server for the mpak package registry. Handles bundle publishing, searching, downloading, package claiming, security scanning, and the MCP Registry API.

## Architecture

- **Fastify v5** web framework with plugin architecture
- **Prisma v7** ORM with PostgreSQL
- **Clerk** for authentication (JWT verification)
- **AWS S3 + CloudFront** for bundle storage and CDN delivery
- **GitHub OIDC** for zero-trust publishing from GitHub Actions
- **Kubernetes Jobs** for security scanning

## API Routes

### Web App API (`/internal`)
- `GET /app/auth/me` - Get authenticated user profile
- `PUT /app/packages` - Publish a package (multipart upload)
- `GET /app/packages` - Search/list packages
- `GET /app/packages/@:scope/:package` - Get package details
- `GET /app/packages/@:scope/:package/versions/:version/download` - Download package
- `GET /app/packages/@:scope/:package/claim-status` - Check claim status
- `POST /app/packages/@:scope/:package/claim` - Claim a package
- `GET /app/packages/me` - Get user's packages
- `GET /app/packages/unclaimed/list` - List unclaimed packages
- `POST /app/scan-results` - Scanner callback
- `POST /app/scan-trigger` - Trigger manual scan (admin)

### Public Bundle API (`/v1/bundles`)
- `GET /v1/bundles/search` - Search bundles
- `GET /v1/bundles/@:scope/:package` - Bundle details
- `GET /v1/bundles/@:scope/:package/badge.svg` - Badge SVG
- `GET /v1/bundles/@:scope/:package/index.json` - MCPB distribution index
- `GET /v1/bundles/@:scope/:package/versions` - List versions
- `GET /v1/bundles/@:scope/:package/versions/:version` - Version details
- `GET /v1/bundles/@:scope/:package/versions/:version/download` - Download
- `POST /v1/bundles/announce` - Announce bundle (OIDC)
- `GET /v1/bundles/@:scope/:package/security` - Security scan status
- `GET /v1/bundles/@:scope/:package/security-badge.svg` - Security badge
- `GET /v1/bundles/@:scope/:package/certified-badge.svg` - Certification badge

### Public Skills API (`/v1/skills`)
- `GET /v1/skills/search` - Search skills
- `GET /v1/skills/@:scope/:name` - Skill details
- `GET /v1/skills/@:scope/:name/badge.svg` - Badge SVG
- `GET /v1/skills/@:scope/:name/download` - Download latest
- `GET /v1/skills/@:scope/:name/versions/:version/download` - Download version
- `POST /v1/skills/announce` - Announce skill (OIDC)

### MCP Registry API (`/v0.1`)
- `GET /v0.1` - API info
- `GET /v0.1/servers` - List MCP servers
- `GET /v0.1/servers/:name/versions/:version` - Get server by name
- `GET /v0.1/servers/:server_id` - Legacy server lookup
- `GET /v0.1/health` - Health check

### General
- `GET /health` - Health check
- `GET /docs` - Swagger UI

## Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# Seed example data (skills with versions, downloads, tags)
npm run db:seed

# Start development server
pnpm dev

# Build
pnpm build

# Run tests
pnpm test

# Type check
pnpm typecheck
```

### Seed data

`npm run db:seed` populates the database with example skills from the NimbleBrain catalog. The seed script uses upserts, so it's safe to run repeatedly. To add more examples, edit `prisma/seed.ts`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | Yes | Clerk authentication secret |
| `CLERK_PUBLISHABLE_KEY` | No | Clerk publishable key |
| `PORT` | No | Server port (default: 3200) |
| `HOST` | No | Server host (default: 0.0.0.0) |
| `NODE_ENV` | No | Environment (development/production) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `STORAGE_TYPE` | No | Storage backend: local or s3 (default: local) |
| `STORAGE_PATH` | No | Local storage path (default: ./packages) |
| `S3_BUCKET` | No | S3 bucket name |
| `S3_REGION` | No | S3 region |
| `S3_ACCESS_KEY_ID` | No | S3 access key |
| `S3_SECRET_ACCESS_KEY` | No | S3 secret key |
| `CLOUDFRONT_DOMAIN` | No | CloudFront distribution domain |
| `CLOUDFRONT_KEY_PAIR_ID` | No | CloudFront key pair ID |
| `CLOUDFRONT_PRIVATE_KEY` | No | CloudFront private key (PEM) |
| `CLOUDFRONT_PRIVATE_KEY_BASE64` | No | CloudFront private key (base64) |
| `CLOUDFRONT_PRIVATE_KEY_PATH` | No | CloudFront private key file path |
| `CLOUDFRONT_URL_EXPIRATION` | No | URL expiration seconds (default: 900) |
| `MAX_BUNDLE_SIZE_MB` | No | Max upload size in MB (default: 50) |
| `SCANNER_ENABLED` | No | Enable security scanning (default: false) |
| `SCANNER_IMAGE` | No | Scanner container image |
| `SCANNER_IMAGE_TAG` | No | Scanner image tag |
| `SCANNER_NAMESPACE` | No | K8s namespace for scans |
| `SCANNER_CALLBACK_SECRET` | No | Scanner callback auth secret |
