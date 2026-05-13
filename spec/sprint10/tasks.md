# Sprint 10 — Tasks: Backend Foundation Multi-vertical + Companies + Configurations

## Resumen

| ID | Título | Tipo | Agentes | Depende de | Irreversible |
|---|---|---|---|---|---|
| VERT-001 | Migration 034: verticals + trip_types + trips.metadata | MIGRATION | backend | — | ✅ |
| COMP-001 | Migration 035: companies + company_users + configurations | MIGRATION | backend | VERT-001 | ✅ |
| VERT-002 | Seed 09: verticals iniciales + empresa demo | FEATURE | backend | COMP-001 | — |
| VERT-003 | Módulo verticals + GET /config | FEATURE | backend | VERT-001 | — |
| COMP-002 | Módulo companies + configurations | FEATURE | backend | COMP-001 | — |
| VERT-004 | Extender trips con metadata | FEATURE | backend | VERT-001 | — |
| SP10-QA-001 | QA: tests módulos nuevos + regresión | QA_ONLY | qa | VERT-003, COMP-002, VERT-004 | — |

## Grafo de dependencias

```
VERT-001
    └── COMP-001
            └── VERT-002
    ├── VERT-003 ─────────────────────┐
    ├── VERT-004                      │
    └── (COMP-001) ── COMP-002 ───────┴── SP10-QA-001
```

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|---|---|---|
| G1 | VERT-001 | Sin dependencias |
| G2 | COMP-001 | VERT-001 ✅ |
| G3 | VERT-002 ∥ VERT-003 ∥ VERT-004 ∥ COMP-002 | COMP-001 ✅ (VERT-003 y VERT-004 solo necesitan VERT-001) |
| G4 | SP10-QA-001 | VERT-003 ✅ + COMP-002 ✅ + VERT-004 ✅ |

---

## Detalle de tareas

---

### VERT-001 — Migration 034: `verticals` + `trip_types.vertical_id` + `trips.metadata`

- **Tipo:** MIGRATION
- **Sprint:** 10
- **Agentes:** backend
- **Depende de:** ninguna
- **Irreversible:** sí — CREATE TABLE verticals; ALTER TABLE trip_types, trips

**Scope incluye:**
- Crear tabla `verticals` (ver design.md para DDL completo)
- `ALTER TABLE trip_types ADD COLUMN vertical_id UUID REFERENCES verticals(id)` — nullable
- `ALTER TABLE trips ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'`
- Implementar `down()` que revierte los tres cambios en orden inverso

**Scope excluye:** seeds, módulo de negocio, UI

**Criterios de aceptación:**
- [ ] `knex migrate:latest` sin errores
- [ ] `knex migrate:rollback` sin errores y deja la BD en estado previo
- [ ] TypeScript compila sin errores tras la migración
- [ ] `trip_types.vertical_id` es nullable — no rompe rows existentes

**Notas para el agente:**
- Archivo: `20240101000034_create_verticals_add_vertical_id_metadata.ts`
- El `down()` debe: DROP COLUMN metadata de trips, DROP COLUMN vertical_id de trip_types, DROP TABLE verticals (en ese orden por FKs)
- Patrón de JSONB en Knex: `.jsonb('features').notNullable().defaultTo('{}')`

**schema_verified:** trip_types existe desde migration 001; trips desde migration 007 (verificar número real con `ls migrations/`)
**dependencies_verified:** Knex 3 soporta `.jsonb()` nativo

---

### COMP-001 — Migration 035: `companies` + `company_users` + `configurations`

- **Tipo:** MIGRATION
- **Sprint:** 10
- **Agentes:** backend
- **Depende de:** VERT-001
- **Irreversible:** sí — CREATE TABLE companies, company_users, configurations

**Scope incluye:**
- Crear tablas `companies`, `company_users`, `configurations` (ver design.md para DDL completo)
- Índices: `idx_companies_vertical_id`, `idx_companies_active`, `idx_company_users_company`, `idx_company_users_user`, `idx_configurations_entity`
- Implementar `down()` que hace DROP en orden inverso (company_users → companies → configurations, sin FK cross entre ellas)

