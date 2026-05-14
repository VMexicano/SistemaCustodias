# Sprint 5 — Design: Custody Tracking GPS

**Sprint:** 5 — SistemaCustodias
**Fecha:** 2026-05-14

---

## Arquitectura del módulo

El módulo `custody-tracking` es autocontenido. Se crea separado del módulo `tracking` (UBER_BASE, usa tabla `trip_locations`) para evitar conflictos.

```
apps/api/src/modules/custody-tracking/
  custody-tracking.types.ts
  custody-tracking.repository.ts
  custody-tracking.service.ts
  custody-tracking.controller.ts
  custody-tracking.routes.ts
  geofence.utils.ts

apps/api/src/workers/
  geofence-check.worker.ts

apps/api/src/queues/
  geofence.queue.ts          ← Queue BullMQ para geofence-check jobs
```

---

## Contrato de API

### POST /tracking/location

```
Auth: JWT — onRequest: [authenticate, authorize('custodio', 'copiloto'), tenantGuard]

Body:
{
  order_id:    string (minLength: 1)
  lat:         number (min: -90, max: 90)
  lng:         number (min: -180, max: 180)
  speed_kmh?:  number (min: 0)
  accuracy_m?: number (min: 0)
  heading?:    number (min: 0, max: 360)
}

Response 201:
{ recorded: true, order_id: string, timestamp: string }

Errors:
  400 VALIDATION_ERROR       — campos inválidos
  403 OPERATOR_NOT_ASSIGNED  — JWT.sub no corresponde al custodio_id ni copiloto_id de la orden
  404 ORDER_NOT_FOUND
  409 ORDER_NOT_TRACKABLE    — orden no está en EN_ROUTE_TO_PICKUP | IN_TRANSIT
```

### GET /tracking/:orderId/current

```
Auth: JWT — onRequest: [authenticate, authorize('dispatcher', 'supervisor', 'client'), tenantGuard]

Params: orderId: string

Response 200:
{
  order_id:  string
  lat:       number
  lng:       number
  speed_kmh: number | null
  heading:   number | null
  timestamp: string (ISO 8601)
}

Errors:
  404 ORDER_NOT_FOUND
  404 NO_LOCATION_DATA
```

### GET /tracking/:orderId/history

```
Auth: JWT — onRequest: [authenticate, authorize('dispatcher', 'supervisor'), tenantGuard]

Params: orderId: string
Query:  limit?: number (1–500, default 100)
        from?:  string (ISO date)
        to?:    string (ISO date)

Response 200:
{
  order_id: string
  points: Array<{ lat: number, lng: number, speed_kmh: number|null, heading: number|null, timestamp: string }>
  count:  number
}

Errors:
  404 ORDER_NOT_FOUND
```

---

## WebSocket — Socket.io

```
Namespace: /tracking
Auth:      JWT via handshake.auth.token (misma validación que JWT de HTTP)

Client → Server:
  join:order   { order_id: string }

Server → Client:
  location:updated {
    order_id:  string
    lat:       number
    lng:       number
    speed_kmh: number | null
    heading:   number | null
    timestamp: string
  }

Room naming: order:{order_id}
```

---

## Flujo de datos — POST /tracking/location

```
1. authenticate + authorize('custodio', 'copiloto') + tenantGuard
2. CustodyTrackingController.recordLocation(req, reply)
3. CustodyTrackingService.recordLocation(dto)
   a. Buscar orden en custody_orders (SELECT, no FOR UPDATE — read-only check)
   b. Verificar: status IN ('EN_ROUTE_TO_PICKUP', 'IN_TRANSIT') → sino: throw ORDER_NOT_TRACKABLE
   c. Resolver operatorId: JWT.sub = user_id → OperadoresRepository.findByUserId(user_id)
   d. Verificar: order.custodio_id === operatorId OR order.copiloto_id === operatorId → sino: throw OPERATOR_NOT_ASSIGNED
   e. Insertar en location_readings via raw INSERT (TimescaleDB pattern)
   f. io.to('order:{order_id}').emit('location:updated', { ... })  ← Socket.io broadcast
   g. await geofenceQueue.add('geofence-check', { order_id, lat, lng, operatorId })  ← fuera de trx
4. reply.status(201).send({ recorded: true, order_id, timestamp })
```

