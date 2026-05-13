# Design — Sprint 1: Fundamentos

> **Sprint:** 1 de 7
> **Patrón de diseño:** Monolito modular (ADR-001)
> **Última actualización:** 2026-04-05

---

## 1. Arquitectura del sistema (visión Sprint 1)

Al finalizar Sprint 1, la arquitectura local queda así:

```
┌─────────────────────────────────────────────────────────────┐
│                    MONOREPO (Turborepo)                      │
│                                                             │
│  apps/api          apps/web        apps/mobile              │
│  (Fastify 4)       (Next.js 14)    (React Native 0.73)      │
│       │            [skeleton]       [skeleton]               │
│       │                                                      │
│  packages/shared-types                                       │
│  (tipos compartidos entre apps)                              │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                  SERVICIOS LOCALES (Docker)                  │
│                                                             │
│  PostgreSQL 15 + TimescaleDB  (:5432)                       │
│  Redis 7                      (:6379)                       │
│  Bull Board                   (:3001)                       │
│  Prometheus                   (:9090)                       │
│  Grafana                      (:3000)                       │
│  Jaeger                       (:16686)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Estructura de directorios — apps/api

```
apps/api/
├── src/
│   ├── config/
│   │   ├── environment.ts     ← Validación Zod de env vars (fail-fast al arrancar)
│   │   ├── database.ts        ← Cliente Knex tipado + connection pool
│   │   └── redis.ts           ← Cliente ioredis + reconnect automático
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── business-error.ts    ← extends Error, código + statusCode HTTP
│   │   │   └── technical-error.ts   ← errores de infra (BD caída, timeout, etc.)
│   │   ├── middleware/
│   │   │   ├── authenticate.ts      ← verifica JWT, adjunta user al request
│   │   │   ├── authorize.ts         ← verifica roles requeridos
│   │   │   └── request-logger.ts    ← Pino structured logging por request
│   │   └── test/
│   │       ├── containers.ts        ← helpers Testcontainers (Postgres + Redis)
│   │       └── app-factory.ts       ← instancia Fastify para tests de integración
│   ├── app.ts                 ← Fastify instance + plugins + routes base
│   └── main.ts                ← bootstrap, graceful shutdown
├── migrations/
│   ├── 20240101000001_create_region_config.ts
│   ├── 20240101000002_create_users.ts
│   ├── ... (22 migraciones)
│   └── 20240101000022_create_system_error_logs.ts
├── seeds/
│   ├── 01_region_config.ts
│   ├── 02_trip_types.ts
│   ├── 03_pricing_factors.ts
│   └── 04_admin_user.ts
├── __tests__/                 ← vacío en Sprint 1, listo para Sprint 2+
├── jest.config.ts
├── jest.setup.ts
├── knexfile.ts
├── tsconfig.json
└── package.json
```

---

## 3. Diseño de componentes clave

### 3.1 environment.ts — Validación de configuración

```typescript
// Patrón: fail-fast con mensaje descriptivo
// Si falta una variable → proceso no arranca

import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // Test mode — OTP fijo para tests
  TEST_MODE: z.coerce.boolean().default(false),
})

export type Env = z.infer<typeof envSchema>

// Se invoca al inicio de main.ts — proceso muere si falla
export const env = envSchema.parse(process.env)
```

**¿Por qué no `process.env.X` directo?**
Typos silenciosos (`process.env.DATABSE_URL` retorna `undefined`, Knex falla con error críptico).
Con Zod: `Missing required env var: DATABASE_URL` al arrancar.

---

### 3.2 BusinessError — Diseño de errores tipados

```typescript
// Catálogo de códigos definido en steering/business-rules.md
export type BusinessErrorCode =
  | 'PASSENGER_HAS_ACTIVE_TRIP'
  | 'DRIVER_HAS_ACTIVE_TRIP'
  | 'INVALID_TRIP_TRANSITION'
  | 'TRIP_NOT_FOUND'
  | 'PHONE_ALREADY_REGISTERED'
  | 'PHONE_BANNED'
  | 'USER_NOT_FOUND'
  | 'USER_SUSPENDED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'DRIVER_NOT_APPROVED'
  | 'DOCUMENTS_EXPIRED'
  | 'DRIVER_NOT_FOUND'
  | 'PAYMENT_NOT_FOUND'
  | 'PAYMENT_ALREADY_PROCESSED'
  | 'FARE_BELOW_MINIMUM'

