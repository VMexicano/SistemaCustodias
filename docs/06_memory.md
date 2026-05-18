# Memory — Estado Vivo del Proyecto

> Este documento se actualiza con cada sesión de trabajo. Refleja el estado actual real del proyecto, lo que está en progreso, y lo que viene a continuación.
>
> **Última actualización:** 2026-05-18 (sesión 5) — Sprint 14 CustodyEvent Envelope completo: event_catalog (M-055) + order_event (M-056) + seed 15 aplicados. Módulo custody-events: 3 endpoints, CustodyEventService 100% cobertura, 40 tests. ADR-022 + ADR-023. Fix FK tenants→companies en M-056.

---

## Estado por Módulo

| Módulo | Estado | Notas |
|---|---|---|
| Arquitectura | ✅ Definida | Monolito modular, stack completo |
| Schema BD | ✅ Completo | 51 migraciones aplicadas (M-01→M-51). Todas tablas custodia creadas. |
| **Sistema de agentes** | ✅ Completo | 7 agentes + orchestrator 4 fases + handoff protocol + /team skill |
| **Skills (.claude/skills/)** | ✅ Completo | 10 skills: 4 especialización + 6 operacionales. Vinculadas a los 7 agentes. |
| **Commands (.claude/commands/)** | ✅ Completo | 7 commands: session-start/end, status, module, plan, team, agent |
| Auth (custodia) | ✅ Sprint 1 | 5 roles custodia, `tenant_id` en JWT, TenantMiddleware, 36 unit tests |
| Users | ✅ Completo | Sprint 2: GET/PATCH /users/me, Stripe SetupIntent, audit_logs |
| Drivers | ✅ Completo | Sprint 3: 11 endpoints, service_modes multi-vertical, admin doc review, 114 tests |
| Trips | ✅ Completo | Sprint 17: approval flow (ADR-047), 12 endpoints, 60 SM tests, actor dispatcher |
| Pricing Engine | ✅ Completo | Sprint 4: PricingEngine 100%, POST /trips/estimate, 28 tests |
| Realtime | ✅ Completo | Sprint 4: Socket.io /passenger /driver, auth JWT, 27 tests |
| Payments | ✅ Completo | Sprint 5: PaymentService + Stripe test mode + BullMQ worker + circuit breaker |
| Tracking (UBER_BASE) | ✅ Completo | Sprint 7: TrackingService, GET /trips/:id/track, migration 030 device_tokens |
| Custody Tracking | ✅ Sprint 5 | GPS custody: POST /tracking/location, GET current|history, WebSocket /tracking, geofence worker, 35 tests 100% cobertura |
| Notifications | ✅ Completo | Sprint 5: NotificationService + INotificationChannel + BullMQ worker + circuit breaker |
| Scheduler | ✅ Completo | Sprint 6: cron cada minuto, SCHEDULED state, recordatorios 24h/1h/15m |
| Custody Scheduler | ✅ Sprint 9 | Recordatorios 24h/1h/15m + dispatch alerts, PATCH/DELETE /orders/:id/schedule, 15 tests 100% cobertura, ADR-019 |
| Compliance | ✅ Sprint 10 | Cadena de custodia JSON + PDF + firmas, SHA-256, redacción por rol, 28 tests 100% cobertura, ADR-020 |
| Admin Web Custody | ✅ Sprint 11 + fix | 4 páginas custody. CustodyApprovalsPage corregida: campos camelCase (orderNumber, pickupAddress, deliveryAddress, createdAt) + optional chaining en addresses |
| Custody Routing | ✅ Sprint 13 | POST/GET/PATCH /orders/:id/route, haversine distance, estimación duración, aprobación supervisor, geofence worker mejorado, 22 tests 100% cobertura, ADR-021 |
| Custody Events | ✅ Sprint 14 | event_catalog por vertical + order_event envelope. GET event-catalog, POST events, GET events. HMAC-SHA256 integrity, Ajv payload validation, anti-replay sequence_no. 40 tests 100% cobertura, ADR-022 + ADR-023 |
| Admin | ✅ Completo | Sprint 6 + hotfix 2026-04-23: trips retorna array estructurado con origin/destinations, coords numéricas |
| Mobile App | ✅ Sprint 14 + debug | CustodyOperatorStack+ClientStack completos, AddressPickerField, SessionMenuButton en todos los flujos/estados, fix res.data.id en NewCustodyOrderScreen, app.json launchMode:most-recent (APK rebuild pendiente), Reactotron 9091/4567 |
| Panel Web | ✅ Completo | Sprint 11 ✅ · AdminLayout + 6 páginas · título dinámico desde vertical config |
| Infraestructura | ✅ Completo | Sprint 1: monorepo, docker-compose, API base, 22 migraciones, seeds, Jest, Playwright, CI |
| Tests | 🔲 No iniciado | Estrategia definida |

**Leyenda:** ✅ Completo · 🔄 En progreso · ⚠️ Bloqueado · 🔲 No iniciado

---

## Próximas Tareas — Orden Recomendado

