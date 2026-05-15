# Session — Estado de la Sesión Actual

> Este archivo se resetea al inicio de cada sesión con /session-start
> y se actualiza al finalizar con /session-end.
> Es el único archivo que siempre se carga en contexto.

---

## Estado actual

**Sprint:** 12 PENDIENTE — asignación de equipo + mapa en tiempo real (web admin)
**Fecha de sesión:** 2026-05-14
**Tipo de contexto:** [ADMIN]
**Objetivo:** Sprint 11 completado. Próxima sesión: asignación de custodio/copiloto desde UI + opcional: mapa Mapbox tracking

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

## Sprint 5 — COMPLETO ✅ (2026-05-14)

**Resultado:** custody-tracking GPS tiempo real implementado y aprobado por QA.

**Tareas completadas:**
- [x] TRACK-001: Módulo custody-tracking completo (6 archivos módulo + queue + worker)
- [x] TRACK-QA-001: 35 tests, CustodyTrackingService 100%, geofence.utils 100%
- [x] ADR-014 + ADR-015 documentados
- [x] 6 artefactos de retrospectiva actualizados

---

## Sprint 7 — COMPLETO ✅ (2026-05-14)

**Resultado:** Módulo custody-notifications implementado y aprobado. 44 tests, 100% cobertura.

**Entregables:**
- CustodyNotificationService: FCM push + SMS fallback + CircuitBreaker Redis
- BullMQ worker con routing table 12 estados de orden + alertas critical/high
- Integración con AlertEngine (panic → enqueue) y CustodyOrders (todas las transiciones)
- Migración M-052 aplicada (tabla notifications)
- ADR-017 documentado
- Módulo usa `custody-notifications/` (evita conflicto con UBER_BASE `notifications/`)

---

## Sprint 6 — COMPLETO ✅ (2026-05-14)

**Resultado:** Módulo alerts implementado y aprobado. AlertEngine 100% cobertura (umbral ≥95%).

**Entregables:**
- AlertEngine: panic→INCIDENT, dedup 30s, severity map, supervisor-only critical
- 34 tests, 0 errores TypeScript
- geofence worker refactorizado (severity corregida: geofence_violation = medium)
- ADR-016 documentado

---

## Sprint 9 — COMPLETO ✅ (2026-05-14)

**Resultado:** Módulo custody-scheduler implementado y aprobado. 15 tests, 100% cobertura.

**Entregables:**
- CustodySchedulerService: cron cada minuto, `scanUpcomingReminders` (24h/1h/15m) + `scanDispatchAlerts`
- `custody_scheduled_reminders` table (M-053) con UNIQUE constraint para deduplicación
- `PATCH /orders/:id/schedule` + `DELETE /orders/:id/schedule` en custody-orders
- Nuevos business errors: ORDER_NOT_IN_DRAFT_STATUS, SCHEDULED_AT_TOO_SOON, INVALID_PICKUP_WINDOW
- ADR-019 documentado

---

## Sprint 8 — COMPLETO ✅ (2026-05-14)

**Resultado:** Módulo custody-payments implementado y aprobado. 17 tests, 100% cobertura service.

**Entregables:**
- CustodyPaymentService: cobro Stripe post-COMPLETED, idempotencia, 5 fallback modes
- BullMQ worker con 3 reintentos, backoff exponencial 5s
- Reutilización de IPaymentGateway UBER_BASE (ADR-018)
- GET /orders/:id/payment endpoint
- Sin migración — tabla custody_payments existía desde M-049

---

## Logros de Sprint 10 (2026-05-14)

### COMP-001 — Módulo compliance ✅

**ChainOfCustodyService** — reporte on-demand, redacción por rol, SHA-256, PDF

**Endpoints implementados (3):**
- [x] `GET /orders/:id/chain-of-custody` — JSON report (dispatcher, supervisor, client)
- [x] `GET /orders/:id/chain-of-custody/pdf` — PDF descargable (dispatcher, supervisor)
- [x] `GET /orders/:id/signatures` — transiciones con digital_signature (dispatcher, supervisor)

**Patrones críticos:**
- Redacción automática: `declaredValue` y `signatureData` → `null` para `role === 'client'`
- SHA-256 del contenido JSON (excluye campo `integrity`) — integridad verificable
- `renderToPdf()` separada de `buildPdf()` para testabilidad unitaria
- `pdfkit` pure JS — sin binarios nativos, compatible Railway/Render
- Sin migración — lee de 9 tablas existentes

### Calidad ✅
- TypeScript: 0 errores
- Tests: 28/28 pasando (1 suite compliance)
- ChainOfCustodyService: 100% lines / 100% branches ✅
- ADR-020 documentado

---

## Logros de Sprint 11 (2026-05-14)

### ADMIN-WEB — Dashboard web custodia ✅

**Páginas implementadas (4):**
- `CustodyOrdersPage` `/admin/custody/orders` — listado paginado con filtro estado + búsqueda
- `CustodyOrderDetailPage` `/admin/custody/orders/$id` — detalle + timeline + alertas + PDF + aprobar/rechazar
- `CustodyApprovalsPage` `/admin/custody/approvals` — cola supervisor (auto-refresh 30s)
- `CustodyAlertsPage` `/admin/custody/alerts` — activas/resueltas + resolver (auto-refresh 15s)

**Infraestructura:**
- `api.getBlob()` para descarga PDF cadena de custodia
- Sidebar refactorizado con `NavSection[]` — sección "CUSTODIA" visible/colapsable
- 4 rutas nuevas en `main.tsx`

**Calidad:**
- TypeScript: 0 errores (web + api)
- Sin tests unitarios (web app sin Jest — UI verificada por inspección + compilación)

---

## Próxima sesión — Sprint 12

**Objetivo:** Asignación de equipo desde UI (PATCH /orders/:id/assign) + opcional mapa Mapbox

**Cargar en contexto:**
- `context/snapshots/admin.snapshot.md` (principal)
- `steering/product.md` (actores y flujos)
- `steering/coding-standards.md`

---

## Ambiente actual

- Docker: ✅ 6 servicios corriendo
- BD: ✅ 51 migraciones aplicadas
- TypeScript: ✅ 0 errores
- Tests: ✅ 127/127 custody unit tests (Sprint 3+4, sin integration tests que requieren Docker)