export class BusinessError extends Error {
  constructor(
    public readonly code: BusinessErrorCode,
    public readonly statusCode: number,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'BusinessError'
  }
}

// TechnicalError para errores de infraestructura
export class TechnicalError extends Error {
  constructor(
    public readonly cause: Error,
    message?: string,
  ) {
    super(message ?? 'Internal server error')
    this.name = 'TechnicalError'
  }
}
```

---

### 3.3 app.ts — Fastify con plugins

```typescript
// Plugins a registrar en orden:
// 1. @fastify/helmet       ← headers de seguridad
// 2. @fastify/cors         ← CORS configurable por env
// 3. @fastify/sensible     ← httpErrors helpers + reply decorators
// 4. @fastify/rate-limit   ← rate limiting global (100 req/min default)
// 5. pino logger           ← JSON en producción, pretty en dev
// 6. Error handler global  ← convierte BusinessError a respuesta HTTP estructurada
// 7. GET /health           ← verifica DB + Redis

// Formato de respuesta de errores (consistente en toda la API):
// {
//   "error": {
//     "code": "PASSENGER_HAS_ACTIVE_TRIP",
//     "message": "El pasajero ya tiene un viaje activo",
//     "statusCode": 409
//   }
// }
```

---

### 3.4 Diseño de migraciones Knex

**Convención de nombres:**
```
{timestamp}_{acción}_{tabla}.ts
Ej: 20240101000001_create_region_config.ts
```

**Estructura de cada migración:**
```typescript
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('region_config', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    table.specificType('country_code', 'CHAR(2)').notNullable()
    // ...campos...
    table.timestamps(true, true) // created_at, updated_at con defaults
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('region_config')
}
```

**Regla de oro:** Todo `up()` tiene un `down()` que lo deshace completamente.

---

### 3.5 Orden de migraciones y dependencias FK

```
region_config (sin deps)
    └── users (region_id → region_config)
            ├── user_roles (user_id → users)
            └── user_auth (user_id → users)
    └── drivers (user_id → users, region_id → region_config)
            ├── document_requirements (region_id → region_config)
            ├── driver_documents (driver_id → drivers, requirement_id → document_requirements)
            └── vehicles (driver_id → drivers)
    └── trip_types (region_id → region_config)
            └── pricing_factors (region_id → region_config)
                    └── pricing_factor_rules (factor_id → pricing_factors)
            └── commission_rules (region_id → region_config)
    └── trips (passenger_id → users, driver_id → drivers, trip_type_id → trip_types)
            ├── trip_status_history (trip_id → trips)
            ├── trip_locations [HYPERTABLE] (trip_id → trips)  ← TimescaleDB
            ├── scheduled_trips (trip_id → trips)
            ├── payments (trip_id → trips, passenger_id → users, driver_id → drivers)
            ├── passenger_payment_methods (passenger_id → users)
            ├── trip_applied_factors (trip_id → trips, factor_id → pricing_factors)
            └── ratings (trip_id → trips, rater_id → users, rated_id → users)
    └── audit_logs (entity_id → any, changed_by → users)
    └── system_error_logs (sin deps fuertes)
```

---

### 3.6 Diseño del hypertable TimescaleDB (migración 015)

```typescript
// La migración 015 requiere pasos especiales:
// 1. Crear la tabla normal
// 2. Activar TimescaleDB extension (si no está activada)
// 3. Convertir en hypertable por la columna de tiempo