### Sprint 14 SistemaCustodias — CustodyEvent Envelope ✅ COMPLETO (2026-05-18)
```
[x] EVENTS-001: Migraciones M-055 (event_catalog) + M-056 (order_event ENUM + tabla)
    [x] event_catalog: UNIQUE(vertical_slug, code), FK custody_types(slug)
    [x] order_event: ENUM order_event_actor_role, UNIQUE(order_id, sequence_no), FK companies
    [x] Fix: FK referencia companies(id), no tenants (tabla no existe en este proyecto)
[x] EVENTS-002: Seed 15 — 20 filas (5 tipos × 4 verticales) idempotente con onConflict().ignore()
[x] EVENTS-003: Módulo custody-events completo
    [x] custody-events.types.ts — OrderEventActorRole, EventCatalogRow, OrderEventRow, DTOs
    [x] custody-events.repository.ts — 5 métodos, getNextSequenceNo con FOR UPDATE
    [x] custody-events.service.ts — getCatalog, createEvent (Ajv + HMAC + trx), getEvents
    [x] custody-events.controller.ts + custody-events.routes.ts
    [x] business-error.ts: ORDER_NOT_ACTIVE_FOR_EVENT, EVENT_TYPE_NOT_FOUND, EVENT_PAYLOAD_INVALID, DUPLICATE_SEQUENCE_NO
    [x] environment.ts: CUSTODY_EVENT_HMAC_SECRET añadido
    [x] app.ts: CustodyEventsRepository + CustodyEventService + custodyEventsRoutes wired
    [x] .env + jest.env.setup.js: CUSTODY_EVENT_HMAC_SECRET con valor dev
[x] EVENTS-QA-001: 40 tests — CustodyEventService 100% lines/branches/functions ✅
    [x] getCatalog: ORDER_NOT_FOUND, ORDER_NOT_ACTIVE_FOR_EVENT (it.each), slug resolution, catalog map
    [x] createEvent: todas las validaciones, happy path con PANIC, integrity_hash calculado por servidor
    [x] getEvents: paginación, include_evidence flag
[x] ADR-022: integrity_hash calculado por servidor — no confiar en cliente
[x] ADR-023: event_catalog keyed por (vertical_slug, code)
[x] TypeScript: 0 errores
[x] M-055 + M-056 aplicadas — Seed 15 ejecutada
```

### Sprint 12 SistemaCustodias — admin web: assign/reassign + alerts badge ✅ COMPLETO (2026-05-14)
```
[x] ADMIN-12-001: GET /operadores/available con nombres (JOIN users)
    [x] operadores.types.ts: firstName? + lastName? en OperatorDTO
    [x] operadores.repository.ts: findAvailable JOIN users → first_name, last_name
    [x] operadores.service.ts: toDTO propaga campos nombre
[x] ADMIN-12-002: Modal asignación en CustodyOrderDetailPage (status APPROVED)
    [x] GET /operadores/available lazy (enabled cuando modal abierto)
    [x] Selects filtrados custodio/copiloto con label nombre + licencia
    [x] Validación: ambos seleccionados + no mismo operador en los dos roles
    [x] PATCH /orders/:id/assign → invalidate query orden
[x] ADMIN-12-003: Modal reasignación (status ASSIGNED/REASSIGNED)
    [x] Pre-selección de equipo actual (order.custodio_id + copiloto_id)
    [x] PATCH /orders/:id/reassign
[x] ADMIN-12-004: useCustodyAlertCount hook + Sidebar badge activo
    [x] GET /alerts?resolved=false refetch 30s
    [x] Sidebar: badge rojo en "Alertas" custody cuando count > 0
[x] TypeScript: 0 errores (api + web)
```

### Sprint 11 SistemaCustodias — módulo admin web ✅ COMPLETO (2026-05-14)
```
[x] ADMIN-WEB-001: Infraestructura web
    [x] api.getBlob() — descarga binaria para PDF cadena de custodia
    [x] Sidebar.tsx refactorizado — NavSection[] multi-sección con sección "CUSTODIA"
    [x] main.tsx — 4 rutas nuevas /admin/custody/*
[x] ADMIN-WEB-002: CustodyOrdersPage (/admin/custody/orders)
    [x] Listado paginado (LIMIT 20), filtro por estado, búsqueda local por order_number
    [x] Tabla: order_number, status badge, origen, destino, programada, creada, link Ver
    [x] Paginación anterior/siguiente
[x] ADMIN-WEB-003: CustodyOrderDetailPage (/admin/custody/orders/$id)
    [x] Header: order_number, status badge, acciones (aprobar/rechazar si PENDING_APPROVAL, descargar PDF)
    [x] Cards: Ruta (pickup+delivery), Pricing snapshot, Equipo, Detalles
    [x] Timeline transiciones: from→to, actor_role, timestamp, notas, badge firmado
    [x] Alertas de la orden: severity badge, tipo, descripción, activa/resuelta
    [x] Modal rechazo: reason mínimo 10 chars
[x] ADMIN-WEB-004: CustodyApprovalsPage (/admin/custody/approvals)
    [x] Cola PENDING_APPROVAL (auto-refresh 30s)
    [x] Cards por orden: rutas, programada, notas + botones Aprobar/Rechazar
    [x] Modal rechazo con validación
[x] ADMIN-WEB-005: CustodyAlertsPage (/admin/custody/alerts)
    [x] Tabs Activas (auto-refresh 15s) / Resueltas
    [x] Filtro por severidad
    [x] Badges severidad coloreados, highlight rojo para critical
    [x] Botón Resolver por alerta activa
    [x] Summary críticas/altas en header
[x] TypeScript: 0 errores (web + api)
```

### Sprint 10 SistemaCustodias — módulo compliance ✅ COMPLETO (2026-05-14)
```
[x] COMP-001: módulo compliance completo
    [x] compliance.types.ts — ChainOfCustodyReport, TransitionRecord, AlertRecord, SignatureRecord
    [x] compliance.repository.ts — 6 métodos con JOINs multi-tabla
    [x] chain-of-custody.service.ts — buildReport (redacción por rol), getSignatures, buildPdf, renderToPdf
    [x] compliance.controller.ts — 3 handlers
    [x] compliance.routes.ts — 3 rutas con auth (GET /chain-of-custody, /pdf, /signatures)
    [x] pdfkit instalado como dep directa en apps/api
    [x] SHA-256 via node:crypto built-in (sin deps extra)
    [x] app.ts: ComplianceRepository + ChainOfCustodyService registrado en prefix /orders
    [x] jest.config.ts: exclusiones compliance repo/controller/routes
    [x] Sin migración (lee de 9 tablas existentes)
[x] COMP-QA-001: 28 tests — chain-of-custody.service.test.ts
    [x] ChainOfCustodyService: 100% lines / 100% branches ✅
    [x] Casos: reporte completo dispatcher, redacción client (declaredValue+signature null),
        POINT parsing, ORDER_NOT_FOUND, no custodio/copiloto, no vehicle, no valueDeclaration,
        no alerts, no transitions, completedAt null, SHA-256 determinístico, SHA-256 cambia,
        null actor names (buildReport + getSignatures), verified_at null, resolved_at null,
        vehicle columns null, client undefined, invalid POINT format, PDF Buffer, renderToPdf branches
[x] ADR-020: reporte on-demand + node:crypto SHA-256 + pdfkit
[x] TypeScript: 0 errores
```

