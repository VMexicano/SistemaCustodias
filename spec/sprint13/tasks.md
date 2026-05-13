# Tasks — Sprint 13: Backend Vertical Data Models

**Fecha:** 2026-04-27
**Sprint:** 13
**Estado global:** 🔲 Pendiente

---

## Tabla resumen

| ID | Título | Tipo | Estado |
|---|---|---|---|
| VERT13-001 | Migration 036: temperature_readings + custody_events + alter tables | MIGRATION | 🔲 |
| VERT13-002 | Seed 10: document requirements por vertical + features JSONB | MIGRATION | 🔲 |
| VERT13-003 | Módulo custody_events: POST/GET /trips/:id/custody | FEATURE | 🔲 |
| VERT13-004 | Módulo temperature_readings: POST/GET /trips/:id/temperature | FEATURE | 🔲 |
| VERT13-005 | Extender PricingEngine: fixed_rate + per_weight_km | FEATURE | 🔲 |
| SP13-QA-001 | Tests: custody + temperature + pricing models | QA_ONLY | 🔲 |

---

## Grafo de dependencias

```
VERT13-001 (migración — primero)
    ├── VERT13-002 (seed)       ─┐
    ├── VERT13-003 (custody)    ─┤
    ├── VERT13-004 (temperature)─┼──→ SP13-QA-001
    └── VERT13-005 (pricing)    ─┘
```

---

## Grupos de ejecución paralela

- **Grupo 1** (sin deps): `VERT13-001` — debe completarse antes de cualquier otra tarea
- **Grupo 2** (esperan VERT13-001): `VERT13-002 ∥ VERT13-003 ∥ VERT13-004 ∥ VERT13-005`
- **Grupo 3** (esperan Grupo 2): `SP13-QA-001`

---

## Tareas detalladas

---

### VERT13-001 — Migration 036: temperature_readings + custody_events + alter tables

- **Tipo:** MIGRATION
- **Sprint:** 13
- **Agentes:** backend
- **Depende de:** —
- **Irreversible:** sí — CREATE TABLE + ALTER TABLE en producción

**Scope incluye:**
- `CREATE TABLE temperature_readings` (hypertable TimescaleDB) con índice `(trip_id, recorded_at DESC)`
- `CREATE TABLE custody_events` (append-only, con CHECK constraint en event_type, UNIQUE en trip_id+sequence)
- `ALTER TABLE document_requirements ADD COLUMN vertical_id UUID REFERENCES verticals(id) ON DELETE SET NULL`
- `ALTER TABLE trip_types ADD COLUMN weight_capacity_kg DECIMAL(8,2)`

**Scope excluye:**
- Seeds de datos (VERT13-002)
- Lógica de negocio

**Criterios de aceptación (negocio):** Las 2 nuevas tablas y las 2 columnas existen en la BD tras ejecutar la migración.

**Criterios de aceptación (técnico):**
- `knex migrate:latest` corre sin errores
- `SELECT * FROM temperature_readings LIMIT 0` → 0 rows (tabla vacía, sin error)
- `SELECT * FROM custody_events LIMIT 0` → 0 rows
- `SELECT vertical_id FROM document_requirements LIMIT 0` → columna existe
- `SELECT weight_capacity_kg FROM trip_types LIMIT 0` → columna existe

**TDD specs:**
```typescript
// No hay unit tests para migraciones — verificación vía knex migrate:latest
// + query de verificación de columnas en SP13-QA-001 integration test
```

**schema_verified:** `verticals.id` existe (Sprint 10 ✅) · `trips.id` existe ✅ · `users.id` existe ✅

---

### VERT13-002 — Seed 10: document requirements por vertical + features JSONB

- **Tipo:** MIGRATION
- **Sprint:** 13
- **Agentes:** backend
- **Depende de:** VERT13-001
- **Irreversible:** no (seeds son idempotentes con ON CONFLICT DO NOTHING)

**Scope incluye:**
- Seed `10_vertical_document_requirements.ts`:
  - 2 requisitos para vertical `custody` (slug): `security_certification` + `vehicle_armored_cert`
  - 2 requisitos para vertical `cold-chain` (slug): `refrigeration_cert` + `temperature_logger_cert`
- UPDATE en `verticals` table para agregar flags nuevos a `features` JSONB:
  - `taxi`: `{ ..., cargoDeclaration: false, temperatureLog: false, chainOfCustody: false }`
  - `custody`: `{ ..., cargoDeclaration: true, temperatureLog: false, chainOfCustody: true, pricingModel: 'fixed_rate' }`
  - `cold-chain`: `{ ..., cargoDeclaration: true, temperatureLog: true, chainOfCustody: false, pricingModel: 'per_weight_km' }`

**Scope excluye:**
- Crear nuevos verticales (ya existen 3 del Sprint 10)

**Criterios de aceptación (negocio):** Admin puede ver 4 requisitos nuevos en el panel. Los features JSONB de custody/cold-chain incluyen los nuevos flags.

