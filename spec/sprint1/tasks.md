# Tasks — Sprint 1: Fundamentos

> **Sprint:** 1 de 7
> **Metodología:** SDD (Spec-Driven) + TDD (Test-Driven)
> **Total de tareas:** 8
> **Última actualización:** 2026-04-05

---

## Resumen ejecutivo

| ID | Título | Tipo | Agentes | Depende de | Irreversible | Estado |
|----|--------|------|---------|-----------|--------------|--------|
| INFRA-001 | Inicializar monorepo Turborepo | FEATURE | devops | — | — | 🔲 |
| INFRA-002 | Configurar docker-compose | FEATURE | devops | INFRA-001 | — | 🔲 |
| INFRA-003 | Estructura base apps/api | FEATURE | backend | INFRA-001 | — | 🔲 |
| INFRA-004 | 22 migraciones Knex | MIGRATION | backend, devops | INFRA-002, INFRA-003 | ⚠️ sí | 🔲 |
| INFRA-005 | Seeds iniciales | FEATURE | backend | INFRA-004 | ⚠️ sí | 🔲 |
| INFRA-006 | Setup Jest + Testcontainers | FEATURE | backend, qa | INFRA-003 | — | 🔲 |
| INFRA-007 | Setup Playwright | FEATURE | qa | INFRA-003 | — | 🔲 |
| INFRA-008 | GitHub Actions CI | FEATURE | devops | INFRA-006, INFRA-007 | — | 🔲 |

**Leyenda:** ✅ Completo · 🔄 En progreso · ⚠️ Bloqueado · 🔲 No iniciado

---

## Grafo de dependencias

```
INFRA-001
    ├──────────────────────────────┐
    ▼                              ▼
INFRA-002                     INFRA-003
    │                          │       │
    └──────────┬───────────────┘       │
               ▼                       ▼
           INFRA-004              INFRA-006 ──┐
               │                  INFRA-007 ──┼──▶ INFRA-008
               ▼                              │
           INFRA-005                          │
```

---

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|-------|--------|-------------------|
| **Grupo 1** | INFRA-001 | Inmediato — sin dependencias |
| **Grupo 2** | INFRA-002, INFRA-003 | INFRA-001 completado |
| **Grupo 3** | INFRA-004, INFRA-006, INFRA-007 | INFRA-002 + INFRA-003 completados (INFRA-004 necesita ambos; INFRA-006/007 solo necesitan INFRA-003) |
| **Grupo 4** | INFRA-005 | INFRA-004 completado |
| **Grupo 5** | INFRA-008 | INFRA-006 + INFRA-007 completados |

---

## Tareas detalladas

---

### INFRA-001 — Inicializar monorepo Turborepo

**Tipo:** FEATURE · **Agente:** devops · **Sprint:** 1
**Depende de:** ninguna · **Irreversible:** no

#### Descripción
Crear la estructura base del monorepo con Turborepo y pnpm workspaces. Establece la organización de directorios que usarán todos los sprints siguientes. Solo estructura y configuración — sin código de negocio.

#### Scope incluye
- `package.json` raíz con `"workspaces": ["apps/*", "packages/*"]`
- `pnpm-workspace.yaml`
- `turbo.json` con pipelines: `build`, `lint`, `test`, `type-check`
- `.nvmrc` con `20` (Node.js 20 LTS)
- `.npmrc` con `shamefully-hoist=false` (pnpm estricto)
- `tsconfig.base.json` compartido con `strict: true`
- Scaffolding vacío de cada workspace:
  - `apps/api/package.json` + `tsconfig.json` extendiendo base
  - `apps/web/package.json` + `tsconfig.json` extendiendo base
  - `apps/mobile/package.json` + `tsconfig.json` extendiendo base
  - `packages/shared-types/package.json` + `tsconfig.json` + `src/index.ts`
- `.eslintrc.base.js` con reglas base TypeScript
- `.prettierrc` con configuración de formato

#### Scope excluye
- Código fuente en apps (eso es INFRA-003)
- Variables de entorno
- Configuración de CI
- Instalación de dependencias de producción (solo devDependencies de tooling)

#### Criterios de aceptación

**Negocio:**
- [ ] Un desarrollador puede clonar el repo y ejecutar `pnpm install` exitosamente

