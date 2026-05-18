# Sprint 14 — Tasks: Event Catalog + CustodyEvent Envelope

**Sprint:** 14 — SistemaCustodias
**Fecha:** 2026-05-18
**Módulo:** custody-events

---

## Estado de tareas

| ID | Título | Tipo | Agente | Estado |
|---|---|---|---|---|
| EVENTS-001 | Migraciones M-055 event_catalog + M-056 order_event | MIGRATION | backend + devops | 🔲 |
| EVENTS-002 | Seed 15: catálogo base de 5 tipos de evento | FEATURE | backend | 🔲 |
| EVENTS-003 | Módulo custody-events completo | FEATURE | backend | 🔲 |
| EVENTS-QA-001 | Tests unitarios CustodyEventService — 100% branches | QA_ONLY | qa | 🔲 |

---

## Grafo de dependencias

```
EVENTS-001
  │
  ├──► EVENTS-002 (seed se escribe en paralelo con EVENTS-003, se aplica después)
  │
  └──► EVENTS-003
             │
             └──► EVENTS-QA-001
```

---

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|---|---|---|
| Grupo 1 | EVENTS-001 | Sin dependencias — arrancar inmediatamente |
| Grupo 2 | EVENTS-002 + EVENTS-003 | EVENTS-001 completado y migraciones aplicadas |
| Grupo 3 | EVENTS-QA-001 | EVENTS-003 completado |

> **Nota:** EVENTS-002 y EVENTS-003 pueden escribirse en paralelo (backend y devops simultáneos). EVENTS-002 solo se *aplica* (`seed:run`) una vez que EVENTS-001 ya migró.

---

## EVENTS-001 — Migraciones M-055 + M-056

**Tipo:** MIGRATION · **Sprint:** 14 · **Agente:** backend (escribe archivos) + devops (aplica)
**Depende de:** ninguna · **Irreversible:** ✅ sí

### Checklist SDD
- [ ] schema_verified — `custody_types.slug` existe como PK en M-039 ✅
- [ ] schema_verified — `tenants.id` existe como PK en M-001 ✅
- [ ] schema_verified — `users.id` existe como PK en M-002 ✅
- [ ] schema_verified — `custody_orders.id` existe como PK en M-043 ✅
- [ ] dependencies_verified — `node:crypto` built-in, sin deps npm nuevas ✅
- [ ] actor_resolution — no aplica (migración solo)
- [ ] two_person_rule — no aplica (migración solo)

### Archivos a crear

```
database/migrations/20260518_055_create_event_catalog.ts
database/migrations/20260518_056_create_order_event.ts
```

### Especificación M-055

```typescript
// up
await knex.schema.createTable('event_catalog', (t) => {
  t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
  t.string('vertical_slug', 50).notNullable()
    .references('slug').inTable('custody_types').onDelete('RESTRICT');
  t.string('code', 50).notNullable();
  t.string('label', 100).notNullable();
  t.boolean('requires_photo').notNullable().defaultTo(false);
  t.boolean('requires_audio').notNullable().defaultTo(false);
  t.boolean('requires_signature').notNullable().defaultTo(false);
  t.jsonb('payload_schema').notNullable();
  t.integer('interval_minutes').nullable();
  t.boolean('active').notNullable().defaultTo(true);
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.unique(['vertical_slug', 'code'], { indexName: 'event_catalog_vertical_code_unique' });
});

// down
await knex.schema.dropTableIfExists('event_catalog');
```

### Especificación M-056

```typescript
// up
await knex.raw(`
  CREATE TYPE order_event_actor_role AS ENUM ('custodio', 'copiloto', 'supervisor', 'system')
