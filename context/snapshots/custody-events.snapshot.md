# Snapshot: custody-events

**Estado:** ✅ COMPLETO — Sprint 14 (2026-05-18)
**Módulo:** `apps/api/src/modules/custody-events/`
**Cobertura:** CustodyEventService 100% lines / 100% branches / 100% functions

---

## Archivos del módulo

| Archivo | Estado | Notas |
|---|---|---|
| `custody-events.types.ts` | ✅ | OrderEventActorRole, EventCatalogRow, OrderEventRow, EventCatalogDTO, OrderEventDTO, CreateCustodyEventPayload |
| `custody-events.repository.ts` | ✅ | findCatalogByVertical, findCatalogEntry, getNextSequenceNo (FOR UPDATE), create, findByOrder |
| `custody-events.service.ts` | ✅ | getCatalog, createEvent, getEvents, calculateIntegrityHash, validatePayload |
| `custody-events.controller.ts` | ✅ | getCatalog, createEvent, getEvents handlers |
| `custody-events.routes.ts` | ✅ | GET /:id/event-catalog, POST /:id/events, GET /:id/events |

## Tests

| Archivo | Tests | Estado |
|---|---|---|
| `src/__tests__/custody-events/custody-events.service.test.ts` | 40 | ✅ 100% cobertura |

## Migraciones

| # | Archivo | Estado |
|---|---|---|
| M-055 | `20260518_055_create_event_catalog.ts` | ✅ Aplicada |
| M-056 | `20260518_056_create_order_event.ts` | ✅ Aplicada (FK: companies, no tenants) |

## Seeds

| # | Archivo | Estado |
|---|---|---|
| S-015 | `15_event_catalog.ts` | ✅ Aplicada — 20 filas (5 tipos × 4 verticales) |

---

## Endpoints

| Método | Path | Roles | Descripción |
|---|---|---|---|
| GET | `/orders/:id/event-catalog` | custodio, copiloto, supervisor, dispatcher | Catálogo de eventos por vertical de la orden |
| POST | `/orders/:id/events` | custodio, copiloto | Registrar evento de custodia |
| GET | `/orders/:id/events` | custodio, copiloto, supervisor, dispatcher | Listar eventos paginados |

---

## Invariantes clave

- `order_event` es **append-only** — nunca UPDATE/DELETE
- `sequence_no` se asigna con `SELECT MAX() FOR UPDATE` dentro de la transacción (anti-replay)
- `integrity_hash` es HMAC-SHA256 calculado por el servidor (ADR-022) — el cliente no lo envía
- Solo se puede crear evento si la orden está en `ACTIVE_STATUSES` = `[EN_ROUTE_TO_PICKUP, AT_PICKUP, IN_TRANSIT, AT_DELIVERY, INCIDENT, RESOLVED]`
- `auto_timestamp` es `null` — se llenará por Monitor Engine (Sprint 15)
- PANIC event dispara `alertsQueue.add('create-alert', ...)` FUERA de la transacción (ADR-003)
- `evidence` se omite del DTO por defecto — solo se incluye con `include_evidence=true` (supervisor/dispatcher)

---

## Dependencias

- `CustodyOrdersRepository.findById` — verifica que la orden existe y está activa
- `db('custody_types')` — resuelve `vertical_slug` desde `custody_type_id` de la orden
- `alertsQueue: Queue` — BullMQ para side-effects PANIC (wired como custodyNotificationsQueue en app.ts)
- `CUSTODY_EVENT_HMAC_SECRET` — env var mínimo 32 chars, requerida en `.env` y `jest.env.setup.js`
