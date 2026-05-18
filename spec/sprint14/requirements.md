# Sprint 14 — Requirements: Event Catalog + CustodyEvent Envelope

**Sprint:** 14 — SistemaCustodias
**Fecha:** 2026-05-18
**Módulo:** custody-events

---

## Objetivo

Implementar la infraestructura de eventos de custodia descrita en `docs/arquitectura-negocio.md §3.1-3.4`.
Un _CustodyEvent_ es el registro inmutable de cualquier acción significativa que ocurre durante una orden activa: checkpoints rutinarios, botón de pánico, verificación de carga, incidentes y entrega. Esta infraestructura es el núcleo de la cadena de custodia legal y el punto de partida del Monitor Engine (Sprint 15).

---

## Scope

| Incluye | Excluye |
|---|---|
| Tabla `event_catalog` (M-055) | Monitor Engine (comparación dual-timestamp) |
| Tabla `order_event` (M-056) | Upload real de fotos/audio (evidence.url = string válida, no multipart) |
| Seed 15: 5 tipos de evento × 4 verticals | SSP webhook automático para PANIC |
| `GET /orders/:id/event-catalog` | Mobile UI nueva (CustodyEventScreen existe) |
| `POST /orders/:id/events` (envelope completo) | GpsProvider auto_timestamp channel |
| `GET /orders/:id/events` (historial paginado) | Integration tests con Docker |
| Validación Ajv del payload contra schema del catálogo | Particionamiento de order_event por tiempo |
| HMAC-SHA256 integrity_hash calculado por servidor | Firma biométrica verificada |
| PANIC → enqueue a alertsQueue | — |

---

## Actores

| Actor | Rol en este módulo |
|---|---|
| `custodio` | Registra eventos durante la operación (CHECKPOINT, PANIC, CARGO_STATUS, INCIDENT, DELIVERY_ATTEMPT) |
| `copiloto` | Puede registrar eventos en paralelo (confirmación independiente) |
| `supervisor` | Consulta historial de eventos; recibe alertas si PANIC |
| `dispatcher` | Consulta historial de eventos para seguimiento de la operación |
| `system` | Actor en eventos auto-generados futuros (Monitor Engine) |

---

## RF-001 — Consultar catálogo de eventos de una orden

**Actor:** custodio, copiloto
**Endpoint:** `GET /orders/:id/event-catalog`

**Como** custodio, **quiero** descargar el catálogo de tipos de evento al iniciar una orden activa, **para** saber qué eventos puedo registrar, con qué frecuencia y qué datos debo incluir.

**Criterios de aceptación:**
- [ ] Solo accesible si la orden existe y está en `ACTIVE_STATUSES`
- [ ] Retorna el catálogo filtrado por el `vertical_slug` del `custody_type` de la orden
- [ ] Cada ítem del catálogo incluye: `code`, `label`, `requires_photo`, `requires_audio`, `requires_signature`, `payload_schema`, `interval_minutes`
- [ ] Si la orden no existe → 404 `ORDER_NOT_FOUND`
- [ ] Si la orden no está activa → 409 `ORDER_NOT_ACTIVE_FOR_EVENT`

---

## RF-002 — Registrar un CustodyEvent

**Actor:** custodio, copiloto
**Endpoint:** `POST /orders/:id/events`

**Como** custodio, **quiero** registrar un evento de custodia con mis datos de ubicación y el payload requerido por el catálogo, **para** que quede constancia inmutable en la cadena de custodia.