### Sprint 9 SistemaCustodias — módulo custody-scheduler ✅ COMPLETO (2026-05-14)
```
[x] SCHED-CUST-001: módulo custody-scheduler completo
    [x] custody-scheduler.repository.ts — getOrdersNeedingReminders (FOR UPDATE SKIP LOCKED), getUnassignedOpenOrders, markReminderSent
    [x] custody-scheduler.service.ts — cron cada minuto, scanUpcomingReminders + scanDispatchAlerts
    [x] business-error.ts: ORDER_NOT_IN_DRAFT_STATUS (409), SCHEDULED_AT_TOO_SOON (422), INVALID_PICKUP_WINDOW (422)
    [x] custody-orders.types.ts: CustodyOrderDTO extendido con pickupWindowStart + pickupWindowEnd
    [x] custody-orders.repository.ts: +updateSchedule()
    [x] custody-orders.service.ts: +scheduleOrder() + unscheduleOrder()
    [x] custody-orders.controller.ts: +schedule() + unschedule()
    [x] custody-orders.routes.ts: PATCH /:id/schedule + DELETE /:id/schedule
    [x] migración M-053: tabla custody_scheduled_reminders (ya existía)
    [x] jest.config.ts: custody-scheduler.repository.ts excluido de cobertura unitaria
[x] SCHED-CUST-QA-001: 15 tests — custody-scheduler.service.test.ts
    [x] CustodySchedulerService: 100% lines / 100% branches ✅
    [x] Casos: reminders happy path, múltiples tipos, sin órdenes, dedup-first, enqueue fallo no-fatal,
        dispatch alerts happy path, dispatch sin órdenes, tick() callback, tick() error swallow,
        start/stop lifecycle
[x] ADR-019: cron + FOR UPDATE SKIP LOCKED + custody_scheduled_reminders (dedup idempotente)
[x] TypeScript: 0 errores
```

### Sprint 8 SistemaCustodias — módulo custody-payments ✅ COMPLETO (2026-05-14)
```
[x] PAY-CUST-001: módulo custody-payments completo
    [x] custody-payments.types.ts — CustodyPayment, CustodyPaymentStatus, CustodyPaymentJobData
    [x] custody-payments.repository.ts — findByOrderId, create, updateStatus
    [x] custody-payments.service.ts — getByOrderId, processPayment (idempotencia + fallbacks)
    [x] custody-payments.controller.ts — GET /orders/:id/payment
    [x] custody-payments.routes.ts
    [x] custody-payments.queue.ts — BullMQ Queue 'custody-payments' (3 reintentos exp. backoff 5s)
    [x] custody-payment-worker.ts — procesa 'process-payment' jobs
    [x] business-error.ts: INVALID_ORDER_STATUS_FOR_PAYMENT (409)
    [x] custody-orders.controller.ts modificado — +enqueue custodyPaymentsQueue en complete()
    [x] custody-orders.routes.ts modificado — acepta paymentsQueue opcional
    [x] app.ts wiring — CustodyPaymentsRepository + CustodyPaymentService + controller + worker
    [x] Sin migración — tabla custody_payments ya existía desde M-049 (Sprint 1 infra)
[x] PAY-CUST-QA-001: 17 tests — custody-payment-service.test.ts
    [x] CustodyPaymentService: 100% lines / 100% branches (umbral: ≥80%/75%) ✅
    [x] Casos: ORDER_NOT_FOUND, INVALID_ORDER_STATUS_FOR_PAYMENT, idempotencia, pricing_snapshot_missing,
        client_not_found, no_payment_method_on_file (×2 branches), gateway success (×2), gateway failure,
        truncación 255 chars, non-Error rejection, Math.round cents
[x] ADR-018: IPaymentGateway UBER_BASE reutilizada en módulo custody separado
[x] TypeScript: 0 errores
```

### Sprint 7 SistemaCustodias — módulo custody-notifications ✅ COMPLETO (2026-05-14)
```
[x] NOTIF-001: módulo custody-notifications completo
    [x] custody-notifications.types.ts — CustodyNotification, SendCustodyNotificationPayload, NotifyOrderTransitionPayload, NotifyAlertPayload, CustodyNotificationJobData
    [x] custody-notifications.repository.ts — create, updateStatus, findByOrderId
    [x] custody-notifications.service.ts — FCM push primary + SMS fallback + CircuitBreaker
    [x] sms.client.ts — ISmsClient + LogSmsClient (MVP)
    [x] circuit-breaker.ts — closed/open/half-open en Redis (threshold 5/60s, cooldown 5min)
    [x] custody-notifications.queue.ts — BullMQ Queue 'custody-notifications'
    [x] custody-notification-worker.ts — routing table 12 estados + alert routing
    [x] migración M-052 — tabla notifications (applied ✅)
    [x] alert-engine.ts modificado — +notificationsQueue (4to param opcional)
    [x] custody-orders.controller.ts modificado — +enqueue en todas las transiciones
    [x] app.ts wiring — CircuitBreaker + LogSmsClient + CustodyNotificationService + worker
[x] NOTIF-QA-001: 44 tests — circuit-breaker.test.ts (24) + custody-notification-service.test.ts (20)
    [x] CircuitBreaker: 100% lines / 100% branches (umbral: ≥90%/85%) ✅
    [x] CustodyNotificationService: 100% lines / 100% branches (umbral: ≥80%/75%) ✅
[x] ADR-017: CustodyNotificationService FCM+SMS+CircuitBreaker (módulo separado del UBER_BASE)
[x] TypeScript: 0 errores
```

