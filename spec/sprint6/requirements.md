# Sprint 6 — Requirements: Módulo Alerts

**Sprint:** 6 — SistemaCustodias
**Fecha:** 2026-05-14
**Módulo:** alerts

---

## Actores

| Actor | Rol |
|---|---|
| `custodio` | Crea alertas (incluye botón de pánico) |
| `copiloto` | Crea alertas |
| `dispatcher` | Consulta alertas activas |
| `supervisor` | Consulta y resuelve alertas (único que puede resolver `critical`) |
| Sistema | Crea alertas automáticas (geofence, communication_loss) vía AlertEngine |

---

## RF-001 — Crear alerta

**Actor:** custodio, copiloto (HTTP) + sistema (via AlertEngine directo)
**Endpoint:** POST /alerts

**Criterios de aceptación:**
- [x] Solo se permite para órdenes en estado activo: EN_ROUTE_TO_PICKUP, AT_PICKUP, IN_TRANSIT, AT_DELIVERY, INCIDENT
- [x] El operador debe estar asignado a la orden (custodio_id o copiloto_id)
- [x] Si `alert_type = 'panic'` → la orden transiciona automáticamente a INCIDENT
- [x] Si `alert_type = 'panic'` y ya existe una alerta panic en < 30s para el mismo order_id + operator_id → 409 PANIC_ALERT_TOO_SOON
- [x] La severidad se determina automáticamente por el tipo (no la elige el actor HTTP)
- [x] Retorna 201 con los datos de la alerta creada

**Mapa de severidades:**
| Tipo | Severidad |
|---|---|
| panic | critical |
| tamper | high |
| geofence_violation | medium |
| communication_loss | high |
| custom | low |

---

## RF-002 — Listar alertas activas

**Actor:** dispatcher, supervisor
**Endpoints:** GET /alerts y GET /orders/:id/alerts

**Criterios de aceptación:**
- [x] Soporta filtros: `order_id?`, `resolved?: bool`, `limit?` (default 50)
- [x] GET /orders/:id/alerts retorna alertas de una orden específica
- [x] Retorna alertas ordenadas por `created_at DESC`

---

## RF-003 — Ver alerta

**Actor:** dispatcher, supervisor
**Endpoint:** GET /alerts/:id

**Criterios de aceptación:**
- [x] Retorna todos los campos de la alerta
- [x] 404 ALERT_NOT_FOUND si no existe

---

## RF-004 — Resolver alerta

**Actor:** supervisor
**Endpoint:** PATCH /alerts/:id/resolve

**Criterios de aceptación:**
- [x] Solo supervisor puede resolver alertas `critical`
- [x] Cualquier role autorizado puede resolver alertas `low/medium/high`... pero por seguridad, solo supervisor en este sprint
- [x] 409 ALERT_ALREADY_RESOLVED si ya tiene `resolved_at`
- [x] Registra `resolved_by` (user_id del supervisor) y `resolved_at`
- [x] Alertas son inmutables — se registra `resolved_at`, no UPDATE de otros campos

---

## RF-005 — Integración geofence worker (refactor deuda técnica Sprint 5)

**Actor:** sistema
**Criterio de aceptación:**
- [x] `geofence-check.worker.ts` llama a `AlertEngine.createAlert()` en lugar de insertar directo en BD
- [x] La severidad de geofence_violation es `medium` (corrección del worker anterior que usaba `high`)

---

## Scope out (no en Sprint 6)

- Notificaciones push/SMS para alertas critical/high (Sprint 7 — notifications module)
- Alerta `communication_loss` automática por timeout GPS (Sprint 7+)
- Panel de alertas en el dashboard web (Sprint 8 — admin)
- Alerta `tamper` desde hardware GPS (fuera del scope MVP)
