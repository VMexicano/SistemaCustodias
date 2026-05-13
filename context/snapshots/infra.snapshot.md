# Snapshot — Infraestructura
> Última actualización: 2026-05-07 | Estado: ✅ Sprint 17 completo

## Estado
- Monorepo Turborepo: ✅ pnpm 9 + workspaces
- docker-compose: ✅ 6 servicios (infra only — apps corren nativas)
- Migraciones: ✅ 38 migraciones aplicadas (migration 001 → 038)
- Seeds: ✅ 11 seeds aplicados (01–11)
- Jest + Testcontainers: ✅ Configurado (API modular v10)
- Playwright: ✅ 6 specs smoke (auth, estimate, admin-web, trip-detail-vertical, vertical-editor, approval-flow)
- CI/CD: ✅ GitHub Actions (lint + type-check + test)
- Deploy: 🔲 No configurado (staging Railway/Render pendiente)

## Servicios en docker-compose

```
postgres   → timescale/timescaledb:latest-pg15  puerto 5432
redis      → redis:7-alpine                     puerto 6379
bull-board → bull-board UI                      puerto 3001
prometheus → prom/prometheus:v2.52.0            puerto 9090
grafana    → grafana:10.4.2                     puerto 3000
jaeger     → jaeger:1.57                        puerto 16686 (UI), 4318 (OTLP)
```

## URLs locales de desarrollo

```
API (Fastify)   http://localhost:3333
Backoffice web  http://localhost:5173   (Vite dev server)
Mobile Metro    http://localhost:8081
Bull Board      http://localhost:3001
Grafana         http://localhost:3000
Prometheus      http://localhost:9090
Jaeger          http://localhost:16686
PostgreSQL      localhost:5432  (ridebase_user / ridebase_pass / ridebase_dev)
Redis           localhost:6379  (sin auth)
```

## Comandos de setup

```bash
pnpm install                                   # instalar dependencias
docker compose up -d                           # levantar infra
pnpm --filter @ridebase/api db:migrate         # correr migraciones (38 en Sprint 17)
pnpm --filter @ridebase/api db:seed            # correr seeds (11 en Sprint 17)
pnpm dev                                       # levantar api + web + metro en paralelo
```

Guía completa (12 pasos): `docs/VERTICAL_CLONE_GUIDE.md`

## Variables de entorno requeridas (apps/api/.env)

```bash
# Obligatorias
DATABASE_URL=postgresql://ridebase_user:ridebase_pass@localhost:5432/ridebase_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=<64+ chars random>
JWT_REFRESH_SECRET=<64+ chars random, distinto al anterior>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
PORT=3333
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
OTP_PROVIDER=log                               # log en dev, firebase en prod
STRIPE_SECRET_KEY=sk_test_...                  # requerido por validación Zod de entorno
VERTICAL_SLUG=taxi                             # taxi | custody | cold-chain

# Opcionales en desarrollo
LOG_LEVEL=info
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
TEST_OTP_BYPASS=false
TEST_OTP_CODE=123456

# Solo en producción
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="..."
```

> ⚠️ No hay Google Maps Key — el proyecto usa **Mapbox** (`@rnmapbox/maps`) desde Sprint 8 (ADR-031).
> ⚠️ No hay Twilio — OTP via `log` (dev) o Firebase (prod) desde Sprint 2 (ADR-018).

## Migraciones activas (38 total)

```
001–022  Sprint 1 — schema base (users, drivers, trips, payments, audit_logs…)
023      Sprint 2 — user_auth refresh token
024–027  Sprint 3 — drivers, vehicles, driver_documents, trip_types service_mode
028      Sprint 4 — trip_status_history actor_type
029      Sprint 5 — passenger_payment_methods stripe_customer_id nullable
030      Sprint 7 — device_tokens
031      Sprint 8 — trip_types description
032      Sprint 8 — admin_users + audit_logs admin
033      Sprint 9 — scheduled_trips dispatch_window_min + pre_assigned fields
034      Sprint 10 — verticals + ALTER trip_types + ALTER trips metadata JSONB
035      Sprint 10 — companies + company_users + configurations
036      Sprint 13 — temperature_readings (hypertable) + custody_events + alter tables
037      Sprint 14 — document_requirements unique index (region_id, code, vertical_id)
038      Sprint 17 — trips.approved_at + trips.approved_by FK admin_users
```

## Seeds activos (11 total)

```
01_region_config              región MX: currency MXN, tax_pct 0.16
02_trip_types                 basic/plus/premium
03_pricing_factors            night/rain/peak_hour/high_demand (inactive por defecto)
04_admin_user                 admin / Admin1234!
05_document_requirements      5 requisitos para región MX
06_commission_rules           20% plataforma MX
07_test_users                 +525500000001 (pasajero) · +525500000002 (conductor approved)
09_verticals_and_companies    3 verticals + empresa-demo SA + link trip_types→taxi
10_vertical_document_reqs     doc requirements por vertical + features JSONB
11_enable_approval_verticals  requiresApproval: true en custody + cold-chain
```

> Seed 08 no existe (fue omitido en numeración).

## GitHub Actions (apps/api)

```
.github/workflows/ci.yml  → lint + type-check + unit tests + cache pnpm + turbo
```

## Mapbox (apps/mobile-v2)

Requiere `MAPBOX_SECRET_ACCESS_TOKEN` (`sk.xxx`) en CI para compilar el APK Android.
Configurar como secret en GitHub Actions: `Settings → Secrets → MAPBOX_SECRET_ACCESS_TOKEN`.
Token público (`pk.xxx`) va en `app.json` o como variable de entorno en EAS.