### Sprint 6 SistemaCustodias — módulo alerts ✅ COMPLETO (2026-05-14)
```
[x] ALERTS-001: módulo alerts completo
    [x] alerts.types.ts — AlertType, Severity, SecurityAlert, CreateAlertPayload
    [x] alerts.repository.ts — create, findById, findAll, findByOrderId, resolve, countRecentPanic
    [x] alert-engine.ts — validateOrderForAlert, createAlert (dedup panic 30s), resolveAlert (supervisor-only critical)
    [x] alerts.controller.ts
    [x] alerts.routes.ts (POST /alerts, GET /alerts, GET /alerts/:id, PATCH /alerts/:id/resolve, GET /orders/:id/alerts)
    [x] business-error.ts: ALERT_NOT_FOUND, ALERT_ALREADY_RESOLVED, PANIC_ALERT_TOO_SOON, ORDER_NOT_ACTIVE_FOR_ALERT, ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL
    [x] geofence-check.worker.ts refactorizado → usa AlertEngine (severity geofence_violation corregida: high→medium)
    [x] app.ts wiring — AlertEngine + alertsRoutes + registerGeofenceWorker con alertEngine
[x] ALERTS-QA-001: 34 tests — alert-engine.test.ts
    [x] AlertEngine: 100% lines / 100% branches (umbral: ≥95% / ≥90%) ✅
    [x] validateOrderForAlert: 8 tests — ORDER_NOT_FOUND, ORDER_NOT_ACTIVE_FOR_ALERT, OPERATOR_NOT_ASSIGNED, todos los ALERTABLE_STATUSES
    [x] createAlert: 8 tests — panic flow, dedup, severity map it.each, location, reportIncident non-fatal
    [x] resolveAlert: 8 tests — NOT_FOUND, ALREADY_RESOLVED, supervisor-only critical, roles no-críticos
    [x] BusinessError codes: 5 tests
[x] ADR-016: AlertEngine como autoridad central (geofence worker refactorizado)
[x] TypeScript: 0 errores
```

### Sprint 5 SistemaCustodias — custody-tracking GPS ✅ COMPLETO (2026-05-14)
```
[x] TRACK-001: módulo custody-tracking completo
    [x] custody-tracking.types.ts
    [x] custody-tracking.repository.ts (insertReading, getCurrentLocation, getHistory)
    [x] custody-tracking.service.ts (validación de estado, operador asignado, Socket.io broadcast, BullMQ enqueue)
    [x] custody-tracking.controller.ts
    [x] custody-tracking.routes.ts (POST /tracking/location, GET /tracking/:orderId/current|history, WS namespace)
    [x] geofence.utils.ts (haversineDistance, distanceToPolyline, isOutsideRoute)
    [x] geofence.queue.ts (BullMQ Queue 'geofence-check')
    [x] geofence-check.worker.ts (verifica desvío 500m, INSERT security_alerts deduplicado 60s)
    [x] business-error.ts: ORDER_NOT_TRACKABLE (409), OPERATOR_NOT_ASSIGNED (403), NO_LOCATION_DATA (404)
    [x] app.ts wiring
[x] TRACK-QA-001: 35 tests (32 backend + 3 QA gap closure)
    [x] CustodyTrackingService: 100% lines / 100% branches
    [x] geofence.utils: 100% lines / 100% branches
[x] ADR-014: custody-tracking módulo separado del TrackingService UBER_BASE
[x] ADR-015: setIo() post-construcción para Socket.io namespace injection
[x] TypeScript: 0 errores
```

### Sprint 4 SistemaCustodias — value-declaration + CustodyClientStack ✅ COMPLETO (2026-05-14)
```
[x] VALUEDECL-001: ValueDeclarationRepository (findCustodyType, listActiveCustodyTypes, findByOrderId, upsert)
[x] VALUEDECL-001: ValueDeclarationService (Ajv JSON Schema validation, DECLARABLE_STATUSES, SELECT FOR UPDATE)
[x] VALUEDECL-001: POST /orders/:id/value-declaration — upsert con validación dinámica
[x] VALUEDECL-001: GET /orders/:id/value-declaration — consulta declaración
[x] VALUEDECL-001: GET /custody-types — lista tipos activos con schemas
[x] VALUEDECL-001: Seed 13 — client (+525500000099) + supervisor (+525500000098) usuarios test
[x] VALUEDECL-001: E2E smoke test (custody-order-flow.spec.ts) — create → declare → submit → PENDING_APPROVAL
[x] MOBILE-001: custody.store.ts — Zustand con NewOrderDraft + setDraft + clearDraft
[x] MOBILE-001: SelectCustodyTypeScreen — fetches /custody-types, FlatList con testIDs
[x] MOBILE-001: NewCustodyOrderScreen — formulario pickup + delivery addresses
[x] MOBILE-001: ValueDeclarationScreen — form dinámico desde JSON Schema, POST + PATCH submit
[x] MOBILE-001: CustodyClientStack — Stack navigator 3 pantallas
[x] MOBILE-001: RootNavigator rutea role='client' → CustodyClientStack
[x] MOBILE-001: auth.store.ts extendido con 'client' | 'custodio' | 'copiloto'
[x] Tests nuevos: 22/22 (11 service + 3 SelectCustodyType + 5 ValueDeclaration + 3 E2E smoke) ✅
[x] TypeScript: 0 errores ✅
```