**Técnicos:**
- [ ] `turbo run build` completa sin errores (con apps vacías)
- [ ] `turbo run lint` completa sin errores
- [ ] `packages/shared-types` es importable desde `apps/api` con resolución correcta de tipos
- [ ] TypeScript strict habilitado en todos los workspaces (`strict: true` en tsconfig.base.json)
- [ ] `node --version` en `.nvmrc` es `20`

#### TDD — Tests asociados
> Sprint 1 no escribe tests para tooling. La verificación es funcional (los comandos pasan).

#### SDD — Referencias de diseño
- `spec/sprint1/design.md` § 2 (estructura de directorios)
- ADR-011 (pnpm como gestor de paquetes)

---

### INFRA-002 — Configurar docker-compose con todos los servicios

**Tipo:** FEATURE · **Agente:** devops · **Sprint:** 1
**Depende de:** INFRA-001 · **Irreversible:** no

#### Descripción
Definir el entorno de desarrollo local completo usando Docker Compose. Todos los servicios de infraestructura que la aplicación necesita deben estar disponibles con un solo comando.

#### Scope incluye
- `docker-compose.yml` con servicios:
  - `postgres`: `timescale/timescaledb:latest-pg15`, healthcheck, volumen persistente
  - `redis`: `redis:7-alpine`, healthcheck, volumen persistente
  - `bull-board`: UI de monitoreo de colas BullMQ (:3001)
  - `prometheus`: configurado con `prometheus.yml` (:9090)
  - `grafana`: con datasource Prometheus preconfigurado (:3000)
  - `jaeger`: all-in-one para trazas OTLP (:16686 UI, :4318 OTLP)
- `docker-compose.override.yml` (en `.gitignore`) para overrides personales
- `infra/prometheus.yml` — configuración de scraping
- `infra/grafana/datasources.yml` — datasource automático para Prometheus
- `scripts/dev-up.sh` — wrapper con validación de prerequisites
- `scripts/dev-down.sh` — limpieza completa incluido volúmenes

#### Scope excluye
- Dockerfile de la API (eso es Sprint de deploy)
- Configuración de Railway/Render
- Secrets o passwords de producción
- Configuración de SSL/TLS local

#### Criterios de aceptación

**Negocio:**
- [ ] Un desarrollador nuevo puede tener el entorno corriendo en < 5 minutos

**Técnicos:**
- [ ] `docker compose up -d` completa sin errores
- [ ] `docker compose ps` muestra todos los servicios como `healthy`
- [ ] Conectar a Postgres: `psql -h localhost -U uber uber_dev` funciona
- [ ] Conectar a Redis: `redis-cli ping` retorna `PONG`
- [ ] Bull Board accesible en `http://localhost:3001`
- [ ] Grafana accesible en `http://localhost:3000` (admin/admin)
- [ ] Jaeger UI accesible en `http://localhost:16686`
- [ ] `docker compose down -v` limpia todos los volúmenes sin error

#### TDD — Tests asociados
> Verificación funcional. No hay tests unitarios para docker-compose.

#### SDD — Referencias de diseño
- `spec/sprint1/design.md` § 1 (arquitectura de servicios locales)
- `spec/sprint1/design.md` § 4 (diseño del docker-compose)
- `docs/12_environment_setup.md` (debe actualizarse con los puertos)

---

### INFRA-003 — Estructura base de apps/api

**Tipo:** FEATURE · **Agente:** backend · **Sprint:** 1
**Depende de:** INFRA-001 · **Irreversible:** no

#### Descripción
Implementar el esqueleto de `apps/api` con Fastify, configuración validada con Zod, conexiones a Postgres y Redis, clases de error compartidas, middleware base y el endpoint de health check. Este es el cimiento sobre el que se construyen todos los módulos de negocio.

#### Scope incluye
- `src/config/environment.ts` — schema Zod + `env` exportado y tipado
- `src/config/database.ts` — Knex con pool configurado, tipado con generics
- `src/config/redis.ts` — ioredis con reconnect automático
- `src/shared/errors/business-error.ts` — clase + catálogo de códigos (ver `steering/business-rules.md`)
- `src/shared/errors/technical-error.ts` — clase para errores de infraestructura
- `src/shared/middleware/authenticate.ts` — verifica JWT, adjunta `user` al request context
- `src/shared/middleware/authorize.ts` — verifica roles, lanza `BusinessError` si no autorizado
- `src/shared/middleware/request-logger.ts` — log estructurado por request (método, path, statusCode, ms)
- `src/app.ts` — Fastify + plugins + error handler global + `GET /health`
- `src/main.ts` — arranque con graceful shutdown (SIGTERM + SIGINT)
- `.env.example` con todas las variables documentadas
- `knexfile.ts` con configuración por ambiente (development, test, production)