`);

await knex.schema.createTable('order_event', (t) => {
  t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
  t.uuid('order_id').notNullable().references('id').inTable('custody_orders').onDelete('RESTRICT');
  t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
  t.string('event_type', 50).notNullable();
  t.integer('sequence_no').notNullable();
  t.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
  t.specificType('actor_role', 'order_event_actor_role').notNullable();
  t.timestamp('app_timestamp', { useTz: true }).notNullable();
  t.timestamp('auto_timestamp', { useTz: true }).nullable();   // Monitor Engine - Sprint 15
  t.jsonb('location').notNullable();
  t.jsonb('evidence').nullable();
  t.jsonb('payload').notNullable();
  t.jsonb('device').notNullable();
  t.string('integrity_hash', 64).notNullable();
  t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  t.unique(['order_id', 'sequence_no'], { indexName: 'order_event_order_sequence_unique' });
});

await knex.raw('CREATE INDEX order_event_order_id_created_at_idx ON order_event (order_id, created_at DESC)');
await knex.raw('CREATE INDEX order_event_tenant_id_created_at_idx ON order_event (tenant_id, created_at DESC)');

// down (orden inverso: primero tabla, luego tipo)
await knex.schema.dropTableIfExists('order_event');
await knex.raw('DROP TYPE IF EXISTS order_event_actor_role');
```

### Definition of Done EVENTS-001
- [ ] `knex migrate:latest` sin errores
- [ ] `knex migrate:rollback` limpio (DROP TABLE + DROP TYPE sin errores)
- [ ] `\d event_catalog` en psql muestra UNIQUE constraint y FK a custody_types
- [ ] `\d order_event` en psql muestra UNIQUE (order_id, sequence_no) e índices adicionales
- [ ] TypeScript: 0 errores en los archivos de migración

---

## EVENTS-002 — Seed 15: event_catalog

**Tipo:** FEATURE · **Sprint:** 14 · **Agente:** backend
**Depende de:** EVENTS-001 (migraciones aplicadas) · **Irreversible:** no

### Checklist SDD
- [ ] schema_verified — `event_catalog` columns verificadas post-M-055
- [ ] dependencies_verified — sin deps nuevas
- [ ] actor_resolution — no aplica (seed)
- [ ] two_person_rule — no aplica (seed)

### Archivos a crear

```
apps/api/seeds/15_event_catalog.ts
```

### Especificación del seed

**Estructura de los 5 tipos de evento** (ver `spec/sprint14/design.md` para payload_schema completos):

```typescript
const EVENT_TYPES = [
  {
    code: 'CHECKPOINT',
    label: 'Punto de control',
    requires_photo: false,
    requires_audio: false,
    requires_signature: false,
    interval_minutes: 15,
    payload_schema: { /* ver design.md */ }
  },
  {
    code: 'PANIC',
    label: 'Botón de pánico',
    requires_photo: false,
    requires_audio: false,
    requires_signature: false,
    interval_minutes: null,
    payload_schema: { /* ver design.md */ }
  },
  {
    code: 'CARGO_STATUS',
    label: 'Verificación de carga',
    requires_photo: true,
    requires_audio: false,
    requires_signature: false,
    interval_minutes: null,
    payload_schema: { /* ver design.md */ }
  },
  {
    code: 'INCIDENT',
    label: 'Reporte de incidente',
    requires_photo: false,
    requires_audio: false,
    requires_signature: false,
    interval_minutes: null,
    payload_schema: { /* ver design.md */ }
  },
  {
    code: 'DELIVERY_ATTEMPT',
    label: 'Intento de entrega',
    requires_photo: true,
    requires_audio: false,
    requires_signature: true,
    interval_minutes: null,
    payload_schema: { /* ver design.md */ }
  }
];

const VERTICALS = ['cash_transport', 'high_value_package', 'confidential_docs', 'vip_escort'];

// Insertar 20 filas (5 × 4) idempotente
for (const vertical of VERTICALS) {
  for (const event of EVENT_TYPES) {
    await knex('event_catalog')
      .insert({ id: knex.raw('gen_random_uuid()'), vertical_slug: vertical, ...event, active: true })
      .onConflict(['vertical_slug', 'code'])
      .ignore();
  }
}
```

### Definition of Done EVENTS-002
- [ ] `SELECT COUNT(*) FROM event_catalog` retorna 20
- [ ] `SELECT * FROM event_catalog WHERE code = 'PANIC'` retorna 4 filas (una por vertical)
- [ ] Re-ejecutar el seed no crea duplicados
- [ ] `interval_minutes` es `null` para PANIC, CARGO_STATUS, INCIDENT, DELIVERY_ATTEMPT
- [ ] `interval_minutes = 15` para CHECKPOINT