### Sprint 1–3 SistemaCustodias ✅ COMPLETO (2026-05-14)
```
[x] INFRA-000: Docker renombrado a custodias_* (6 servicios activos)
[x] INFRA-001: 13 migraciones M-39→M-51 (custody_types, clients, custody_vehicles, operators,
              custody_orders, value_declarations, order_transitions, security_alerts,
              location_readings hypertable, pricing_rules, custody_payments,
              ALTER companies + user_roles CHECK)
[x] INFRA-002: Seed 12_custody_types — 4 tipos con JSON Schema
[x] AUTH-001: JWT extendido — tenant_id en payload, 5 roles custodia
[x] AUTH-002: TenantMiddleware — 403 TENANT_REQUIRED en rutas custodia
[x] CLIENTS-001: CRUD clientes (POST/GET/PATCH/DELETE /clients + GET /clients/me)
[x] OPERATORS-001: CRUD operadores (disponibilidad, suspensión, estado)
[x] ORDERS-001: CustodyStateMachine 18 estados + 20 endpoints + audit log + snapshots
[x] Tests: 127/127 unit tests ✅ · TypeScript: 0 errores ✅
```

### Sprint 1 — Fundamentos UBER_BASE ✅ COMPLETO (2026-04-05)
```
[x] Setup del repositorio (monorepo Turborepo + pnpm workspaces)
[x] docker-compose con 6 servicios (TimescaleDB, Redis, Bull Board, Prometheus, Grafana, Jaeger)
[x] Variables de entorno con validación Zod (fail-fast)
[x] Conexión a PostgreSQL + Redis con reconexión automática
[x] 22 migraciones Knex en orden FK (migration 015 = hypertable trip_locations)
[x] Seeds idempotentes (region MX, trip_types, pricing_factors, admin user)
[x] Jest + Testcontainers v10 (API modular) con thresholds por módulo
[x] Playwright configurado (specs E2E en Sprint 6)
[x] GitHub Actions CI (lint + type-check + test + cache pnpm + turbo)
```
Pendiente de ejecución local: `knex migrate:latest` + `knex seed:run`

### Sprint 2 — Auth y Usuarios ✅ COMPLETO (2026-04-05)
```
[x] POST /auth/register
[x] POST /auth/verify-phone (OTP vía LogOTPChannel/FirebaseOTPChannel — sin Twilio, ADR-018)
[x] POST /auth/login
[x] POST /auth/refresh (rotación con blacklist híbrida PostgreSQL+Redis, ADR-016)
[x] GET/PATCH /users/me + audit_logs
[x] POST/GET /users/me/payment-methods (Stripe SetupIntent, ADR-017)
[x] 48 tests unitarios — auth.service (19), jwt.service (14), users.service (5), etc.
[ ] Tests integración — escritos, requieren Docker activo para ejecutar
```
Pendiente local: `knex migrate:latest` (migración 023) + `docker compose up` + `pnpm test`

### Sprint 3 — Conductores (sem 5-6) ✅ COMPLETO (2026-04-06)
```
[x] POST /drivers/register
[x] GET/PATCH /drivers/me
[x] GET /drivers/me/documents + POST /drivers/me/documents (submit)
[x] GET/POST /drivers/me/vehicles
[x] POST /drivers/me/go-online (R-DRV-001: approved + no expired docs + active vehicle)
[x] POST /drivers/me/go-offline
[x] PATCH /drivers/me/location (Redis HSET, TTL 5 min)
[x] PATCH /admin/documents/:documentId (review + auto-approve R-DRV-003)
[x] service_modes TEXT[] — soporte multi-vertical (ADR-021)
[x] Migraciones 024-027 (drivers schema, vehicles status, trip_types service_mode, doc unique)
[x] Seed 05: document_requirements MX (5 tipos)
[x] 114 tests (26 unit + 88 integration) — 100% pass
```

### Sprint 4 — Ciclo de Viaje (sem 7-9) ✅ COMPLETO (2026-04-06)
```
[x] PricingEngine: estimate(), recalculate(), haversine inline, factores stackable
[x] POST /trips/estimate con desglose completo y pricing_snapshot
[x] POST /trips (crear viaje REQUESTED → SEARCHING + BullMQ timeout 300s)
[x] TripStateMachine: 11 transiciones, 3 actores, política cancelación $50 MXN
[x] 8 endpoints REST: accept, status, cancel, destination, active, history
[x] WebSocket /passenger y /driver con auth JWT, rooms trip:{id}
[x] Seed commission_rules 20% MX (aprobado, pendiente ejecución)
[x] Migración 028: actor_type en trip_status_history
[x] pricing-engine.test.ts: 22 tests, 100% coverage
[x] trip-state-machine.test.ts: 47 tests, 100% coverage
[x] trips.integration.test.ts: 22 tests E2E + concurrencia
[x] realtime.test.ts: 27 tests auth + eventos + rooms
[x] BullMQ instalado: pnpm add bullmq @uber-base/api
[x] socket.io instalado: pnpm add socket.io socket.io-client @uber-base/api
[x] Paradigma agentes paralelos documentado (CLAUDE.md + orchestrator.md)
[x] Output compacto de agentes documentado (backend.md + qa.md)
```

### Sprint 5 — Pagos y Notificaciones (sem 10-11) ✅ COMPLETO (2026-04-07)
```
[x] PaymentService con Stripe (IPaymentGateway + StripePaymentGateway)
[x] Stripe test mode via sk_test_xxx (sin cambios de código entre ambientes)
[x] BullMQ worker: payment (circuit breaker opossum 10s/30%/120s)
[x] BullMQ worker: notification (circuit breaker opossum 5s/50%/30s)
[x] NotificationService con INotificationChannel (LogChannel dev, FCMChannel prod)
[x] GET /trips/:id/payment endpoint
[x] trips.service: enqueue payment on COMPLETED + emitTripStatusChanged
[x] Migration 029: stripe_customer_id nullable en passenger_payment_methods
[x] ADR-027 (opossum), ADR-028 (notification channel abstract)
[x] Tests: payment.service 100%/96%, notification.service 100% — 40 tests
[ ] SMS fallback via Twilio (descoped — Sprint 6+)
```

