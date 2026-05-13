# Sprint 17 — Requisitos: Flujo de Aprobación Multi-vertical

> **Objetivo:** Extender el `TripStateMachine` con dos estados opcionales (`PENDING_APPROVAL`, `APPROVED`) y un nuevo actor `dispatcher`, activados por el feature flag `vertical.features.requiresApproval`. El vertical `taxi` no cambia en absoluto. Los verticales B2B (`custody`, `cold-chain`) habilitan el flag y obtienen un flujo de aprobación completo con cola en el backoffice.

---

## Scope

| Incluye | Excluye |
|---|---|
| Nuevos estados PENDING_APPROVAL y APPROVED en el state machine | Notificaciones push al pasajero/conductor sobre cambio de estado (sprint posterior) |
| Nuevo actor `dispatcher` con permisos limitados a aprobación | Asignación automática por geofence o algoritmo de matching |
| Feature flag `requiresApproval` en vertical features JSONB | Roles granulares de dispatcher por empresa (MVP: cualquier admin puede ser dispatcher) |
| Endpoints `POST /trips/:id/approve` y `POST /trips/:id/reject` | Flujo de reasignación (cambiar conductor tras aprobación) |
| Endpoint `GET /admin/trips/pending-approval` | Historial de aprobaciones con filtros avanzados |
| Cola de aprobaciones en backoffice (página nueva) | App móvil del dispatcher (MVP: usa backoffice web) |
| Feedback visual en mobile para PENDING_APPROVAL y APPROVED | Tiempo límite de aprobación / auto-rechazo por timeout |
| Seed 11: activar `requiresApproval` en custody y cold-chain | Cambios en taxi, scheduler, pricing o pagos |

---

## Actores y stakeholders

| Actor | App | Interés en este sprint |
|---|---|---|
| Pasajero / Cliente B2B | Mobile | Ver feedback mientras espera aprobación |
| Conductor | Mobile | No cambia — solo recibe viajes ya aprobados |
| Dispatcher | Backoffice web | Ver cola de solicitudes pendientes, aprobar o rechazar |
| Administrador de plataforma | Backoffice web | Configurar `requiresApproval` por vertical |
| Sistema | BullMQ | Transicionar APPROVED → SEARCHING automáticamente |

---

## Requerimientos funcionales

### RF-001 — Flujo de aprobación activable por vertical

**Como** administrador de plataforma,
**quiero** configurar `requiresApproval: true` en un vertical,
**para** que todas las solicitudes de ese vertical pasen por aprobación antes de despachar.

**Criterios de aceptación:**
- [ ] `GET /config` con `VERTICAL_SLUG=custody` retorna `features.requiresApproval: true`
- [ ] `GET /config` con `VERTICAL_SLUG=taxi` retorna `features.requiresApproval` ausente o `false`
- [ ] El flag es configurable vía `PATCH /admin/verticals/:id` sin deploy

---

### RF-002 — Creación de solicitud en PENDING_APPROVAL

**Como** cliente B2B en un vertical con `requiresApproval: true`,
**quiero** crear una solicitud de servicio,
**para** que esta quede en espera de aprobación antes de buscar conductor.

**Criterios de aceptación:**
- [ ] `POST /trips` en vertical custody retorna `status: "PENDING_APPROVAL"`
- [ ] `POST /trips` en vertical taxi retorna `status: "SEARCHING"` (sin cambio)
- [ ] La solicitud en PENDING_APPROVAL persiste en BD hasta que se apruebe o rechace

---

### RF-003 — Aprobación de solicitud por dispatcher

**Como** dispatcher,
**quiero** aprobar una solicitud pendiente,
**para** que el sistema busque un conductor disponible.

**Criterios de aceptación:**
- [ ] `POST /trips/:id/approve` transiciona de PENDING_APPROVAL → APPROVED
- [ ] Si se envía `assigned_driver_id`, el viaje pasa directo a ACCEPTED con ese conductor
- [ ] Si no se envía `assigned_driver_id`, BullMQ transiciona APPROVED → SEARCHING automáticamente
- [ ] `approved_at` y `approved_by` se registran en la fila del trip

---

### RF-004 — Rechazo de solicitud por dispatcher

**Como** dispatcher,
**quiero** rechazar una solicitud pendiente,
**para** notificar al cliente que su solicitud no puede atenderse.

**Criterios de aceptación:**
- [ ] `POST /trips/:id/reject` transiciona de PENDING_APPROVAL → CANCELLED
- [ ] El campo `cancellation_reason` se persiste con el motivo enviado por el dispatcher
- [ ] Un pasajero también puede cancelar desde PENDING_APPROVAL (sin cargo)

---

### RF-005 — Cola de aprobaciones en backoffice

**Como** dispatcher,
**quiero** ver todas las solicitudes pendientes en una sola pantalla,
**para** revisarlas y actuar en orden de llegada.

**Criterios de aceptación:**
- [ ] `GET /admin/trips/pending-approval` retorna trips con `status = 'PENDING_APPROVAL'` ordenados por `created_at asc`
- [ ] La página `AprobacionesPage` muestra tabla con origen, destino, cliente, tiempo de espera
- [ ] Botones Aprobar / Rechazar funcionan inline desde la tabla
- [ ] El sidebar muestra badge con el conteo de pendientes (polling 30s)

---

### RF-006 — Feedback visual en mobile

**Como** cliente B2B en espera de aprobación,
**quiero** ver el estado actual de mi solicitud en la app,
**para** saber si fue aprobada, rechazada o si se está buscando conductor.

**Criterios de aceptación:**
- [ ] `ActiveTripScreen` muestra mensaje "Tu solicitud está en revisión" cuando `status = 'PENDING_APPROVAL'`
- [ ] `ActiveTripScreen` muestra mensaje "Solicitud aprobada, buscando conductor" cuando `status = 'APPROVED'`
- [ ] El flujo normal (mapa + conductor) solo aparece desde ACCEPTED en adelante
- [ ] Si el vertical no tiene `requiresApproval`, el pasajero nunca ve estos estados

---

## Requerimientos no funcionales

| RNF | Descripción |
|---|---|
| RNF-001 | La consulta de `requiresApproval` debe resolverse desde Redis (ya cacheado en GET /config) — sin query extra a BD por request |
| RNF-002 | `GET /admin/trips/pending-approval` debe incluir paginación (limit/offset) para soportar listas grandes |
| RNF-003 | El state machine mantiene cobertura 100% en `trip-state-machine.test.ts` |
| RNF-004 | La migración 038 debe ser backward-compatible — columnas nullable, taxi no se ve afectado |

---

## Restricciones técnicas inamovibles

- `trips.status` es `varchar(30)` — NO es PG ENUM. Agregar valores nuevos no requiere `ALTER TYPE`.
- Actor `dispatcher` solo tiene permisos en las transiciones de aprobación. No puede iniciar ni completar viajes.
- `SELECT FOR UPDATE` sigue siendo responsabilidad del `trips.service` antes de invocar el state machine.
- Efectos secundarios (BullMQ jobs) van fuera de la transacción de BD.
- El vertical config se lee de Redis (TTL 60s) — no hay query a BD por cada `POST /trips`.

---

## Decisiones pendientes que NO bloquean este sprint

- Timeout automático de aprobación (si el dispatcher no responde en X minutos → auto-rechazar): sprint posterior
- Notificaciones push al dispatcher cuando llega nueva solicitud: sprint posterior
- App móvil dedicada para dispatcher: sprint posterior