**Scope excluye:** datos, módulos de negocio

**Criterios de aceptación:**
- [ ] `knex migrate:latest` sin errores
- [ ] `knex migrate:rollback` sin errores
- [ ] UNIQUE constraint en `company_users(company_id, user_id)` verificado
- [ ] UNIQUE constraint en `configurations(entity_type, entity_id, namespace, key)` verificado

**Notas para el agente:**
- Archivo: `20240101000035_create_companies_company_users_configurations.ts`
- `company_users.role`: usar `table.check("role IN ('owner', 'admin', 'member')")` en Knex
- `configurations.entity_type`: usar `table.check("entity_type IN ('company', 'user', 'vertical')")`
- `companies` tiene `deleted_at` para soft delete — agregar índice parcial `WHERE deleted_at IS NULL`

**schema_verified:** `users.id` es el FK target de company_users — verificar tipo UUID
**dependencies_verified:** ninguna npm nueva requerida

---

### VERT-002 — Seed 09: verticals iniciales + empresa demo

- **Tipo:** FEATURE
- **Sprint:** 10
- **Agentes:** backend
- **Depende de:** COMP-001

**Scope incluye:**
- Insertar 3 verticals con sus features (ver design.md para valores exactos): `taxi`, `custody`, `cold-chain`
- `UPDATE trip_types SET vertical_id = (SELECT id FROM verticals WHERE slug = 'taxi')` para todos los tipos existentes
- Insertar 1 empresa demo: slug=`empresa-demo`, name=`Empresa Demo SA`, vertical=taxi
- Todo con `ON CONFLICT DO NOTHING` o `ON CONFLICT (...) DO UPDATE` según corresponda

**Scope excluye:** trip_types nuevos para custody/cold-chain, usuarios de la empresa demo

**Criterios de aceptación:**
- [ ] Primer run: 3 verticals insertados, trip_types actualizados, 1 empresa creada
- [ ] Segundo run: sin errores, sin duplicados
- [ ] `SELECT count(*) FROM verticals` = 3

**Notas para el agente:**
- Archivo: `apps/api/seeds/09_verticals_and_companies.ts`
- Orden de inserción: verticals → trip_types UPDATE → companies (companies FK vertical_id)
- El seed debe funcionar con la BD ya populada de sprints anteriores

**actor_resolution:** no aplica — seed no usa JWT

---

### VERT-003 — Módulo `verticals` + endpoint `GET /config`

- **Tipo:** FEATURE
- **Sprint:** 10
- **Agentes:** backend
- **Depende de:** VERT-001

**Scope incluye:**
- `verticals.repository.ts`: findBySlug, findAll, update
- `verticals.service.ts`: getConfig (lee VERTICAL_SLUG env + cache Redis), getAll, updateFeatures
- `verticals.controller.ts`: handlers para las 3 rutas
- `verticals.routes.ts`: GET /config (sin auth), GET /admin/verticals (admin), PATCH /admin/verticals/:slug (admin)
- Cache Redis: `SET vertical:config:{slug} {json} EX 60`; PATCH invalida con `DEL`
- Registrar módulo en `main.ts`
- Agregar `VERTICAL_SLUG=taxi` a `.env` y `.env.example`

**Scope excluye:** UI, mobile

**Criterios de aceptación:**
- [ ] `GET /config` sin token → 200 con features del vertical taxi
- [ ] `GET /config` con `VERTICAL_SLUG=custody` → features de custody
- [ ] `GET /config` con slug inexistente → 400 `VERTICAL_NOT_FOUND`
- [ ] `GET /admin/verticals` sin token → 401
- [ ] `PATCH /admin/verticals/taxi` con admin → 200 + cache invalidado
- [ ] Segunda llamada a `GET /config` usa cache (verificar con Redis TTL)