### Sprint 6 — Viajes Programados y Admin (sem 12-13) ✅ COMPLETO (2026-04-07)
```
[x] Scheduler con node-cron cada minuto (activación SCHEDULED → REQUESTED)
[x] Recordatorios 24h/1h/15m via NotificationQueue
[x] POST/GET/DELETE /trips/schedule (estado SCHEDULED en TripStateMachine)
[x] Dashboard admin: GET /admin/stats|trips|drivers|errors
[x] Gestión de errores: PATCH /admin/errors/:id/resolve
[x] Panel de configuración: GET/PATCH pricing/factors, commissions, trip-types con audit log
[x] Vite 5 + React 19 (migrado de Next.js 14) + TanStack Router + TanStack Query + Tailwind
[x] Login admin 2-pasos, dashboard con refresh 30s, config page
[x] 287/287 unit tests · ADR-029 + ADR-030
[ ] Smoke tests con Playwright (descoped — Sprint 7)
```

### Sprint 7 — Mobile MVP (sem 14-16) ✅ COMPLETO — E2E setup en progreso
```
[x] App pasajero: Home, Estimate, ActiveTrip (MOB-002)
[x] App conductor: Online, TripRequest, ActiveTrip (MOB-003)
[x] Tracking GPS con tolerancia offline (MOB-004)
[x] Notificaciones push en mobile (MOB-005)
[x] Tests mobile: 43/43 · 90.2% statements (antes 64.33%)
[x] Setup E2E Detox: adb, AVD, TEST_OTP_BYPASS, proyecto Android bootstrapped
[x] Seed 07: usuarios de prueba pasajero y conductor
[x] Compilar APK debug y ejecutar pnpm test:e2e — 10/10 ✅ (2026-04-21)
```

### Sprint 8 — Expo Bare + Mapbox + UX Pasajero + Backoffice (2026-04-23) ✅ COMPLETO
```
[x] Migración a Expo Bare Workflow (apps/mobile-v2, SDK 54) — ADR-032
[x] Mapbox integration (reemplaza Google Maps) — ADR-031
[x] HomeScreen: followUserLocation + modo picking en mapa + geocoding 30km priority
[x] EstimateScreen: mapa preview + precios inline paralelos + desglose expandible
[x] Backoffice login con admin_users separado (bcrypt, sin OTP) — ADR-033
[x] ConfigPage: trip types (editar + crear), pricing factors, comisiones
[x] Migration 031: description en trip_types · Migration 032: admin_users + audit_logs
[x] Build APK funcional: ninja 1.12.1 + node-linker=hoisted + Junction C:\u
[x] Commits: 9a3bb58 + e0226e9
[ ] Rebuild APK tras instalar @react-native-community/datetimepicker (Sprint 9)
```

### Sprint 13 — Backend Vertical Data Models ✅ IMPLEMENTADO (2026-04-27) — pendiente devops
```
[x] VERT13-001: Migration 036 — temperature_readings (hypertable) + custody_events + alter tables
[x] VERT13-002: Seed 10 — document requirements por vertical + features JSONB actualizados
[x] VERT13-003: Módulo custody_events — POST/GET /trips/:id/custody (append-only, 13 tests)
[x] VERT13-004: Módulo temperature_readings — POST/GET /trips/:id/temperature (11 tests)
[x] VERT13-005: Extender PricingEngine — fixed_rate + per_weight_km (28 tests, 100% coverage)
[x] SP13-QA-001: custody 100% + temperature 100% + pricing-engine 100% — 51 tests total
[ ] DEVOPS: knex migrate:latest + seed 10 (pendiente aprobación al iniciar siguiente sesión)
```

### Sprint 14 — Mobile Vertical-aware UX ✅ COMPLETO (2026-04-28)
```
[x] MOB14-001: CargoDeclarationScreen — form cargo + POST /trips con metadata.cargo
[x] MOB14-002: TemperatureLogScreen — lectura manual + auto POST 5min + indicador setpoints
[x] MOB14-003: CustodyEventScreen — historial eventos, selector tipo, expo-image-picker, POST
[x] MOB14-004: Integración PassengerStack/DriverStack + EstimateScreen + ActiveTripScreen condicional
[x] SP14-QA-001: 22 tests nuevos (5+6+7+4) — 117 total — TypeScript 0 errores
[x] Migration 037: unique index document_requirements(region_id, code, vertical_id)
[x] expo-image-picker@15.0.7 añadido a mobile-v2
[x] Devops Sprint 13 aplicado: migration 036 + migration 037 + seed 10
Commits: (sprint14 commit)
```

### Sprint 17 — Flujo Aprobación Multi-vertical ✅ COMPLETO (2026-05-07)
```
[x] TRIPS17-001: Migration 038 — approved_at + approved_by FK admin_users en trips
[x] TRIPS17-002: TripStateMachine — 5 nuevas transiciones + actor dispatcher (60 tests, 100%)
[x] TRIPS17-003: trips.service — approveTrip + rejectTrip + getPendingApproval + handlePromoteApproved
[x] TRIPS17-004: trips.routes — POST /:id/approve + POST /:id/reject (authorize admin/dispatcher)
[x] TRIPS17-005: admin-trips.routes — GET /admin/trips/pending-approval (paginado)
[x] TRIPS17-006: BullMQ — trip.promote-approved job (APPROVED → SEARCHING)
[x] TRIPS17-007: Seed 11 — requiresApproval: true en custody + cold-chain
[x] BACK17-001: AprobacionesPage + usePendingApprovals hook + Sidebar badge
[x] MOB17-001: banners PENDING_APPROVAL (naranja) + APPROVED (azul) en ActiveTripScreen
[x] SP17-QA-001: approval-flow.spec.ts (5 E2E tests)
[x] Bug fix: dispatcher actorId=null (FK trip_status_history.changed_by → users.id)
```