#### Scope excluye
- Rutas de negocio (auth, trips, drivers, etc.)
- Migraciones y seeds
- Tests de integración (eso es INFRA-006)
- Lógica de autenticación completa (JWT signing/verification completo es Sprint 2)

#### Criterios de aceptación

**Negocio:**
- [ ] `GET /health` retorna 200 con `{ status: "ok", services: { database: "connected", redis: "connected" } }`

**Técnicos:**
- [ ] `tsc --noEmit` sin errores (strict mode)
- [ ] Si falta `DATABASE_URL`, proceso no arranca y muestra: `❌ Missing required env var: DATABASE_URL`
- [ ] Si falta `JWT_SECRET` o tiene < 32 chars, proceso no arranca con mensaje descriptivo
- [ ] `GET /health` retorna 503 si Postgres o Redis no están disponibles
- [ ] Graceful shutdown: tras SIGTERM, el servidor deja de aceptar conexiones, espera requests activos (max 10s), cierra Knex y Redis
- [ ] Logs en formato JSON (producción) o pretty (development) según `NODE_ENV`
- [ ] Cero usos de `any` en TypeScript (`eslint: @typescript-eslint/no-explicit-any: error`)

#### TDD — Tests a escribir en Sprint 2+
```typescript
// __tests__/health.integration.test.ts
describe('GET /health')
  ✓ returns 200 when DB and Redis are connected
  ✓ returns 503 when DB is unavailable
  ✓ returns 503 when Redis is unavailable
  ✓ response includes version and timestamp

// __tests__/environment.unit.test.ts
describe('environment validation')
  ✓ throws descriptive error when DATABASE_URL is missing
  ✓ throws descriptive error when JWT_SECRET is too short
  ✓ parses PORT as number (not string)
  ✓ defaults TEST_MODE to false when not set
```

#### SDD — Referencias de diseño
- `spec/sprint1/design.md` § 2 (estructura de directorios)
- `spec/sprint1/design.md` § 3.1 (environment.ts)
- `spec/sprint1/design.md` § 3.2 (BusinessError)
- `spec/sprint1/design.md` § 3.3 (app.ts plugins)
- `spec/sprint1/design.md` § 8 (endpoint /health)
- `spec/sprint1/design.md` § 9 (variables de entorno)
- ADR-012 (Zod para validación de env vars)
- `steering/business-rules.md` § Catálogo de BusinessErrors

---

### INFRA-004 — 22 migraciones Knex en orden de dependencias FK

**Tipo:** MIGRATION · **Agentes:** backend (escribe), devops (ejecuta) · **Sprint:** 1
**Depende de:** INFRA-002, INFRA-003 · **Irreversible:** ⚠️ SÍ

> ⚠️ **OPERACIÓN IRREVERSIBLE:** `knex migrate:latest` en producción modifica el schema de la base de datos. Requiere aprobación explícita antes de ejecutar en cualquier ambiente no local.

#### Descripción
Crear las 22 migraciones Knex que definen el schema completo de la base de datos. Cada migración tiene `up()` y `down()` completos. El orden respeta las dependencias de foreign keys. La migración 015 activa la extensión TimescaleDB en `trip_locations`.

#### Lista de migraciones (orden exacto)