**TDD — tests a escribir:**
```
verticals.service.test.ts:
  ✓ getConfig: retorna vertical correcto desde BD + cachea en Redis
  ✓ getConfig: hit de cache en segunda llamada (BD no se consulta)
  ✓ getConfig: lanza VERTICAL_NOT_FOUND si slug no existe
  ✓ updateFeatures: actualiza y borra cache
  ✓ getAll: retorna lista de verticals activos

verticals.integration.test.ts:
  ✓ GET /config → 200 con slug=taxi
  ✓ GET /config → 400 con slug inválido
  ✓ PATCH /admin/verticals/:slug → 200 admin
  ✓ PATCH /admin/verticals/:slug → 403 no-admin
```

**schema_verified:** tabla verticals creada en VERT-001
**dependencies_verified:** Redis ya disponible en el proyecto (BullMQ usa misma conexión)
**actor_resolution:** PATCH usa `requireAdmin` middleware existente

---

### COMP-002 — Módulo `companies` + módulo `configurations`

- **Tipo:** FEATURE
- **Sprint:** 10
- **Agentes:** backend
- **Depende de:** COMP-001

**Scope incluye:**

**companies:**
- `companies.repository.ts`: create, findAll (paginado + filtro), findById, update, addUser, removeUser, getUsers
- `companies.service.ts`: CRUD con slug único (409 si duplicado), soft delete vía `active=false` + `deleted_at`
- `companies.controller.ts` + `companies.routes.ts`: 7 endpoints (ver design.md)

**configurations:**
- `configurations.repository.ts`: upsert, findAllByEntity (agrupado por namespace), deleteOne
- `configurations.service.ts`: validación de entityType enum, upsert, getGrouped, delete
- `configurations.controller.ts` + `configurations.routes.ts`: 3 endpoints

- Registrar ambos módulos en `main.ts`

**Scope excluye:** validación semántica del `value` JSONB, UI

**Criterios de aceptación:**
- [ ] `POST /admin/companies` → 201 con empresa creada
- [ ] `POST /admin/companies` con slug duplicado → 409 `COMPANY_SLUG_TAKEN`
- [ ] `PATCH /admin/companies/:id` con `active: false` → soft delete (deleted_at poblado)
- [ ] `GET /admin/companies` no retorna empresas con `deleted_at IS NOT NULL`
- [ ] `POST /admin/companies/:id/users` con user ya vinculado → 409 `USER_ALREADY_IN_COMPANY`
- [ ] `PUT /config/entity/company/:id/pricing/discount_pct` → upsert correcto
- [ ] `GET /config/entity/company/:id` → objeto agrupado por namespace
- [ ] `entityType` fuera del enum → 422

**TDD — tests a escribir:**
```
companies.service.test.ts:
  ✓ create: crea correctamente
  ✓ create: lanza COMPANY_SLUG_TAKEN si slug duplicado
  ✓ update: soft delete con active=false
  ✓ addUser: vincula usuario correctamente
  ✓ addUser: lanza USER_ALREADY_IN_COMPANY si duplicado
  ✓ removeUser: desvincula correctamente
  ✓ removeUser: lanza COMPANY_USER_NOT_FOUND si no existe

configurations.service.test.ts:
  ✓ upsert: crea si no existe
  ✓ upsert: actualiza si ya existe (mismo entity+namespace+key)
  ✓ getGrouped: agrupa por namespace correctamente
  ✓ delete: lanza CONFIG_NOT_FOUND si no existe
  ✓ entityType inválido → error de validación

companies.integration.test.ts:
  ✓ POST /admin/companies → 201
  ✓ POST /admin/companies → 409 slug duplicado
  ✓ GET /admin/companies?active=true → solo activas
  ✓ POST /admin/companies/:id/users → 201
  ✓ PUT /config/entity/company/:id/pricing/discount → 200
  ✓ GET /config/entity/company/:id → agrupado
```

**schema_verified:** users.id disponible para FK en company_users
**dependencies_verified:** ninguna npm nueva
**actor_resolution:** todos los endpoints usan `requireAdmin` existente

---

### VERT-004 — Extender trips con metadata

- **Tipo:** FEATURE
- **Sprint:** 10
- **Agentes:** backend
- **Depende de:** VERT-001