### Sprint 15 — Backoffice + Clone Kit ✅ COMPLETO (2026-04-28)
```
[x] BACK15-001: TripsPage tab Temperatura (LineChart Recharts + 4 summary cards + reference lines) + tab Custodia (timeline)
[x] BACK15-002: VerticalesPage modal editor — toggles features JSONB + PATCH /admin/verticals/:id + useMutation
[x] KIT15-001: docs/VERTICAL_CLONE_GUIDE.md (12 pasos) + apps/api/seeds/templates/vertical.template.ts + .env.vertical.example
[x] SP15-QA-001: vertical-editor.spec.ts (2 tests) + trip-detail-vertical.spec.ts (2 tests)
[x] recharts ^2.15.4 en apps/web · TypeScript 0 errores · playwright.config.ts +2 proyectos
ADRs: ADR-045 (Clone Kit) ya documentado · Sin ADRs nuevos
Multi-vertical completo (Sprints 13+14+15): taxi ✅ custody ✅ cold-chain ✅
```

### Sprint 11 — Backoffice v2 (2026-04-27) ✅ COMPLETO
```
[x] AdminLayout con Sidebar collapsible (7 nav items) + Header (badge vertical)
[x] 6 componentes UI: Badge, Table<T>, Modal (portal), Pagination, SearchInput, ConfirmDialog
[x] useVerticalConfig hook (TanStack Query staleTime 5min)
[x] TripsPage: paginación + filtro status + modal detalle con metadata JSON
[x] DriversPage: tabla + PATCH /admin/drivers/:id/status + ConfirmDialog
[x] UsersPage: tabla con company_name + modal detalle
[x] CompaniesPage: auto-slug + nueva empresa modal
[x] CompanyDetailPage: 3 tabs (info/users/configs) + search por phone + config CRUD
[x] VerticalesPage: cards con feature chips ✓/○
[x] DashboardPage + ConfigPage: sin header standalone, solo contenido
[x] TanStack Router: pathless admin-layout route (id sin path)
[x] Backend: GET /admin/users, GET /admin/users/search, PATCH /admin/drivers/:id/status
[x] Commits: d11ba4b
```

### Sprint 12 — Mobile vertical-aware (2026-04-27) ✅ COMPLETO
```
[x] vertical.store.ts (Zustand + MMKV persist) con fetchConfig desde GET /config
[x] useVerticalFeatures hook para consumir feature flags
[x] RootNavigator: bootstrap fetchConfig en useEffect (fire-and-forget)
[x] EstimateScreen: "Programar para después" solo si features.scheduling
[x] HomeScreen: "Mis programados" solo si features.scheduling
[x] app.json extra.verticalSlug + ENV.verticalSlug con fallback 'taxi'
[x] Commits: 717de89
[ ] SP12-QA-001: vertical.store.test.ts + EstimateScreen scheduling tests (pendiente)
```

### Sprint 10 — Backend Multi-vertical + Companies + Configurations (2026-04-27) ✅ COMPLETO
```
[x] Migration 034: CREATE TABLE verticals + ALTER trip_types ADD vertical_id + ALTER trips ADD metadata JSONB
[x] Migration 035: CREATE TABLE companies + company_users + configurations (índices + CHECK constraints)
[x] Seed 09: 3 verticals (taxi, custody, cold-chain) + empresa-demo SA + link trip_types→taxi
[x] Módulo verticals: GET /config (público, Redis TTL 60s), GET/PATCH /admin/verticals (admin)
[x] Módulo companies: POST/GET/PATCH /admin/companies + GET/POST/DELETE /admin/companies/:id/users
[x] Módulo configurations: GET/PUT/DELETE /config/entity/:type/:id/:ns/:key (upsert idempotente)
[x] trips.metadata JSONB: campo opcional en POST /trips, retornado en GET /trips/:id y /active
[x] VERTICAL_SLUG env var (default 'taxi') — determina qué vertical sirve GET /config
[x] BusinessError: 7 nuevos códigos (VERTICAL_NOT_FOUND, COMPANY_NOT_FOUND, etc.)
[x] Tests: 385/385 ✅ · cobertura global 80.41% > 75% · TripStateMachine + PricingEngine 100%
[x] ADR-036..039 documentados
[x] Docker recreado con credenciales ridebase_* (down -v + up -d)
```

### Sprint 9 — Viajes Programados UI + Despacho Anticipado (2026-04-24) ✅ COMPLETO
```
[x] Migration 033: 5 nuevos campos en scheduled_trips (dispatch_window_min, search_started_at,
    passenger_notified_searching_at, pre_assigned_driver_id, pre_assigned_at)
[x] scheduler.service.ts: despacho a T-dispatch_window_min (no a T-0), guard search_started_at IS NULL
[x] scheduler.service.ts: push pasajero a T-15 si SEARCHING (passenger_notified_searching_at)
[x] trips.service.ts: push conductor al aceptar viaje programado (trip_scheduled_accepted)
[x] admin.repository.ts: LEFT JOIN scheduled_trips → scheduled_for + search_started_at en GET /admin/trips
[x] ScheduledTripsScreen.tsx: lista + cancelar viajes (useQuery + RefreshControl + Alert)
[x] ScheduleConfirmScreen.tsx: DateTimePicker nativo Android + validación ≥30 min + POST /trips/schedule
[x] HomeScreen: botón "Mis programados"
[x] EstimateScreen: CTA secundario "Programar para después"
[x] PassengerStack: rutas ScheduleConfirm + ScheduledTrips registradas
[x] DashboardPage.tsx: tab Programados + badge estado despacho (search_started_at)
[x] @tanstack/react-query + @react-native-community/datetimepicker instalados en mobile-v2
[x] Tests: ScheduledTripsScreen (10 tests) + ScheduleConfirmScreen (14 tests)
[x] ADR-034 (datetimepicker) + ADR-035 (dispatch_window_min) documentados
[x] SCHED-API-005: search_started_at en admin endpoint + badge backoffice
[x] Rebuild APK con @react-native-community/datetimepicker nativo (BUILD SUCCESSFUL 1m40s, 2026-04-25)
[x] Bug fix: scheduledRepo.create usaba this.db fuera de trx → FK violation → POST /trips/schedule retornaba 500 (commit 67aa213)
[x] Smoke test emulador: EstimateScreen precios ✅, "Programar para después" ✅, ScheduleConfirmScreen resumen+picker ✅
[ ] Flujo completo app→API confirmado E2E (token expiró en la sesión de prueba, pendiente re-login)
[ ] Smoke tests Playwright staging (descoped desde Sprint 6)
```