**Criterios de aceptación (técnico):**
- `SELECT count(*) FROM document_requirements WHERE vertical_id IS NOT NULL` → 4 rows
- `SELECT features->>'pricingModel' FROM verticals WHERE slug = 'custody'` → `fixed_rate`
- `SELECT features->>'chainOfCustody' FROM verticals WHERE slug = 'custody'` → `true`

**Orden de inserción por FK:**
1. Resolver `vertical_id` de custody y cold-chain via `SELECT id FROM verticals WHERE slug = 'custody'`
2. Resolver `region_id` de MX via `SELECT id FROM region_config WHERE country_code = 'MX'`
3. INSERT en `document_requirements` con esos IDs

---

### VERT13-003 — Módulo custody_events: POST/GET /trips/:id/custody

- **Tipo:** FEATURE
- **Sprint:** 13
- **Agentes:** backend, qa
- **Depende de:** VERT13-001
- **Irreversible:** no

**Scope incluye:**
- `custody.repository.ts`: `createEvent()`, `getEventsByTrip()`
- `custody.service.ts`: validar estado del viaje (ACCEPTED|IN_PROGRESS), actor es conductor del viaje, calcular sequence
- `custody.controller.ts`: handlers REST
- `custody.routes.ts`: registrar en Fastify bajo `/trips/:id/custody/events` y `/trips/:id/custody`

**Scope excluye:**
- Firma digital criptográfica
- Notificaciones al pasajero al crear evento

**Criterios de aceptación (negocio):**
- Conductor puede crear evento con `event_type = 'pick_up'` en viaje ACCEPTED → 201
- Admin puede listar todos los eventos del viaje con actor_name → 200

**Criterios de aceptación (técnico):**
- `POST /trips/:id/custody/events` sin JWT → 401
- `POST /trips/:id/custody/events` con JWT de pasajero → 403
- `POST /trips/:id/custody/events` con viaje en COMPLETED → 409 TRIP_NOT_ACTIVE
- Dos eventos del mismo viaje tienen sequence 1 y 2 respectivamente
- GET retorna eventos ordenados por sequence ASC

**TDD specs (tests a escribir en custody.service.test.ts):**
```typescript
describe('CustodyService', () => {
  it('creates pick_up event with sequence 1 on new trip')
  it('increments sequence correctly for same trip')
  it('throws TRIP_NOT_FOUND when trip does not exist')
  it('throws FORBIDDEN when actor is not the trip driver')
  it('throws TRIP_NOT_ACTIVE when trip is COMPLETED')
  it('throws TRIP_NOT_ACTIVE when trip is CANCELLED')
  it('getEventsByTrip returns events ordered by sequence ASC')
  it('getEventsByTrip returns empty array when no events')
})
```

**actor_resolution:** JWT.sub = user_id → lookup `drivers WHERE user_id = JWT.sub` → compare con `trips.driver_id`

---

### VERT13-004 — Módulo temperature_readings: POST/GET /trips/:id/temperature

- **Tipo:** FEATURE
- **Sprint:** 13
- **Agentes:** backend, qa
- **Depende de:** VERT13-001
- **Irreversible:** no

**Scope incluye:**
- `temperature.repository.ts`: `createReading()`, `getReadings(tripId, from?, to?, limit?)`, `getSummary(tripId, setpoints?)`
- `temperature.service.ts`: validar estado IN_PROGRESS, actor es conductor, validar rango celsius [-100, 200]
- `temperature.controller.ts` + `temperature.routes.ts`

**Scope excluye:**
- Alertas en tiempo real WebSocket (Sprint futuro)
- Integración con sensores IoT externos

**Criterios de aceptación (negocio):**
- Conductor reporta temperatura → 201
- Cliente consulta lecturas con summary (min/max/avg) → 200
- `out_of_range_count` = 0 si `trips.metadata.setpoints` no existe

**Criterios de aceptación (técnico):**
- `celsius = 201` → 400 INVALID_TEMPERATURE
- `celsius = -101` → 400 INVALID_TEMPERATURE
- `celsius = 4.5` con viaje IN_PROGRESS → 201
- Conductor con viaje en ACCEPTED → 409 TRIP_NOT_IN_PROGRESS
- GET con `?from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z` filtra por rango correcto

**TDD specs:**
```typescript
describe('TemperatureService', () => {
  it('creates reading for IN_PROGRESS trip')
  it('throws TRIP_NOT_IN_PROGRESS when trip is ACCEPTED')
  it('throws INVALID_TEMPERATURE for celsius > 200')
  it('throws INVALID_TEMPERATURE for celsius < -100')
  it('throws FORBIDDEN when actor is not the trip driver')
  it('getSummary returns min/max/avg correctly')
  it('getSummary returns out_of_range_count = 0 when no setpoints in metadata')
  it('getSummary counts out_of_range correctly when setpoints exist')
  it('getReadings filters by from/to date range')
})
```

**schema_verified:** `trips.metadata` JSONB existe (Sprint 10 ✅) — se usará para leer `metadata.setpoints = { min_celsius, max_celsius }`

---

### VERT13-005 — Extender PricingEngine: fixed_rate + per_weight_km