**Scope incluye:**
- `trips.routes.ts`: agregar `metadata: z.record(z.unknown()).default({})` al schema de `POST /trips` y `POST /trips/estimate`
- `trips.service.ts`: pasar `metadata` a `tripsRepo.create()` y a la respuesta de estimate
- `trips.repository.ts`: incluir `metadata` en INSERT y en SELECT (trips y active trip)
- `pricing.controller.ts`: retornar `metadata` en response de `/trips/estimate`

**Scope excluye:** validación semántica por vertical, cambios a TripStateMachine, cambios a PricingEngine

**Criterios de aceptación:**
- [ ] `POST /trips` con `metadata: { declared_value: 50000 }` → 201 y metadata persiste
- [ ] `GET /trips/:id` retorna `metadata` en response
- [ ] `POST /trips` sin `metadata` → metadata es `{}` en BD
- [ ] TripStateMachine coverage sigue en 100%
- [ ] PricingEngine coverage sigue en 100%

**TDD — tests a escribir:**
```
trips.integration.test.ts (añadir casos):
  ✓ POST /trips con metadata → GET /trips/:id retorna mismo metadata
  ✓ POST /trips sin metadata → metadata es {} en response
  ✓ POST /trips/estimate con metadata → metadata en response
```

**schema_verified:** columna `trips.metadata` creada en VERT-001
**dependencies_verified:** ninguna npm nueva
**actor_resolution:** trips usa passenger JWT (existente)

---

### SP10-QA-001 — QA: tests módulos nuevos + regresión global

- **Tipo:** QA_ONLY
- **Sprint:** 10
- **Agentes:** qa
- **Depende de:** VERT-003, COMP-002, VERT-004

**Scope incluye:**
- Verificar que todos los tests escritos en VERT-003, COMP-002, VERT-004 pasan
- Correr suite completa y verificar que no hay regresiones
- Verificar cobertura global ≥75% y módulos nuevos ≥80%
- Verificar TripStateMachine 100% y PricingEngine 100%
- Actualizar `collectCoverageFrom` en `jest.config.ts` para incluir los nuevos módulos

**Criterios de aceptación:**
- [ ] `npx jest --silent --passWithNoTests` → 0 fallos
- [ ] Cobertura verticals.service ≥80%
- [ ] Cobertura companies.service ≥80%
- [ ] Cobertura configurations.service ≥80%
- [ ] TripStateMachine: 100% lines + branches
- [ ] PricingEngine: 100% lines + branches
- [ ] Cobertura global: ≥75% statements

**Notas para el agente:**
- Agregar exclusiones en `collectCoverageFrom` para: `verticals.routes.ts`, `verticals.controller.ts`, `companies.routes.ts`, `companies.controller.ts`, `configurations.routes.ts`, `configurations.controller.ts` (solo integration-testables)
- Si algún test falla, leer output COMPLETO (sin head/tail) antes de diagnosticar

---

## Definition of Done — Sprint 10

- [ ] Migrations 034 y 035 corren y hacen rollback sin errores
- [ ] Seed 09 es idempotente
- [ ] `GET /config` retorna vertical correcto con cache Redis
- [ ] CRUD companies funcional vía API
- [ ] Configurations upsert/read/delete funcional
- [ ] trips.metadata persiste y se retorna en responses
- [ ] Suite completa: 0 fallos, cobertura global ≥75%
- [ ] TypeScript strict: 0 errores en API
- [ ] `VERTICAL_SLUG=taxi` en `.env` y `.env.example`
- [ ] Snapshots actualizados: `context/snapshots/verticals.snapshot.md` (nuevo), `context/snapshots/trips.snapshot.md` (actualizar)

## Notas por agente

**Backend:**
- Correr siempre `--testPathPattern={module}` para el módulo en foco; suite completa solo en SP10-QA-001
- El cache Redis en tests: usar `redis.flushall()` en `beforeEach` de integration tests
- COMP-002 crea dos sub-módulos (companies + configurations) — son archivos distintos pero pueden estar en la misma carpeta `companies/`

**QA:**
- Usar Testcontainers para integration tests (patrón ya establecido en el proyecto)
- Los tests de configurations deben crear una empresa real primero para tener un entity_id válido
