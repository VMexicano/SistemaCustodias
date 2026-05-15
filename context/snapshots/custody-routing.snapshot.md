# Snapshot — custody-routing

**Estado:** ✅ Sprint 13 completo
**Última actualización:** 2026-05-14

## Módulo implementado

### CustodyRoutingService (`apps/api/src/modules/custody-routing/`)
- `custody-routing.types.ts` — Waypoint, CustodyRoute, PlanRouteInput, PLANNABLE_STATUSES
- `custody-routing.repository.ts` — findByOrderId, upsert (insert/update), approve
- `custody-routing.service.ts` — planRoute, getRoute, approveRoute, getRoutePolyline
- `custody-routing.controller.ts` — planRoute, getRoute, approveRoute handlers
- `custody-routing.routes.ts` — 3 rutas con auth + autorización por rol

### Endpoints REST
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/orders/:id/route` | dispatcher, supervisor | Crear o actualizar ruta planificada |
| GET | `/orders/:id/route` | todos | Ver ruta planificada |
| PATCH | `/orders/:id/route/approve` | supervisor | Aprobar ruta |

### Tabla BD
```sql
custody_routes (
  id UUID PK DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE FK→custody_orders RESTRICT,
  waypoints JSONB NOT NULL DEFAULT '[]',
  total_distance_km DECIMAL(10,3),
  estimated_duration_minutes INT,
  approved_by UUID FK→users SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```
Migración: `20260514_054_create_custody_routes.ts` — **pendiente de aplicar** (requiere Docker)

### Lógica de negocio
- `PLANNABLE_STATUSES`: APPROVED, ASSIGNED, REASSIGNED, CREW_CONFIRMED
- Polilínea completa: pickup → waypoints → delivery (usando haversine)
- `AVG_SPEED_KMH = 60` para estimación de duración
- `total_distance_km = null` si no hay coordenadas en pickup/delivery
- Upsert: si ya existe ruta para la orden → UPDATE; si no → INSERT

### Integración con geofence worker
- `registerGeofenceWorker` acepta `routingService?: CustodyRoutingService`
- Si existe ruta planificada con waypoints → usa la polilínea completa para detección de desvío
- Si no → fallback al segmento simple pickup→delivery (comportamiento anterior)

### Nuevos error codes
| Código | HTTP | Cuándo |
|---|---|---|
| `ROUTE_NOT_FOUND` | 404 | Ruta no existe para la orden |
| `ORDER_NOT_PLANNABLE` | 409 | Estado de orden no permite planificar ruta |

## Cobertura de tests

- `CustodyRoutingService`: **22/22 tests pasando** (100% cobertura service) ✅
- Casos cubiertos: planRoute (happy path, ORDER_NOT_FOUND, ORDER_NOT_PLANNABLE, estados permitidos, distancia nula), getRoute (happy/ROUTE_NOT_FOUND), approveRoute (happy/ROUTE_NOT_FOUND), getRoutePolyline (null/empty/con waypoints/endpoints incluidos), cálculo de distancia y duración

## Dependencias
- `geofence.utils.ts` — haversineDistance, Point (reutilizado desde custody-tracking)
- `custody_orders` tabla — fetchOrderAddresses para validar estado y coordenadas
- ADR-021: haversine polyline + AVG_SPEED 60kmh + geofence fallback