| # | Archivo | Tabla | Deps FK |
|---|---------|-------|---------|
| 001 | `_create_region_config` | region_config | — |
| 002 | `_create_users` | users | region_config |
| 003 | `_create_user_roles` | user_roles | users |
| 004 | `_create_user_auth` | user_auth | users |
| 005 | `_create_drivers` | drivers | users, region_config |
| 006 | `_create_document_requirements` | document_requirements | region_config |
| 007 | `_create_driver_documents` | driver_documents | drivers, document_requirements |
| 008 | `_create_vehicles` | vehicles | drivers |
| 009 | `_create_trip_types` | trip_types | region_config |
| 010 | `_create_pricing_factors` | pricing_factors | region_config |
| 011 | `_create_pricing_factor_rules` | pricing_factor_rules | pricing_factors |
| 012 | `_create_commission_rules` | commission_rules | region_config |
| 013 | `_create_trips` | trips | users(×2), drivers, trip_types, region_config |
| 014 | `_create_trip_status_history` | trip_status_history | trips |
| 015 | `_create_trip_locations` | trip_locations [HYPERTABLE] | trips, drivers |
| 016 | `_create_scheduled_trips` | scheduled_trips | trips |
| 017 | `_create_payments` | payments | trips, users(×2) |
| 018 | `_create_passenger_payment_methods` | passenger_payment_methods | users |
| 019 | `_create_trip_applied_factors` | trip_applied_factors | trips, pricing_factors |
| 020 | `_create_ratings` | ratings | trips, users(×2) |
| 021 | `_create_audit_logs` | audit_logs | users |
| 022 | `_create_system_error_logs` | system_error_logs | — |

#### Scope incluye
- Todos los campos según `docs/10_data_dictionary.md`
- PKs como UUID con `gen_random_uuid()` (R-DATA-004)
- Timestamps como TIMESTAMPTZ (R-DATA-005)
- `deleted_at TIMESTAMPTZ NULL` en entidades de negocio (R-DATA-001)
- Índices en FKs y columnas de búsqueda frecuente
- Constraints: UNIQUE donde aplique, CHECK constraints para enums
- `down()` completo en cada migración
- Migración 015: hypertable + política de retención 90 días (R-DATA-003)

#### Scope excluye
- Triggers de base de datos (solo índices y constraints en Sprint 1)
- Stored procedures
- Datos (eso es INFRA-005)
- Cambios al schema después de este sprint (nuevas migraciones en sprints siguientes)

#### Criterios de aceptación

**Negocio:**
- [ ] Todos los módulos de negocio de Sprint 2+ pueden iniciar implementación sin necesitar nuevas tablas base

**Técnicos:**
- [ ] `knex migrate:latest` ejecuta las 22 migraciones sin errores
- [ ] `knex migrate:rollback --all` revierte todas sin errores
- [ ] `knex migrate:latest` después de `rollback --all` vuelve al mismo estado (idempotente en secuencia)
- [ ] `\dt` en psql muestra las 22 tablas
- [ ] `SELECT * FROM timescaledb_information.hypertables` muestra `trip_locations`
- [ ] Insertar en `user_roles` con `user_id` inexistente lanza FK violation (constraints activos)
- [ ] Cero warnings de FK al correr en orden

#### TDD — Verificación
```bash
# Script de verificación post-migración:
knex migrate:latest
psql $DATABASE_URL -c "\dt" | grep -c "table"  # debe retornar 22
psql $DATABASE_URL -c "SELECT count(*) FROM timescaledb_information.hypertables"  # debe retornar 1
knex migrate:rollback --all
psql $DATABASE_URL -c "\dt" | grep -c "table"  # debe retornar 0
```

#### SDD — Referencias de diseño
- `spec/sprint1/design.md` § 3.4 (convención de migraciones)
- `spec/sprint1/design.md` § 3.5 (orden y dependencias FK)
- `spec/sprint1/design.md` § 3.6 (hypertable TimescaleDB)
- `docs/10_data_dictionary.md` — schema completo de cada tabla
- `steering/business-rules.md` R-DATA-001 a R-DATA-005

---

### INFRA-005 — Seeds iniciales

**Tipo:** FEATURE · **Agente:** backend · **Sprint:** 1
**Depende de:** INFRA-004 · **Irreversible:** ⚠️ SÍ

> ⚠️ **OPERACIÓN IRREVERSIBLE:** Los seeds insertan datos de configuración base. En producción, ejecutar dos veces sin idempotencia duplicaría registros críticos. Revisar que todos los seeds usen `onConflict().ignore()` antes de ejecutar.

#### Descripción
Insertar los datos de configuración base que permiten que la aplicación funcione desde el primer arranque. Sin estos datos, la API no puede calcular tarifas ni crear viajes.

#### Seeds a crear

**01_region_config.ts**
```typescript
{
  country_code: 'MX',
  region_name: 'México',
  currency: 'MXN',
  tax_rate: 0.1600,          // IVA 16%
  timezone: 'America/Mexico_City',
  phone_prefix: '+52',
  active: true
}
```