---

## Decisiones Pendientes

Estas decisiones aún no se han tomado y bloquean o afectan el desarrollo:

| Decisión | Impacto | Urgencia |
|---|---|---|
| ¿Nombre de dominio de la plataforma? | URL de la API, configuración de CORS | Media |
| ¿Radio inicial de búsqueda de conductores? | Configuración de matching | Antes de Sprint 4 |
| ¿Tiempo máximo de espera sin conductor? | Timeout de SEARCHING | Antes de Sprint 4 |
| ¿Porcentaje de comisión inicial? | `commission_rules` seed | Antes de Sprint 4 |
| ¿Política de cancelación? | Lógica de cargos por cancelación | Antes de Sprint 4 |
| ¿Proceso de verificación de conductores? | ¿Manual o con servicio externo? | Antes de Sprint 3 |

---

## Bloqueos Activos

> Ninguno actualmente — proyecto en fase de setup.

---

## Notas Técnicas Recientes

### [2026-04-04] Setup de Agent Skills y refactorización de commands

```
Contexto: Completar la infraestructura de agentes con el sistema de skills oficial de Claude

Investigación: Se consultó documentación oficial de Claude Agent SDK sobre Agent Skills.
Diferencia clave: commands = invocación manual del usuario (/comando)
                  skills   = auto-disparadas cuando el contexto coincide (sin invocación)

Skills de especialización creadas (.claude/skills/):
  - backend-node-fastify        → Fastify+Knex+BullMQ, transacciones, SELECT FOR UPDATE
  - testing-node-apis           → TripStateMachine 100%, concurrencia, factories, Testcontainers
  - mobile-react-native-offline → GPS offline, Google Maps SDK nativo, optimistic UI
  - devops-docker-railway       → Multi-stage Docker, migrations safety, CI/CD, Railway

Skills operacionales creadas (.claude/skills/):
  - running-agent-verify        → rtk npm run agent:verify:quick + interpretación
  - evaluating-test-coverage    → Thresholds, feedback estructurado para Generator loop
  - creating-adr                → Formato ADR, contrato API completo, checklist
  - updating-module-snapshot    → Campos, estados, creación de snapshots
  - creating-knex-migration     → Naming, up/down, TimescaleDB, irreversibility flags
  - validating-handoff          → Campos obligatorios, rejection format, HitL triggers

Commands nuevos creados (.claude/commands/):
  - /plan    → solo Fase 1 (planeación sin ejecutar)
  - /agent   → invocar un agente individual ad-hoc

Command /team refactorizado:
  - Agregado $ARGUMENTS
  - Instrucciones ejecutables paso a paso (no solo descripción)
  - Flujo P2P planner↔architect definido operativamente
  - 5 puntos ⏸ PARAR explícitos con texto exacto al usuario

settings.json actualizado:
  - "Skill(*)" en permissions.allow
  - allowedTools: ["Skill", "Read", "Write", "Edit", "Bash", "Glob", "Grep", ...]
  - skillSettings: { sources: ["project", "user"], projectSkillsDir: ".claude/skills" }
```

### [2026-04-04] Setup del sistema de team agents
```
Contexto: Diseño de la arquitectura multiagentica del proyecto
Decisión: Patrón Sequential + Generator (QA↔Backend) + Parallel (Backend+Mobile)
Fuente: orchestrator_workflow_uber_base.md — análisis externo de diseño multiagentico

Agentes implementados:
  - planner     (nuevo) — descompone requerimientos, P2P con architect
  - architect   (actualizado) — ADR con contratos completos, irreversible_flags
  - backend     (actualizado) — self_check obligatorio, task_id, artifacts
  - qa          (actualizado) — bucle Generator máx 3 iter, feedback estructurado
  - mobile      (actualizado) — waiting_dependency status, unblocks
  - devops      (actualizado) — aprobación de irreversibles, health check post-deploy
  - orchestrator (reescrito) — 4 fases: planeación/ejecución/entrega/retrospectiva

Cambio crítico en handoff: self_check ahora OBLIGATORIO en todos los handoffs.
El orchestrator rechaza cualquier handoff sin self_check.

5 puntos de human-in-the-loop obligatorios:
  1. Aprobación del plan de sprint
  2. Dependencia no planeada
  3. Operación irreversible antes de devops
  4. Entrega final
  5. Aprobación de mejoras en retrospectiva
```

---

## Métricas del Proyecto

| Métrica | Valor |
|---|---|
| Endpoints definidos | 42 |
| Tablas en el schema | 22 (10 con DDL completo en 00_arquitectura_base_v1.md — ver 10_data_dictionary.md para todas) |
| Módulos del backend | 11 |
| Cobertura de tests | Backend: 293 unit tests passing (17/21 suites) · Mobile: 33 tests |
| Sprints estimados al MVP | 7 — Sprint 7 ✅ COMPLETO |

---

## Cómo actualizar este documento

Al finalizar cada sesión de trabajo, el agente o developer debe:

1. Marcar las tareas completadas en "Próximas Tareas"
2. Actualizar el estado de los módulos en la tabla superior
3. Registrar cualquier decisión nueva tomada
4. Añadir notas técnicas relevantes
5. Actualizar las métricas si cambiaron
6. Actualizar la fecha al inicio del documento