---

## EVENTS-003 — Módulo custody-events

**Tipo:** FEATURE · **Sprint:** 14 · **Agente:** backend
**Depende de:** EVENTS-001, EVENTS-002 · **Irreversible:** no

### Checklist SDD
- [ ] schema_verified — `order_event` columns confirmadas post-M-056
- [ ] schema_verified — `event_catalog` columns confirmadas post-M-055
- [ ] dependencies_verified — `ajv` ya es dep directa (Sprint 4 Custodias) ✅; `node:crypto` built-in ✅
- [ ] actor_resolution — JWT.sub = user_id; actorId se pasa directamente como user_id en order_event.actor_id
- [ ] two_person_rule — no aplica directamente; el módulo no asigna equipo
- [ ] env_verified — `CUSTODY_EVENT_HMAC_SECRET` agregado a `config/env.ts` con Zod `.min(32)`

### Archivos a crear

```
apps/api/src/modules/custody-events/custody-events.types.ts
apps/api/src/modules/custody-events/custody-events.repository.ts
apps/api/src/modules/custody-events/custody-events.service.ts
apps/api/src/modules/custody-events/custody-events.controller.ts
apps/api/src/modules/custody-events/custody-events.routes.ts
```

### Archivos a modificar

```
apps/api/src/shared/errors/business-error.ts   ← +4 códigos nuevos
apps/api/src/config/env.ts                     ← +CUSTODY_EVENT_HMAC_SECRET (Zod .min(32))
apps/api/src/app.ts                            ← wiring CustodyEventsRepository + CustodyEventService
jest.config.ts                                 ← excluir custody-events.repository/controller/routes de cobertura unitaria
```

### Nuevos BusinessError codes

```typescript
ORDER_NOT_ACTIVE_FOR_EVENT = 'ORDER_NOT_ACTIVE_FOR_EVENT'  // 409
EVENT_TYPE_NOT_FOUND = 'EVENT_TYPE_NOT_FOUND'              // 404
EVENT_PAYLOAD_INVALID = 'EVENT_PAYLOAD_INVALID'            // 422
DUPLICATE_SEQUENCE_NO = 'DUPLICATE_SEQUENCE_NO'            // 409
```

### Spec TDD — tests a escribir (referencia para QA)

```
custody-events.service.test.ts
│
├─ getCatalog()
│   ├─ retorna catálogo del vertical de la orden
│   ├─ ORDER_NOT_FOUND si orden no existe
│   └─ ORDER_NOT_ACTIVE_FOR_EVENT si orden en DRAFT
│
├─ createEvent() — estados de orden
│   ├─ it.each(ACTIVE_STATUSES) → acepta el evento [6 tests]
│   ├─ DRAFT → ORDER_NOT_ACTIVE_FOR_EVENT
│   └─ COMPLETED → ORDER_NOT_ACTIVE_FOR_EVENT
│
├─ createEvent() — validación de catálogo
│   ├─ EVENT_TYPE_NOT_FOUND si event_type no existe en catálogo
│   ├─ EVENT_PAYLOAD_INVALID si falta campo requerido en payload
│   └─ EVENT_PAYLOAD_INVALID si campo tiene tipo incorrecto
│
├─ createEvent() — happy paths
│   ├─ CHECKPOINT: inserta event con sequence_no=1, integrity_hash calculado
│   ├─ PANIC: inserta event + verifica alertsQueue.add() fue llamado
│   ├─ CARGO_STATUS: inserta event sin enqueue a alertsQueue
│   └─ DELIVERY_ATTEMPT: inserta event con evidence.signature presente
│
├─ createEvent() — integrity_hash
│   ├─ hash es string de 64 caracteres hexadecimales
│   └─ hash cambia si el payload cambia
│
├─ createEvent() — sequence_no
│   ├─ primer evento → sequence_no = 1
│   ├─ segundo evento → sequence_no = 2 (mock MAX = 1)
│   └─ DUPLICATE_SEQUENCE_NO si hay race condition (getNextSequenceNo lanza)
│
└─ getEvents()
    ├─ retorna eventos paginados ordenados por created_at ASC
    ├─ sin evidence si includeEvidence = false
    └─ con evidence si includeEvidence = true
```