**02_trip_types.ts** (3 registros)
```typescript
[
  { code: 'basic',   name: 'UberX',       base_fare: 25.00, cost_per_km: 8.50,  cost_per_minute: 1.50, min_fare: 35.00 },
  { code: 'plus',    name: 'UberX Plus',  base_fare: 35.00, cost_per_km: 12.00, cost_per_minute: 2.00, min_fare: 50.00 },
  { code: 'premium', name: 'Uber Black',  base_fare: 60.00, cost_per_km: 18.00, cost_per_minute: 3.00, min_fare: 80.00 },
]
// Nota: tarifas en MXN, definitivas antes de Sprint 4
```

**03_pricing_factors.ts** (factores desactivados por defecto)
```typescript
[
  { code: 'night',        name: 'Tarifa nocturna',   type: 'percentage',   value: 0.20, stackable: true,  active: false },
  { code: 'rain',         name: 'Tarifa lluvia',     type: 'multiplier',   value: 1.30, stackable: false, active: false },
  { code: 'peak_hour',    name: 'Hora pico',         type: 'multiplier',   value: 1.50, stackable: false, active: false },
  { code: 'high_demand',  name: 'Alta demanda',      type: 'multiplier',   value: 2.00, stackable: false, active: false },
]
```

**04_admin_user.ts**
```typescript
// Usuario admin para acceso inicial al panel
{
  phone: '+525500000001',     // teléfono de prueba — NO usar en producción
  full_name: 'Admin UBER_BASE',
  status: 'active',
  phone_verified: true,
  role: 'admin'
}
```

#### Scope incluye
- Los 4 archivos de seed descritos arriba
- Todos los seeds usan `onConflict('campo_único').ignore()` para idempotencia
- Documentación en cada seed explicando los valores y cómo cambiarlos

#### Scope excluye
- Datos de conductores de prueba
- Datos de pasajeros
- Viajes de ejemplo
- Factores de comisión (se definen antes de Sprint 4)

#### Criterios de aceptación

**Negocio:**
- [ ] `knex seed:run` popula las tablas sin errores
- [ ] La API puede calcular una tarifa básica tras ejecutar los seeds
- [ ] El usuario admin puede hacer login en Sprint 2 sin configuración adicional

**Técnicos:**
- [ ] `knex seed:run` ejecutado dos veces no crea duplicados
- [ ] `SELECT count(*) FROM region_config` = 1
- [ ] `SELECT count(*) FROM trip_types` = 3
- [ ] `SELECT count(*) FROM pricing_factors` = 4 (todos con `active = false`)
- [ ] `SELECT count(*) FROM users WHERE status = 'active'` ≥ 1 (admin)

#### SDD — Referencias de diseño
- `docs/10_data_dictionary.md` — campos y tipos de cada tabla
- `steering/business-rules.md` R-PRICE-001, R-PRICE-003 (fórmula de precios)
- `spec/sprint1/requirements.md` RF-005

---

### INFRA-006 — Setup Jest + Supertest + Testcontainers

**Tipo:** FEATURE · **Agentes:** backend, qa · **Sprint:** 1
**Depende de:** INFRA-003 · **Irreversible:** no

#### Descripción
Configurar el framework de testing completo para `apps/api`. El objetivo es que cualquier developer pueda escribir tests de integración con BD real sin instalar nada más allá de Docker y Node.js.

#### Scope incluye
- `jest.config.ts` con:
  - Paths de módulos (aliases como `@/config`, `@/shared`)
  - Coverage thresholds por módulo (ver `spec/sprint1/design.md` § 7)
  - Directorio de coverage: `coverage/`
  - Timeout global: 30s (Testcontainers necesita más que el default de 5s)
  - Setup file: `jest.setup.ts`
- `jest.setup.ts`:
  - Extiende matchers si es necesario
  - Configura `dotenv` para tests (`.env.test`)
- `src/shared/test/containers.ts`:
  - `startTestContainers()` — levanta Postgres 15 + Redis 7
  - `stopTestContainers()` — cleanup
  - Exporta conexiones listas para usar
- `src/shared/test/app-factory.ts`:
  - `buildTestApp()` — instancia de Fastify sin puerto, lista para `inject()`