**Criterios de aceptación:**
- [ ] Solo se acepta si la orden está en `ACTIVE_STATUSES` = `[EN_ROUTE_TO_PICKUP, AT_PICKUP, IN_TRANSIT, AT_DELIVERY, INCIDENT, RESOLVED]`
- [ ] El campo `event_type` debe existir en `event_catalog` para el vertical de la orden
- [ ] El campo `payload` se valida contra `payload_schema` del catálogo (Ajv draft-07)
- [ ] Si el payload no cumple el schema → 422 `EVENT_PAYLOAD_INVALID` con lista de errores
- [ ] El servidor calcula `integrity_hash = HMAC-SHA256(envelope_sin_integrity_hash, CUSTODY_EVENT_HMAC_SECRET)`
- [ ] El `sequence_no` se asigna automáticamente como `MAX(sequence_no) + 1` con `SELECT FOR UPDATE` para evitar duplicados concurrentes
- [ ] El evento se inserta en `order_event` de forma append-only (sin UPDATE ni DELETE posterior)
- [ ] Si `event_type === 'PANIC'` → se encola job `create-alert` en `alertsQueue` **después** del commit de BD
- [ ] `auto_timestamp` queda en `NULL` (se llenará por Monitor Engine en Sprint 15)
- [ ] Retorna `201` con `{ id, order_id, event_type, sequence_no, created_at }`

**Errores:**
- [ ] Orden inexistente → 404 `ORDER_NOT_FOUND`
- [ ] Orden no activa → 409 `ORDER_NOT_ACTIVE_FOR_EVENT`
- [ ] event_type no en catálogo → 404 `EVENT_TYPE_NOT_FOUND`
- [ ] Payload inválido → 422 `EVENT_PAYLOAD_INVALID`
- [ ] Conflict de sequence_no (race condition) → 409 `DUPLICATE_SEQUENCE_NO`

---

## RF-003 — Consultar historial de eventos

**Actor:** custodio, copiloto, supervisor, dispatcher
**Endpoint:** `GET /orders/:id/events`

**Como** supervisor, **quiero** ver el historial cronológico de todos los eventos de una orden, **para** auditar la operación y detectar irregularidades.

**Criterios de aceptación:**
- [ ] Retorna array de eventos ordenados por `created_at ASC`
- [ ] Soporta paginación con `limit` (máx 100, default 50) y `offset`
- [ ] Cada evento incluye: `id`, `event_type`, `sequence_no`, `actor_role`, `app_timestamp`, `location`, `payload`, `device.signal_strength`, `integrity_hash`, `created_at`
- [ ] `evidence` solo se retorna si el actor es `supervisor` o `dispatcher`
- [ ] Retorna `{ order_id, events: [...], total: number, limit, offset }`

---

## Requerimientos no funcionales

| Requerimiento | Valor |
|---|---|
| Cobertura `CustodyEventService` | 100% lines y 100% branches |
| Cobertura global del proyecto | ≥ 75% |
| TypeScript | 0 errores (strict mode) |
| `order_event` | Append-only — nunca `UPDATE` ni `DELETE` |
| `integrity_hash` | HMAC-SHA256, 64 chars hex, calculado por servidor |
| `sequence_no` | Asignado con `SELECT FOR UPDATE` — sin gaps en concurrencia |

---

## Restricciones técnicas inamovibles

- Los efectos secundarios (alertsQueue) van SIEMPRE fuera de la transacción de BD (ADR-003)
- `order_event` es evidencia legal — nunca UPDATE/DELETE (ADR-007 extendido)
- `integrity_hash` se calcula en el servidor, no se confía en el cliente (ADR-022)
- `auto_timestamp` es nullable en este sprint; Monitor Engine lo llenará en Sprint 15
- `ajv` ya es dependencia directa — no agregar nueva dep de validación

---

## Decisiones pendientes (no bloquean este sprint)

| Decisión | Sprint que la necesita |
|---|---|
| ¿Cuál es el threshold de delta `app_timestamp` vs `auto_timestamp` para disparar alerta? | Sprint 15 (Monitor Engine) |
| ¿Deberían los eventos PANIC disparar notificación a SSP vía webhook? | Sprint 15 |
| ¿Se almacenan archivos de evidencia (fotos/audio) en S3/R2 o en BD? | Sprint 16 |
| ¿El catálogo de eventos se versiona (schema migrations por vertical)? | Sprint 16+ |