### Wiring en `app.ts`

```typescript
// En la función buildApp():
const custodyEventsRepo = new CustodyEventsRepository(db);
const custodyEventService = new CustodyEventService(
  custodyEventsRepo,
  custodyOrdersRepo,        // ya instanciado
  alertsQueue,              // ya instanciado en Sprint 6
  env.CUSTODY_EVENT_HMAC_SECRET,
);
app.register(custodyEventsRoutes, {
  prefix: '/orders',
  service: custodyEventService,
});
```

### Definition of Done EVENTS-003
- [ ] TypeScript: 0 errores (`npx tsc --noEmit | head -5`)
- [ ] `GET /orders/:id/event-catalog` retorna 5 items para una orden activa
- [ ] `POST /orders/:id/events` con CHECKPOINT válido retorna 201 con `sequence_no: 1`
- [ ] `POST /orders/:id/events` con orden en DRAFT retorna 409 `ORDER_NOT_ACTIVE_FOR_EVENT`
- [ ] `POST /orders/:id/events` con payload inválido retorna 422 `EVENT_PAYLOAD_INVALID`
- [ ] `POST /orders/:id/events` con PANIC encola job en alertsQueue
- [ ] `order_event` solo tiene INSERTs — nunca UPDATE ni DELETE en todo el módulo
- [ ] `auto_timestamp` siempre se guarda como `null` (Monitor Engine pendiente)

---

## EVENTS-QA-001 — Tests CustodyEventService

**Tipo:** QA_ONLY · **Sprint:** 14 · **Agente:** qa
**Depende de:** EVENTS-003 · **Irreversible:** no

### Checklist SDD
- [ ] schema_verified — tipos del módulo ya definidos en EVENTS-003
- [ ] dependencies_verified — `ajv` ya instalada; `node:crypto` built-in
- [ ] actor_resolution — actorId = UUID string (user_id del JWT)
- [ ] two_person_rule — no aplica

### Archivos a crear

```
apps/api/src/__tests__/custody-events/custody-events.service.test.ts
```

### Spec TDD detallado

**Setup del mock:**
```typescript
// factory explícita para evitar jest hoisting issues (Sprint 4 Custodias pattern)
const mockEventsRepo = {
  findCatalogByVertical: jest.fn(),
  findCatalogEntry: jest.fn(),
  getNextSequenceNo: jest.fn().mockResolvedValue(1),
  create: jest.fn(),
  findByOrder: jest.fn(),
};

const mockOrdersRepo = {
  findById: jest.fn(),
};

const mockAlertsQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockTrx = jest.fn().mockImplementation((table) => ({
  // cadena Knex — patrón establecido en testing-standards.md
}));

// db.transaction() recibe callback con trx
const mockDb = {
  transaction: jest.fn().mockImplementation(async (cb) => cb(mockTrx)),
};
```

**Tests mínimos requeridos (mínimo 22):**

| # | Descripción | Expect |
|---|---|---|
| 1 | getCatalog() retorna catálogo del vertical de la orden | array con 5 items |
| 2 | getCatalog() — ORDER_NOT_FOUND | throws BusinessError ORDER_NOT_FOUND |
| 3 | getCatalog() — ORDER_NOT_ACTIVE_FOR_EVENT (DRAFT) | throws 409 |
| 4-9 | createEvent() it.each(ACTIVE_STATUSES) → acepta | retorna DTO con sequenceNo |
| 10 | createEvent() DRAFT → ORDER_NOT_ACTIVE_FOR_EVENT | throws 409 |
| 11 | createEvent() COMPLETED → ORDER_NOT_ACTIVE_FOR_EVENT | throws 409 |
| 12 | createEvent() event_type no en catálogo → EVENT_TYPE_NOT_FOUND | throws 404 |
| 13 | createEvent() payload falta campo requerido → EVENT_PAYLOAD_INVALID | throws 422 |
| 14 | createEvent() payload campo tipo incorrecto → EVENT_PAYLOAD_INVALID | throws 422 |
| 15 | createEvent() CHECKPOINT happy path | repo.create llamado con integrity_hash |
| 16 | createEvent() PANIC — alertsQueue.add llamado post-commit | add fue llamado 1 vez |
| 17 | createEvent() CARGO_STATUS — alertsQueue.add NO llamado | add no fue llamado |
| 18 | createEvent() integrity_hash tiene 64 chars | hash.length === 64 |
| 19 | createEvent() hash cambia si payload cambia | hash1 !== hash2 |
| 20 | createEvent() sequence_no = 1 en primer evento | dto.sequenceNo === 1 |
| 21 | createEvent() sequence_no = MAX+1 en evento siguiente | mockResolvedValue(3) → dto.sequenceNo === 4 |
| 22 | getEvents() retorna events sin evidence si includeEvidence false | evidence undefined |

