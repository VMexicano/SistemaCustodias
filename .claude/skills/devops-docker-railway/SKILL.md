---
name: devops-docker-railway
description: Configure Docker containers, docker-compose services, GitHub Actions CI/CD pipelines, and Railway or Render deployments for Node.js applications. Use when writing Dockerfiles, configuring multi-service local environments, setting up CI pipelines, planning database migrations, or managing environment variables. Enforces security (non-root containers, no secrets in git), reproducibility (zero manual setup after clone), and safe migration protocols for production.
---

This skill guides infrastructure configuration for a platform where a misconfigured container or a botched migration can take down active rides and strand passengers. Every infrastructure decision must be reproducible, auditable, and reversible — except when it explicitly cannot be.

The agent receives a task: a Dockerfile to write, a docker-compose to configure, a CI pipeline to set up, or a migration to plan. Context includes the current infra snapshot and environment setup docs.

## Infrastructure Philosophy

Three principles drive every decision:

**1. Simplicity over sophistication.** Railway managed services before self-hosted. A `docker-compose.yml` that anyone can run before a Kubernetes manifest no one understands. Migrate complexity only when load justifies it — that means > 1,000 trips/day. Below that, complexity is technical debt, not engineering maturity.

**2. Reproducibility is the contract.** After `git clone`, the only commands a new developer should need are:
```bash
cp .env.example .env          # Fill in real values
docker compose up -d          # Everything starts
npm run db:migrate            # Schema applied
npm run db:seed               # Base data loaded
npm run test                  # All tests pass
```
If any of those fail on a clean checkout, the infrastructure is broken.

**3. Security is non-negotiable in MVP.** Not because of compliance — because a credential leak in a ride-hailing platform exposes driver and passenger location data. Non-root containers, no secrets in git, secrets only in Railway environment variables.

## Dockerfile — Multi-Stage, Non-Root, Always

```dockerfile
# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Install ALL deps for build
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production runtime — lean image, no devDeps, non-root
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user BEFORE copying files
RUN addgroup -g 1001 -S nodejs \
 && adduser  -u 1001 -S api -G nodejs

# Copy only what's needed for runtime
COPY --from=builder --chown=api:nodejs /app/dist        ./dist
COPY --from=builder --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=api:nodejs /app/package.json ./package.json

USER api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main.js"]
```

**Never `latest`** in production images — always pin to a digest or exact version tag. `node:20-alpine` in the Dockerfile is acceptable for local dev; in CI/CD pin it: `node:20.11.0-alpine3.19`.

## docker-compose.yml — Full Local Stack

Every service needs a healthcheck. Dependent services use `depends_on: condition: service_healthy`. This prevents the API from starting before PostgreSQL is accepting connections.

```yaml
services:
  postgres:
    image: timescale/timescaledb:2.14.2-pg15
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER:     ${DB_USER:-uber_user}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-uber_pass}
      POSTGRES_DB:       ${DB_NAME:-uber_dev}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-uber_user} -d ${DB_NAME:-uber_dev}"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 10s

  redis:
    image: redis:7.2.4-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api:
    build: ./apps/api
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}
      REDIS_URL:    redis://redis:6379
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }

  # Required: bull-board, prometheus, grafana, jaeger
  # See docs/12_environment_setup.md for full service list

volumes:
  postgres_data:
```

**Never hardcode credentials** — always use environment variable references with defaults for local dev only. Production values live exclusively in Railway/Render dashboard.

## .dockerignore — Required for Every App

```
node_modules
dist
.env*
*.log
.git
coverage
__tests__
*.test.ts
*.spec.ts
README.md
```

## GitHub Actions — CI on Every PR

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [main, develop]

jobs:
  ci:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: timescale/timescaledb:2.14.2-pg15
        env:
          POSTGRES_USER: uber_user
          POSTGRES_PASSWORD: uber_pass
          POSTGRES_DB: uber_test
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      redis:
        image: redis:7.2.4-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm run test                    # Unit tests — no external services
      - run: npm run test:integration        # Integration — hits real postgres + redis
        env:
          DATABASE_URL: postgresql://uber_user:uber_pass@localhost:5432/uber_test
          REDIS_URL: redis://localhost:6379
      - run: npm run e2e -- --grep @smoke    # Critical path only in CI
```

## Migration Safety Protocol

This protocol is mandatory before every production migration. Not optional.

```bash
# Step 1 — ALWAYS backup before migrating production
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL | gzip > "backup_pre_migration_${TIMESTAMP}.sql.gz"

# Step 2 — Apply migration
npm run db:migrate

# Step 3 — Verify migration succeeded
npm run db:migrate:status

# Step 4 — Run smoke tests against production
npm run e2e -- --grep @smoke --env production
```

**Never modify a migration that has already been applied** — not in staging, not in production. If you made a mistake, create a new migration that corrects it. Modifying applied migrations causes `migration:status` to diverge and makes the migration history untrustworthy.

## Health Check Endpoints

Both endpoints are required. The public one is for load balancers and Railway's health check. The detailed one is for internal monitoring.

```typescript
// GET /health — public, no auth required, load balancer checks this
// Response: { status: 'ok', uptime: 12345 }
// Must respond in < 100ms

// GET /health/detailed — requires internal API key
// Response: { status: 'ok', db: 'ok', redis: 'ok', queues: { payments: 0, notifications: 3 } }
// Checks actual connectivity, not just process liveness
```

## Key Metrics to Expose for Prometheus

```typescript
// These must be available at GET /metrics (Prometheus format)
trips_active              // Gauge: trips currently in non-terminal state
drivers_online            // Gauge: drivers with status 'available'
driver_matching_seconds   // Histogram: time from SEARCHING to ACCEPTED
trip_fare_mxn             // Histogram: final fare amounts
payment_queue_size        // Gauge: jobs pending in payments BullMQ queue
circuit_breaker_opened    // Counter: circuit breaker open events by service
```

## Railway vs AWS — The Migration Trigger

Stay on Railway/Render until:
- Sustained > 1,000 trips/day
- OR a specific AWS service is required that Railway can't provide
- OR infrastructure cost on Railway exceeds AWS equivalent by > 40%

Below that threshold, Railway managed PostgreSQL + Redis + auto-scaling costs less in engineering time than AWS configuration. Every hour spent on Kubernetes is an hour not spent on the product.

## What NEVER to do

- **Never** commit secrets, .env files, or credentials to git — not even in branches
- **Never** use `latest` image tag in production — always pin versions
- **Never** run the API process as root — always create and use a non-root user
- **Never** modify a migration that has already been applied
- **Never** deploy to production without passing through staging first
- **Never** skip the backup before a production migration
- **Never** put production credentials in docker-compose.yml — use Railway env vars
- **Never** bypass CI to merge a PR — not even for "small" fixes

## Checklist Before Emitting Handoff

```
□ Dockerfile: multi-stage, non-root user, HEALTHCHECK defined
□ .dockerignore: excludes node_modules, .env*, test files
□ docker-compose.yml: all services with healthchecks, depends_on: service_healthy
□ .env.example: every required variable documented with description
□ GitHub Actions CI: lint + type-check + unit + integration + smoke
□ Health check /health returns 200 with DB connected
□ No secrets in any committed file
□ Migration: backup command documented, tested locally
□ Images pinned to specific version tags
```
