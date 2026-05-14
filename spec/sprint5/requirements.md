# Sprint 5 — Requirements: Custody Tracking GPS

**Sprint:** 5 — SistemaCustodias
**Fecha:** 2026-05-14
**Módulo:** custody-tracking

---

## Actores

| Actor | Rol en este módulo |
|---|---|
| `custodio` | Envía lecturas GPS mientras conduce |
| `copiloto` | Puede enviar lecturas GPS (desde su dispositivo) |
| `dispatcher` | Ve posición actual e historial de ruta |
| `supervisor` | Ve posición actual e historial de ruta |
| `client` | Ve posición actual de su orden |

---

## RF-001 — Registrar lectura GPS

**Actor:** custodio, copiloto
**Endpoint:** POST /tracking/location

**Criterios de aceptación:**
- [x] Solo se registra si la orden está en estado `EN_ROUTE_TO_PICKUP` o `IN_TRANSIT`
- [x] Solo se registra si el operador (JWT.sub → operador lookup) está asignado a la orden como custodio_id o copiloto_id
- [x] La lectura se inserta en `location_readings` (TimescaleDB hypertable)
- [x] Después de insertar, se emite evento `location:updated` al room `order:{order_id}` en Socket.io
- [x] Después de insertar, se encola job `geofence-check` en BullMQ (fuera de transacción)
- [x] Retorna 201 con `{ recorded: true, order_id, timestamp }`

**Constraints:**
- Si la orden no existe → 404 ORDER_NOT_FOUND
- Si el operador no está asignado a la orden → 403 OPERATOR_NOT_ASSIGNED
- Si la orden no está en estado trackeable → 409 ORDER_NOT_TRACKABLE
- El endpoint NO bloquea esperando el resultado del geofence check

---

## RF-002 — Consultar posición actual

**Actor:** dispatcher, supervisor, client
**Endpoint:** GET /tracking/:orderId/current

**Criterios de aceptación:**
- [x] Retorna la lectura más reciente de `location_readings` para la orden
- [x] Si no hay lecturas → 404 NO_LOCATION_DATA
- [x] El client solo puede ver la posición de sus propias órdenes
- [x] Retorna `{ order_id, lat, lng, speed_kmh, heading, timestamp }`

---

## RF-003 — Consultar historial de ruta

**Actor:** dispatcher, supervisor
**Endpoint:** GET /tracking/:orderId/history

**Criterios de aceptación:**
- [x] Retorna array de lecturas ordenadas por `time DESC`
- [x] Soporta parámetros `limit` (máx 500, default 100), `from` y `to` (ISO dates)
- [x] Retorna `{ order_id, points: [...], count: number }`

---

## RF-004 — WebSocket tiempo real

**Criterios de aceptación:**
- [x] Namespace `/tracking` en Socket.io
- [x] Un cliente puede unirse al room `order:{order_id}` emitiendo `join:order { order_id }`
- [x] Cuando un custodio envía una lectura GPS, todos los sockets en el room `order:{order_id}` reciben `location:updated`
- [x] El servidor autentica el JWT del socket antes de permitir `join:order`

---

## RF-005 — Geofence check asíncrono

**Actor:** sistema (worker BullMQ)
**Criterios de aceptación:**
- [x] El worker recibe `{ order_id, lat, lng, operatorId }`
- [x] Consulta la ruta declarada de la orden (campo `pickup_address`, `delivery_address` + polyline si existe)
- [x] Si el vehículo se desvió > 500m de la ruta → inserta en `security_alerts` (tipo `geofence_violation`, severidad `medium`)
- [x] La verificación es idempotente (no crea alertas duplicadas en < 60 segundos para la misma orden)

---

## Scope out (no en Sprint 5)

- Módulo `alerts` completo (Sprint 6)
- GET /tracking/:orderId/route (ruta declarada vs ruta real)
- Alerta `communication_loss` por timeout de lecturas (> 2 min sin GPS)
- Mobile GPS sender (envío automático cada 10s desde la app)
- Integration tests con Docker/TimescaleDB real