### Thresholds de cobertura

```
CustodyEventService: 100% lines / 100% branches
Global: ≥ 75%
```

### Definition of Done EVENTS-QA-001
- [ ] Mínimo 22 tests, todos passing
- [ ] `CustodyEventService` 100% lines y 100% branches en coverage report
- [ ] 0 `any` en el archivo de test
- [ ] `npx jest --testPathPattern=custody-events --coverage` pasa sin errores
- [ ] ACTIVE_STATUSES cubiertos con `it.each` (no tests individuales por estado)
- [ ] Mock de `alertsQueue.add` verifica que se llama con los args correctos en PANIC

---

## Definition of Done del Sprint 14

- [ ] `EVENTS-001`: migraciones M-055 + M-056 aplicadas y rollback limpio
- [ ] `EVENTS-002`: seed 15 aplicado, 20 filas en event_catalog, idempotente
- [ ] `EVENTS-003`: módulo custody-events completo, 3 endpoints funcionales
- [ ] `EVENTS-QA-001`: CustodyEventService 100% lines + 100% branches
- [ ] TypeScript: 0 errores en toda la codebase
- [ ] Cobertura global: ≥ 75%
- [ ] `app.ts` wiring correcto — servidor arranca sin errores con CUSTODY_EVENT_HMAC_SECRET en env
- [ ] `order_event` nunca tiene UPDATE ni DELETE en todo el código del módulo
- [ ] `auto_timestamp` siempre guardado como NULL (Monitor Engine es Sprint 15)
- [ ] Snapshot del módulo actualizado: `context/snapshots/custody-events.snapshot.md`
- [ ] ADR-022 y ADR-023 añadidas a `docs/13_decisions_log.md`
- [ ] `docs/06_memory.md` actualizado con Sprint 14 ✅

---

## Notas por agente

### Backend
- `ajv` ya es dep directa — no agregar otra librería de validación JSON Schema
- Usar `node:crypto` built-in para HMAC — no agregar `crypto-js` ni otras deps
- `order_event` es append-only por diseño — si necesitas "cancelar" un evento, inserta uno nuevo de tipo CANCELLATION (fuera de scope en este sprint, pero el patrón está documentado)
- El ENUM `order_event_actor_role` se crea en la migración — el down debe hacer DROP TYPE después del DROP TABLE
- `getNextSequenceNo()` usa `SELECT MAX(sequence_no) ... FOR UPDATE` — el resultado puede ser NULL si no hay eventos previos → retornar 1 en ese caso

### QA
- Usar `it.each(ACTIVE_STATUSES)` para los 6 estados activos — no tests individuales
- Mock de `alertsQueue` debe ser objeto plano con `add: jest.fn()` — no BullMQ real
- El mock de `db.transaction()` debe invocar el callback con `mockTrx` sincrónicamente para que los tests no sean async complicados
- `integrity_hash` de 64 chars = SHA-256 en hex (32 bytes × 2)
- Para testear que PANIC dispara el enqueue: verificar `mockAlertsQueue.add` fue llamado con `('create-alert', expect.objectContaining({ type: 'panic' }))`

### DevOps
- Aplicar M-055 antes que M-056 (event_catalog no tiene FK a order_event, pero es buena práctica)
- El seed 15 depende de que custody_types ya tenga los 4 slugs (seed 12 del Sprint 1) — verificar antes de ejecutar
- Agregar `CUSTODY_EVENT_HMAC_SECRET` en todos los ambientes (dev, staging, prod) antes de desplegar