- `.env.test` (en `.gitignore`) — variables de entorno para tests
- Scripts en `package.json`:
  - `"test": "jest"`
  - `"test:coverage": "jest --coverage"`
  - `"test:watch": "jest --watch"`
  - `"agent:verify:quick": "tsc --noEmit && jest --passWithNoTests"`
- `@types/jest` y configuración de tipos

#### Scope excluye
- Tests de módulos de negocio (se escriben en cada sprint)
- Playwright (eso es INFRA-007)
- Fixtures de datos específicos por módulo (cada sprint define los suyos)

#### Criterios de aceptación

**Negocio:**
- [ ] QA puede correr tests con BD real sin setup manual adicional

**Técnicos:**
- [ ] `pnpm test` completa sin error (0 tests, suite válida)
- [ ] `pnpm test:coverage` genera reporte HTML en `coverage/`
- [ ] `pnpm agent:verify:quick` pasa (type-check + tests)
- [ ] Testcontainers levanta Postgres 15 en < 30s
- [ ] Testcontainers levanta Redis 7 en < 15s
- [ ] Los containers se limpian automáticamente al terminar los tests (no quedan containers huérfanos)
- [ ] Los thresholds de coverage están configurados y fallan si no se cumplen

#### TDD — Test de verificación del setup
```typescript
// src/shared/test/__tests__/containers.test.ts
describe('Testcontainers setup')
  ✓ can start Postgres 15 container
  ✓ can execute query against started container
  ✓ can start Redis 7 container
  ✓ can execute PING against started Redis
  ✓ containers are stopped after test suite
```

#### SDD — Referencias de diseño
- `spec/sprint1/design.md` § 5 (CI pipeline)
- `spec/sprint1/design.md` § 7 (umbrales de cobertura)
- ADR-013 (Testcontainers sobre mocks)
- `steering/testing-standards.md`

---

### INFRA-007 — Setup Playwright

**Tipo:** FEATURE · **Agente:** qa · **Sprint:** 1
**Depende de:** INFRA-003 · **Irreversible:** no

#### Descripción
Configurar la infraestructura de tests E2E con Playwright. No se escriben specs de negocio todavía — solo la configuración y fixtures base que se usarán en Sprint 6.

#### Scope incluye
- `playwright.config.ts`:
  - `baseURL: process.env.APP_URL` (por defecto `http://localhost:3333`)
  - Browsers: chromium (y webkit como secundario)
  - Retries: 2 en CI, 0 en local
  - Reporter: `html` en CI, `list` en local
  - Timeout: 30s por test
- `tests/e2e/fixtures/base.ts`:
  - Fixture `authenticatedPage` — crea usuario de prueba, hace login, adjunta cookie/token al contexto
  - Fixture `apiContext` — `APIRequestContext` para setup/teardown directo contra la API
- `tests/e2e/helpers/api.ts`:
  - `createTestUser(role)` — crea usuario de prueba vía API
  - `cleanupTestUser(id)` — limpia usuario tras test
- Scripts:
  - `"test:e2e": "playwright test"`
  - `"test:e2e:ui": "playwright test --ui"` (modo visual local)
- `playwright install` documentado en `docs/12_environment_setup.md`

#### Scope excluye
- Specs de flujos de negocio (happy path, cancelaciones, admin) — eso es Sprint 6
- Tests de mobile nativo (Playwright no aplica a React Native)
- Configuración de visual regression testing

#### Criterios de aceptación

**Negocio:**
- [ ] QA puede escribir specs E2E en Sprint 6 sin configuración adicional

**Técnicos:**
- [ ] `pnpm test:e2e` completa sin error (0 specs)
- [ ] `playwright.config.ts` apunta a `APP_URL` configurable por env
- [ ] Fixture `authenticatedPage` exportado y tipado correctamente
- [ ] `pnpm playwright install` documentado en `docs/12_environment_setup.md`

#### TDD — Sin tests en Sprint 1
> Los tests E2E se escriben en Sprint 6. Este sprint solo establece la infraestructura.

#### SDD — Referencias de diseño
- `spec/sprint1/requirements.md` RF-007
- `docs/PLAN_TDD_SDD.md` § 4 (Test Specs E2E)

---

### INFRA-008 — GitHub Actions CI

**Tipo:** FEATURE · **Agente:** devops · **Sprint:** 1
**Depende de:** INFRA-006, INFRA-007 · **Irreversible:** no

