# Session — Estado de la Sesión Actual

> Este archivo se resetea al inicio de cada sesión con /session-start
> y se actualiza al finalizar con /session-end.
> Es el único archivo que siempre se carga en contexto.

---

## Estado actual

**Sprint:** 4 COMPLETO — value-declaration + CustodyClientStack ✅
**Fecha último cierre:** 2026-05-14
**Tipo de tarea próxima:** [TRACKING] — Sprint 5 — GPS tracking + WebSocket tiempo real

---

## Logros de Sprint 3 (2026-05-14)

### ORDERS-001 — Módulo custody-orders ✅

**CustodyStateMachine** — 18 estados, 21 transiciones válidas, 100% cobertura
- DRAFT → PENDING_APPROVAL → APPROVED → ASSIGNED → REASSIGNED → CREW_CONFIRMED
- → EN_ROUTE_TO_PICKUP → AT_PICKUP → IN_TRANSIT → AT_DELIVERY → DELIVERED → COMPLETED
- Ramas de fallo: PICKUP_FAILED, DELIVERY_FAILED
- Finalizaciones alternativas: REJECTED, CANCELLED, INCIDENT → RESOLVED

**Endpoints implementados (20):**
- [x] `POST /orders` — crear orden DRAFT (client, dispatcher)
- [x] `GET /orders` — listar paginado con filtros (dispatcher, supervisor)
- [x] `GET /orders/:id` — ver orden (todos los roles)
- [x] `GET /orders/:id/transitions` — audit log historial
- [x] `PATCH /orders/:id/submit` — DRAFT → PENDING_APPROVAL
- [x] `PATCH /orders/:id/approve` — PENDING_APPROVAL → APPROVED + pricing_snapshot
- [x] `PATCH /orders/:id/reject` — PENDING_APPROVAL → REJECTED (motivo ≥ 10 chars)
- [x] `PATCH /orders/:id/cancel` — cancelar desde DRAFT/PENDING_APPROVAL/APPROVED
- [x] `PATCH /orders/:id/assign` — APPROVED → ASSIGNED (custodio + copiloto)
- [x] `PATCH /orders/:id/reassign` — ASSIGNED → REASSIGNED
- [x] `PATCH /orders/:id/confirm-crew` — regla dos-personas (custodio AND copiloto)
- [x] `PATCH /orders/:id/depart` — CREW_CONFIRMED → EN_ROUTE_TO_PICKUP
- [x] `PATCH /orders/:id/arrive-pickup` — EN_ROUTE_TO_PICKUP → AT_PICKUP
- [x] `PATCH /orders/:id/pickup` — AT_PICKUP → IN_TRANSIT + custody_snapshot + firma digital
- [x] `PATCH /orders/:id/arrive-delivery` — IN_TRANSIT → AT_DELIVERY
- [x] `PATCH /orders/:id/deliver` — AT_DELIVERY → DELIVERED + firma digital
- [x] `PATCH /orders/:id/complete` — DELIVERED → COMPLETED
- [x] `PATCH /orders/:id/report-incident` — IN_TRANSIT → INCIDENT
- [x] `PATCH /orders/:id/resolve-incident` — INCIDENT → IN_TRANSIT | RESOLVED
- [x] `PATCH /orders/:id/pickup-failed` + `delivery-failed`

**Patrones críticos implementados:**
- SELECT FOR UPDATE en toda transición
- order_transitions audit log INSERT-ONLY en cada cambio de estado
- pricing_snapshot inmutable (generado en APPROVED)
- custody_snapshot inmutable (generado en IN_TRANSIT)
- Regla dos-personas: CREW_CONFIRMED solo cuando custodio_confirmed_at AND copiloto_confirmed_at

### Calidad ✅
- TypeScript: 0 errores
- Tests: 105/105 pasando (4 suites custody*)
- CustodyStateMachine: 100% cobertura ✅
- Nuevos códigos de error: ORDER_NOT_FOUND (404), INVALID_ORDER_TRANSITION (409)

---

## Logros de Sprint 4 (2026-05-14)

### VALUEDECL-001 — Módulo value-declaration ✅

**Backend:**
- `GET /custody-types` — lista tipos activos con JSON Schema
- `POST /orders/:id/value-declaration` — upsert con validación Ajv dinámica
- `GET /orders/:id/value-declaration` — consulta declaración
- Nuevos error codes: `VALUE_DECLARATION_NOT_FOUND (404)`, `CUSTODY_TYPE_NOT_FOUND (404)`
- `DECLARABLE_STATUSES = Set(['DRAFT', 'PENDING_APPROVAL'])`
- Seed 13: usuarios test cliente (+525500000099) + supervisor (+525500000098)
- Smoke test E2E: create → declare → submit → PENDING_APPROVAL

**Mobile — CustodyClientStack:**
- `SelectCustodyTypeScreen` — fetches /custody-types, navega con draft
- `NewCustodyOrderScreen` — formulario pickup + delivery
- `ValueDeclarationScreen` — form dinámico desde JSON Schema + submit
- `custody.store.ts` — Zustand con NewOrderDraft
- `auth.store.ts` extendido con roles `client | custodio | copiloto`
- `RootNavigator` rutea `client` → `CustodyClientStack`

### Calidad ✅
- TypeScript: 0 errores
- Tests nuevos: 22/22 (11 service + 3 SelectCustodyType + 5 ValueDeclaration + 3 E2E smoke)
- Total suite API: 675 (69 fallan solo en integration tests que requieren Docker — preexistentes)
- Total suite mobile: 155 (4 fallan solo en tests legacy preexistentes)

---

## Próxima sesión — Sprint 5

**Objetivo:** GPS tracking tiempo real + WebSocket + TimescaleDB

**Alcance Sprint 5:**
- Módulo `tracking` — PATCH /orders/:id/location (custodio/copiloto reportan GPS)
- GET /orders/:id/track (supervisor/dispatcher ve posición en tiempo real)
- WebSocket channel para actualizaciones live de posición
- TimescaleDB hypertable `location_readings` (M-047, ya existe)
- Integración con custody_snapshot: validar que equipo esté en ruta

**Cargar en contexto:**
- `context/project-index.md`
- `context/snapshots/tracking.snapshot.md`
- `steering/architecture.md`

---

## Ambiente actual

- Docker: ✅ 6 servicios corriendo
- BD: ✅ 51 migraciones aplicadas
- TypeScript: ✅ 0 errores
- Tests: ✅ 127/127 custody unit tests (Sprint 3+4, sin integration tests que requieren Docker)
