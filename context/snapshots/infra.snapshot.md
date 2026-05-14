# Snapshot — Infraestructura
> Última actualización: 2026-05-13 | Estado: ✅ Docker levantado — Sprint 1 en curso

## Estado
- Monorepo Turborepo: ✅ pnpm 9 + workspaces
- docker-compose: ✅ 6 servicios activos (renombrados de ridebase_ → custodias_)
- Migraciones UBER_BASE: ✅ 38 migraciones heredadas (migration 001 → 038) — no correr aún
- Migraciones custodia: ⬜ Pendiente (M-39 → M-51, Sprint 1)
- Seeds: ✅ 11 seeds UBER_BASE · ⬜ seed custody_types pendiente (Sprint 1)
- Jest + Testcontainers: ✅ Configurado (API modular v10)
- Playwright: ✅ 6 specs smoke heredados
- CI/CD: ✅ GitHub Actions (lint + type-check + test)
- Deploy: 🔲 No configurado (staging Railway/Render pendiente)

## Servicios en docker-compose (todos ✅ RUNNING)

| Contenedor | Imagen | Puerto host | Estado |
|---|---|---|---|
| custodias_postgres | timescale/timescaledb:latest-pg15 | **5432** | ✅ healthy |
| custodias_redis | redis:7-alpine | **6379** | ✅ healthy |
| custodias_bull_board | deadly0/bull-board | **3001** | ✅ up |
| custodias_grafana | grafana/grafana:10.4.2 | **3000** | ✅ up |
| custodias_prometheus | prom/prometheus:v2.52.0 | **9090** | ✅ up |
| custodias_jaeger | jaegertracing/all-in-one:1.57 | **16686** (UI), **4318** (OTLP) | ✅ up |

## URLs locales de desarrollo

```
API (Fastify)   http://localhost:3333    — app Node.js (nativa, no en docker)
Backoffice web  http://localhost:5173    — Vite dev server (nativo)
Mobile Metro    http://localhost:8081    — Expo Metro bundler (nativo)
Bull Board      http://localhost:3001    — Monitor de colas BullMQ
Grafana         http://localhost:3000    — Dashboards de métricas  (admin/admin)
Prometheus      http://localhost:9090    — Scraping de métricas
Jaeger          http://localhost:16686   — Tracing distribuido
PostgreSQL      localhost:5432           — custodias_user / custodias_pass / custodias_dev
Redis           localhost:6379           — sin auth
TimescaleDB     (extensión de postgres)  — versión 2.26.1 ✅ activa
```

## Credenciales de desarrollo (NO usar en producción)

```
PostgreSQL:
  host:     localhost:5432
  user:     custodias_user
  password: custodias_pass
  database: custodias_dev

Redis:
  url:  redis://localhost:6379
  auth: ninguna (dev only)

Grafana:
  url:  http://localhost:3000
  user: admin / admin
```

## Comandos de setup

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar infraestructura (requiere Docker Desktop)
docker compose up -d

# 3. Verificar que postgres y redis están sanos
docker compose ps

# 4. Correr migraciones UBER_BASE (38 heredadas)
pnpm --filter @custodias/api db:migrate

# 5. Correr seeds base
pnpm --filter @custodias/api db:seed

# 6. Levantar apps en desarrollo
pnpm dev
```

> ⚠️ Paso 4 y 5 requieren que las apps/api estén configuradas con el nuevo `@custodias/api` package name.
> Por ahora la API hereda el nombre `@ridebase/api` — se renombrará en INFRA-001.

## Variables de entorno (apps/api/.env)

```bash
NODE_ENV=development
PORT=3333
DATABASE_URL=postgresql://custodias_user:custodias_pass@localhost:5432/custodias_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=custodias-dev-jwt-secret-change-in-production-min-64-chars-xxxxxxxxxxxxx
JWT_REFRESH_SECRET=custodias-dev-refresh-secret-change-in-production-different-from-above-xx
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
OTP_PROVIDER=log
STRIPE_SECRET_KEY=sk_test_replace_with_your_stripe_test_key
VERTICAL_SLUG=custody
TEST_OTP_BYPASS=false
TEST_OTP_CODE=123456
```

> ⚠️ OTP via `log` en dev (mensajes aparecen en consola de la API).
> ⚠️ No hay Google Maps Key — el proyecto usa **Mapbox** (`@rnmapbox/maps`).
> ⚠️ No hay Twilio — OTP via `log` (dev) o Firebase (prod).

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