export async function up(knex: Knex): Promise<void> {
  // Paso 1: tabla normal
  await knex.schema.createTable('trip_locations', (table) => {
    table.uuid('id').defaultTo(knex.raw('gen_random_uuid()'))
    table.uuid('trip_id').notNullable().references('id').inTable('trips')
    table.uuid('driver_id').notNullable().references('id').inTable('drivers')
    table.decimal('latitude', 10, 8).notNullable()
    table.decimal('longitude', 11, 8).notNullable()
    table.decimal('speed_kmh', 5, 2)
    table.decimal('heading_degrees', 5, 2)
    table.timestamp('recorded_at', { useTz: true }).notNullable()
    table.primary(['id', 'recorded_at']) // PK compuesta requerida por TimescaleDB
  })

  // Paso 2: convertir en hypertable (particiona por recorded_at)
  await knex.raw(`
    SELECT create_hypertable('trip_locations', 'recorded_at',
      chunk_time_interval => INTERVAL '1 day'
    )
  `)

  // Paso 3: política de retención automática (90 días — R-DATA-003)
  await knex.raw(`
    SELECT add_retention_policy('trip_locations', INTERVAL '90 days')
  `)
}
```

---

## 4. Diseño del docker-compose

```yaml
# Principios de diseño:
# 1. Todos los servicios con healthcheck — el API no arranca hasta que BD esté ready
# 2. Volúmenes con nombre explícito — fácil de limpiar con docker volume rm
# 3. Variables de entorno mínimas — no exponer passwords en logs
# 4. Red interna — los servicios se llaman por nombre (postgres, redis)

services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  # Observabilidad
  prometheus:   # métricas — puerto 9090
  grafana:      # dashboards — puerto 3000, datasource preconfigurado
  jaeger:       # trazas — puerto 16686 UI, 4318 OTLP
  bull-board:   # monitor de colas BullMQ — puerto 3001
```

---

## 5. Diseño del pipeline CI (GitHub Actions)

```yaml
# .github/workflows/ci.yml
# Jobs en paralelo donde sea posible:

jobs:
  lint:           # pnpm lint — ESLint + Prettier check
  type-check:     # tsc --noEmit en todos los workspaces
  test:
    # Usa Testcontainers — necesita Docker disponible en el runner
    # GitHub Actions ubuntu-latest tiene Docker preinstalado
    services: {}  # Sin services de GH Actions — Testcontainers los gestiona
    steps:
      - pnpm test:coverage
      # Falla si coverage < thresholds definidos en jest.config.ts

