# Snapshot: tracking
> GPS tiempo real — TimescaleDB, WebSocket, geocerca.
> Última actualización: 2026-05-13 — Sprint 0

---

## Archivo(s) principal(es)

```
apps/api/src/modules/tracking/
  tracking.routes.ts
  tracking.controller.ts
  tracking.service.ts
  tracking.repository.ts
  tracking.types.ts
  geofence.utils.ts
```

---

## Flujo de tracking

```
App operador (cada 10s durante orden activa)
  → POST /tracking/location  { order_id, lat, lng, speed, heading, accuracy }
  → TimescaleDB hypertable: location_readings
  → WebSocket broadcast → dashboard admin (mapa en tiempo real)
  → Verificación de geocerca → si viola → POST /alerts automático
```

---

## Endpoints

| Método | Ruta | Actor | Descripción |
|---|---|---|---|
| POST | `/tracking/location` | custodio, copiloto | Enviar lectura GPS |
| GET | `/tracking/:orderId/current` | dispatcher, supervisor, client | Ubicación actual del equipo |
| GET | `/tracking/:orderId/history` | dispatcher, supervisor | Historial de ruta (TimescaleDB) |
| GET | `/tracking/:orderId/route` | dispatcher, supervisor | Ruta declarada vs ruta real |

---

## TimescaleDB hypertable

```sql
-- Convertir a hypertable después de crear la tabla
SELECT create_hypertable('location_readings', 'time');

-- Índice compuesto para queries de orden activa
CREATE INDEX ON location_readings (order_id, time DESC);
```

Retención de datos: 90 días por defecto, configurable.

---

## WebSocket (Socket.io)

- Namespace: `/tracking`
- Room por orden: `order:{order_id}`
- El despachador/supervisor se une al room al abrir la pantalla de la orden
- El cliente se une al room de su propia orden para ver la ubicación del equipo
- Evento emitido: `location:updated` con `{ order_id, lat, lng, speed, heading, timestamp }`

---

## Geocerca

```typescript
// Verifica si el punto está fuera del corredor de la ruta declarada
function isOutsideRoute(point: Point, route: Polyline, thresholdMeters: number): boolean

// Distancia haversine
function haversineDistance(p1: Point, p2: Point): number  // metros
```

El threshold por tipo de custodia es configurable en `custody_types.value_declaration_schema`.
Default: 500 metros.

---

## Reglas

1. Solo se registran lecturas para órdenes en estado `EN_ROUTE_TO_PICKUP` o `IN_TRANSIT`
2. Si una lectura llega para una orden en otro estado → se ignora silenciosamente
3. La verificación de geocerca se hace en BullMQ (job async) — no bloquea el endpoint
4. Si no llega lectura en > 2 minutos durante IN_TRANSIT → alerta `communication_loss`

---

## Dependencias entre módulos

- `custody-orders` — Solo trackea órdenes activas
- `alerts` — Geocerca violation → POST /alerts automático
- Emite eventos WebSocket al dashboard (admin)
