# Session — Estado de la Sesión Actual

> Este archivo se resetea al inicio de cada sesión con /session-start
> y se actualiza al finalizar con /session-end.
> Es el único archivo que siempre se carga en contexto.

---

## Estado actual

**Sprint:** 3 COMPLETO — custody-orders ✅
**Fecha último cierre:** 2026-05-14
**Tipo de tarea próxima:** [VALUE_DECL] — Sprint 4 — value-declaration + mobile UI inicial

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

## Próxima sesión — Sprint 4

**Objetivo:** `value-declaration` + primera pantalla mobile cliente

**Alcance Sprint 4:**
- Módulo value-declaration — schema dinámico por tipo de custodia (JSONB)
- POST /orders/:id/value-declaration — cliente declara valores
- Mobile: pantalla "Crear orden" (flujo cliente) — primera UI funcional
- Primer smoke test E2E (Playwright): crear orden → submit → ver en lista

**Cargar en contexto:**
- `context/project-index.md`
- `context/snapshots/value-declaration.snapshot.md`
- `steering/product.md` (para flujo mobile)

---

## Ambiente actual

- Docker: ✅ 6 servicios corriendo
- BD: ✅ 51 migraciones aplicadas
- TypeScript: ✅ 0 errores
- Tests: ✅ 105/105 custody tests (suite completa sin contar módulos anteriores)