#### Descripción
Configurar el pipeline de CI que valida automáticamente la calidad del código en cada Pull Request. Ningún PR debe poder mergearse si lint, type-check o tests fallan.

#### Scope incluye
- `.github/workflows/ci.yml` con jobs:
  - `lint` — `pnpm lint` en todos los workspaces
  - `type-check` — `tsc --noEmit` en todos los workspaces
  - `test` — `pnpm test:coverage` (con Testcontainers, requiere Docker en el runner)
- Protección de la rama `main`:
  - Status checks requeridos: `lint`, `type-check`, `test`
  - PRs requieren review antes de merge
- Cache de pnpm store por hash de `pnpm-lock.yaml`
- Turbo cache para builds incrementales
- Variables de entorno de test en GitHub Secrets
- Badge de CI en el README

#### Scope excluye
- Pipeline de CD (deploy automático) — eso va en el sprint de deploy
- Environments de staging/production en GitHub
- Secrets de producción (Stripe, Twilio, FCM)
- Notificaciones de Slack/email

#### Criterios de aceptación

**Negocio:**
- [ ] Ningún código roto puede llegar a `main` sin ser detectado automáticamente

**Técnicos:**
- [ ] Push a `main` dispara el pipeline
- [ ] PR no puede mergearse si algún job falla
- [ ] Pipeline verde en rama `main` tras el setup inicial
- [ ] `lint` falla ante warning de ESLint con `error` level
- [ ] `type-check` falla ante cualquier error TypeScript
- [ ] `test` falla si coverage global cae por debajo de 75%
- [ ] Cache de pnpm restaurado entre runs (los logs muestran "restored from cache")
- [ ] Tiempo total del pipeline < 5 minutos en condiciones normales

#### TDD — Sin tests unitarios
> La verificación es funcional: el pipeline corre y falla correctamente.

**Verificación manual:**
```bash
# 1. Introducir error TypeScript intencional
# 2. Push a una rama de test
# 3. Verificar que el job type-check falla con el error correcto
# 4. Revertir y verificar que pasa
```

#### SDD — Referencias de diseño
- `spec/sprint1/design.md` § 5 (diseño del pipeline CI)
- `spec/sprint1/requirements.md` RF-008, RNF-005

---

## Definition of Done — Sprint 1

Un sprint se considera **COMPLETO** cuando:

```
[ ] INFRA-001: turbo run build y lint pasan
[ ] INFRA-002: docker compose ps muestra todos los servicios como healthy
[ ] INFRA-003: GET /health retorna 200, tsc sin errores
[ ] INFRA-004: knex migrate:latest y rollback --all sin errores, 22 tablas en BD
[ ] INFRA-005: knex seed:run idempotente, datos base verificados
[ ] INFRA-006: pnpm test pasa (0 tests), pnpm agent:verify:quick pasa
[ ] INFRA-007: pnpm test:e2e pasa (0 specs), playwright configurado
[ ] INFRA-008: CI verde en main, PR bloqueado si falla algún job
[ ] docs/06_memory.md actualizado con estado de Infraestructura: ✅
[ ] context/snapshots/infra.snapshot.md actualizado
[ ] Commit: chore(infra): sprint 1 complete — monorepo + docker + api base + migrations
```

---

## Notas para el equipo de agentes

### Backend agent
- Leer `docs/10_data_dictionary.md` completo antes de escribir las migraciones
- Seguir skill `creating-knex-migration` para naming y estructura de cada archivo
- La migración 015 (trip_locations) requiere sintaxis especial de TimescaleDB — ver `spec/sprint1/design.md` § 3.6
- Los seeds usan `onConflict().ignore()` — no `INSERT OR REPLACE`

### DevOps agent
- El docker-compose debe tener healthchecks en TODOS los servicios, no solo en Postgres
- El pipeline CI usa Testcontainers — NO configurar `services:` de GitHub Actions para Postgres/Redis (Testcontainers los maneja)
- Turbo cache requiere `TURBO_TOKEN` en GitHub Secrets si se usa Turbo Remote Cache

### QA agent
- Los umbrales de cobertura en `jest.config.ts` deben coincidir exactamente con los de `spec/sprint1/design.md` § 7
- Testcontainers requiere Docker Socket disponible — verificar permisos en el runner de CI