# Cache strategy:
#   - pnpm store cacheado por hash de pnpm-lock.yaml
#   - node_modules de cada app cacheados separadamente
#   - turbo cache para builds incrementales
```

---

## 6. ADRs generadas en Sprint 1

### ADR-011 — pnpm como gestor de paquetes del monorepo

**Fecha:** Sprint 1 · **Estado:** Aceptado · **Área:** Monorepo / tooling

**Contexto:**
Turborepo funciona con npm, yarn y pnpm. La elección afecta el tamaño de `node_modules`, la velocidad de instalación y el funcionamiento de workspace links.

**Opciones consideradas:**

| Opción | Pros | Contras |
|--------|------|---------|
| npm workspaces | Sin configuración extra | Lento, `node_modules` gigante, hoisting impredecible |
| yarn workspaces | Maduro | Dos versiones (classic/berry) con comportamientos distintos |
| **pnpm workspaces** | 2-3× más rápido, store compartido, symlinks estrictos | Requiere `shamefully-hoist` en algunos casos edge |

**Decisión:** pnpm. El `pnpm store` compartido ahorra ~60% de espacio en disco. Los symlinks estrictos detectan dependencias implícitas que npm/yarn ocultan.

**Consecuencias:**
- Facilita: instalaciones rápidas en CI, menos espacio en disco
- Complica: algunos paquetes mal escritos necesitan `public-hoist-pattern` en `.npmrc`
- Criterio de revisión: si > 3 paquetes requieren hacks de hoisting, reevaluar

---

### ADR-012 — Zod para validación de variables de entorno

**Fecha:** Sprint 1 · **Estado:** Aceptado · **Área:** Configuración / seguridad

**Contexto:**
La API necesita ~15 variables de entorno. Acceder a `process.env.X` directamente produce errores runtime crípticos cuando una variable falta o tiene formato incorrecto.

**Decisión:** Módulo `src/config/environment.ts` que valida todas las variables con Zod al arrancar. Si alguna falta o es inválida, el proceso termina con mensaje claro.

**Consecuencias:**
- Facilita: debugging de configuración, documentación viva de todas las variables
- Complica: agregar una nueva variable requiere actualizar el schema Zod (beneficio disfrazado de costo)
- Criterio de revisión: nunca — esta práctica solo mejora con el tiempo

---

### ADR-013 — Testcontainers sobre mocks de base de datos

**Fecha:** Sprint 1 · **Estado:** Aceptado · **Área:** Testing

**Contexto:**
Los tests de integración necesitan una base de datos real. La alternativa es mockear Knex/Redis con librerías de mock.

**Opciones consideradas:**

| Opción | Pros | Contras |
|--------|------|---------|
| Mocks (jest.mock, ioredis-mock) | Rápidos, sin Docker | Divergen del comportamiento real (ej: transacciones, LISTEN/NOTIFY) |
| Base de datos compartida en CI | Sin overhead de contenedores | Tests no aislados, condiciones de carrera |
| **Testcontainers** | BD real, tests aislados, misma imagen que producción | Más lento (~15-30s de setup), requiere Docker |

**Decisión:** Testcontainers. El costo en tiempo es aceptable. La alternativa (mocks) produjo en el pasado tests que pasaban pero fallaban en producción — exactamente el escenario que los tests deben prevenir.

**Consecuencias:**
- Facilita: confianza real en los tests, cero divergencia mock/prod
- Complica: los tests de integración necesitan Docker disponible (local y CI)
- Criterio de revisión: si el tiempo de CI supera 10 minutos, evaluar paralelización de suites

---

## 7. Configuración de umbrales de cobertura

Definidos en `jest.config.ts` y aplicados en CI:

```typescript
coverageThreshold: {
  // Módulos críticos — cobertura total requerida
  './src/trips/trip-state-machine.ts': {
    lines: 100, branches: 100, functions: 100, statements: 100
  },
  './src/pricing/pricing-engine.ts': {
    lines: 100, branches: 100, functions: 100, statements: 100
  },
  './src/payments/payment.service.ts': {
    lines: 95, branches: 95, functions: 95, statements: 95
  },
  // Global — umbral mínimo del proyecto
  global: {
    lines: 75, branches: 70, functions: 75, statements: 75
  }
}
```

**¿Por qué 100% en TripStateMachine y PricingEngine?**
- `TripStateMachine`: una transición de estado no cubierta = posible doble cobro o viaje en estado inconsistente
- `PricingEngine`: un branch no cubierto = tarifa incorrecta calculada en producción
- Estas son las dos piezas de código con mayor impacto financiero directo en el MVP

---

## 8. Diseño del endpoint /health

```typescript
// GET /health — sin autenticación
// Respuesta exitosa (200):
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2026-04-05T12:00:00Z",
  "services": {
    "database": "connected",   // resultado de SELECT 1
    "redis": "connected"       // resultado de PING
  }
}

// Respuesta degradada (503):
{
  "status": "degraded",
  "version": "0.1.0",
  "timestamp": "2026-04-05T12:00:00Z",
  "services": {
    "database": "disconnected",
    "redis": "connected"
  }
}
```

Este endpoint es usado por:
- Docker health checks
- Railway/Render para determinar si el deployment fue exitoso
- Prometheus para scraping de métricas de disponibilidad

---

## 9. Variables de entorno requeridas

Documentadas en `.env.example`:

```bash
# === Servidor ===
NODE_ENV=development
PORT=3333

# === Base de datos ===
DATABASE_URL=postgresql://uber:uber@localhost:5432/uber_dev

# === Redis ===
REDIS_URL=redis://localhost:6379

# === JWT ===
JWT_SECRET=                    # mínimo 32 caracteres
JWT_REFRESH_SECRET=            # mínimo 32 caracteres, diferente al anterior
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# === App ===
APP_URL=http://localhost:3333
CORS_ORIGIN=http://localhost:3000

# === Test mode ===
# true → OTP fijo = 123456, Stripe usa test mode, no envía SMS reales
TEST_MODE=false

# === Observabilidad ===
LOG_LEVEL=info                 # debug | info | warn | error
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```