- **Tipo:** FEATURE
- **Sprint:** 13
- **Agentes:** backend, qa
- **Depende de:** VERT13-001 (para weight_capacity_kg en trip_types)
- **Irreversible:** no

**Scope incluye:**
- Agregar parámetro `pricingModel?: PricingModel` a `PricingEngine.estimate()`
- Implementar rama `fixed_rate`: `fare = tripType.base_fare`
- Implementar rama `per_weight_km`: `fare = weightKg * baseFare + distanceKm * costPerKm`; respeta `min_fare`
- Agregar `weight_kg?: number` al input de `POST /trips/estimate`
- El controller de trips lee `pricingModel` de `GET /config` (Redis cached)

**Scope excluye:**
- Pricing por zona horaria o demanda dinámica
- Cambiar o refactorizar lógica existente de `per_km_min`

**Criterios de aceptación (negocio):**
- `POST /trips/estimate` con vertical custody (fixed_rate) retorna `fare = base_fare` independientemente de distancia
- `POST /trips/estimate` con vertical cold-chain (per_weight_km) y `weight_kg = 100` retorna fare correcto

**Criterios de aceptación (técnico):**
- Tests existentes de PricingEngine (100% coverage) pasan sin cambio
- `fixed_rate` ignora `distanceKm` y `durationMin` — test verificando que son irrelevantes
- `per_weight_km` con `weight_kg = 0` usa `weight_kg = 1` como mínimo (sin fares cero)
- `pricing_snapshot` sigue siendo inmutable — la extensión no lo modifica

**TDD specs:**
```typescript
// Agregar a pricing-engine.test.ts (NO crear archivo nuevo)
describe('PricingEngine — pricingModel extension', () => {
  it('fixed_rate: returns base_fare ignoring distance and duration')
  it('fixed_rate: respects min_fare if base_fare < min_fare')
  it('per_weight_km: calculates fare = weight * base_fare + distance * cost_per_km')
  it('per_weight_km: uses minimum weight_kg=1 when weight_kg=0 provided')
  it('per_weight_km: respects min_fare')
  it('per_km_min: existing behavior unchanged (regression guard)')
})
```

**dependencies_verified:** PricingEngine ya está en `apps/api/src/modules/pricing/pricing.service.ts` ✅

---

### SP13-QA-001 — Tests: custody + temperature + pricing models

- **Tipo:** QA_ONLY
- **Sprint:** 13
- **Agentes:** qa
- **Depende de:** VERT13-003, VERT13-004, VERT13-005
- **Irreversible:** no

**Scope incluye:**
- `custody.service.test.ts`: 8 tests (spec en VERT13-003)
- `temperature.service.test.ts`: 9 tests (spec en VERT13-004)
- Extensión `pricing-engine.test.ts`: 6 tests nuevos (spec en VERT13-005)
- Verificación cobertura: custody ≥ 90%, temperature ≥ 90%, pricing 100%

**Scope excluye:**
- Tests de integración con Docker (unit tests con mocks)
- Tests Playwright E2E (Sprint 15)

---

## Definition of Done — Sprint 13

- [ ] Migration 036 corre en blanco sin errores (`knex migrate:latest`)
- [ ] Seed 10 corre idempotente (`knex seed:run`)
- [ ] `POST /trips/:id/custody/events` → 201 con JWT válido de conductor
- [ ] `GET /trips/:id/custody` → array de eventos ordenados
- [ ] `POST /trips/:id/temperature` → 201 con viaje IN_PROGRESS
- [ ] `GET /trips/:id/temperature` → lecturas + summary
- [ ] `POST /trips/estimate` con `pricingModel = 'fixed_rate'` retorna fare = base_fare
- [ ] `POST /trips/estimate` con `pricingModel = 'per_weight_km'` y `weight_kg = 50` retorna fare correcto
- [ ] Tests PricingEngine existentes: 100% cobertura mantenida (sin regresión)
- [ ] Tests custody.service: ≥ 90% cobertura
- [ ] Tests temperature.service: ≥ 90% cobertura
- [ ] TypeScript: 0 errores en `apps/api`
- [ ] Cobertura global API: ≥ 75%

---

## Notas por agente

**backend:**
- Crear módulos `custody/` y `temperature/` en `apps/api/src/modules/`
- Registrar las nuevas rutas en `apps/api/src/main.ts`
- Extender `POST /trips/estimate` en `pricing.controller.ts` para aceptar `weight_kg`
- El controller de estimate debe resolver `pricingModel` desde el vertical activo (Redis → `verticals.features.pricingModel`)

**qa:**
- Usar el patrón de mock existente en `admin.service.test.ts` como referencia
- Para temperature: mockear `db('temperature_readings').insert()` y verificar parámetros
- Para custody: el test de sequence debe verificar que se hace el MAX query antes de insertar
- PricingEngine tests: agregar al archivo existente, no crear uno nuevo

**devops:**
- No hay cambios de infraestructura en este sprint
- Ejecutar `knex migrate:latest && knex seed:run --specific=10_vertical_document_requirements.ts` en staging