---

## Tabla location_readings — Knex pattern (TimescaleDB)

```typescript
// INSERT — usar knex.raw para TimescaleDB hypertable
await db.raw(
  `INSERT INTO location_readings (time, order_id, operator_id, vehicle_id, lat, lng, speed_kmh, accuracy_m, heading)
   VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?)`,
  [order_id, operator_id, vehicle_id ?? null, lat, lng, speed_kmh ?? null, accuracy_m ?? null, heading ?? null]
);

// SELECT current (última lectura)
const row = await db('location_readings')
  .where({ order_id })
  .orderBy('time', 'desc')
  .first()
  .select('lat', 'lng', 'speed_kmh', 'heading', 'time');

// SELECT history
const rows = await db('location_readings')
  .where({ order_id })
  .modify((qb) => {
    if (from) qb.where('time', '>=', from);
    if (to)   qb.where('time', '<=', to);
  })
  .orderBy('time', 'desc')
  .limit(limit)
  .select('lat', 'lng', 'speed_kmh', 'heading', 'time');
```

---

## Geofence utils

```typescript
// haversine distance en metros
export function haversineDistance(p1: Point, p2: Point): number

// distancia mínima del punto a cualquier segmento de la polyline
export function distanceToPolyline(point: Point, polyline: Point[]): number

// true si la distancia al polyline > thresholdMeters
export function isOutsideRoute(point: Point, polyline: Point[], thresholdMeters: number): boolean
```

---

## Worker BullMQ — geofence-check

```typescript
// Queue: 'geofence-check'
// Job data: { order_id: string, lat: number, lng: number, operator_id: string }

// Lógica del worker:
// 1. Buscar orden (pickup_address + delivery_address con lat/lng)
// 2. Construir polyline [pickup_coords, delivery_coords]
// 3. Si no hay coords → skip
// 4. Calcular distancia del punto al polyline
// 5. Si distancia > 500m:
//    a. Verificar que no hay alerta geofence_violation en security_alerts para esta orden en < 60s
//    b. INSERT en security_alerts (type='geofence_violation', severity='medium', order_id, location JSONB)
```

---

## Nuevos BusinessErrorCodes

```typescript
| 'ORDER_NOT_TRACKABLE'    // 409 — orden no en EN_ROUTE_TO_PICKUP | IN_TRANSIT
| 'OPERATOR_NOT_ASSIGNED'  // 403 — operador no asignado a esta orden
| 'NO_LOCATION_DATA'       // 404 — sin lecturas GPS para la orden
```

---

## ADR — decisiones de diseño

### ADR-009 — Módulo custody-tracking separado del módulo tracking UBER_BASE

**Decisión:** Crear `custody-tracking/` separado de `tracking/` existente.
**Razón:** El módulo tracking UBER_BASE usa tabla `trip_locations` con schema diferente (`trip_id`, `driver_id`, `recorded_at`). El dominio de custodias usa `location_readings` (`order_id`, `operator_id`, `time` TimescaleDB). Fusionarlos requeriría refactorizar el código UBER_BASE activo.
**Consecuencias:** Dos servicios de tracking. El UBER_BASE sigue como está. El custody-tracking es el canónico para el dominio custodia.

### ADR-010 — Socket.io inject via Fastify plugin options

**Decisión:** El `io` (Socket.io server) se pasa como dependencia inyectada al `CustodyTrackingService` para que pueda hacer broadcast.
**Razón:** Permite testear el servicio sin levantar Socket.io real (mock del io).
**Implementación:** El plugin registra el namespace `/tracking`, crea el namespace io, y lo pasa al service constructor.
