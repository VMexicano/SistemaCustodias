# Snapshot — Módulo: tracking
> Última actualización: 2026-05-07 | Estado: ✅ Completo (Sprint 7)

## Estado
- Implementación: 100%
- Integrado en app.ts: ✅
- Migration 030: device_tokens ✅

## Responsabilidad
GPS en tiempo real (Redis), persistencia histórica (TimescaleDB), tokens de push (FCM).

## Archivos implementados

```
apps/api/src/modules/tracking/
├── tracking.routes.ts       ← GET /trips/:id/track
├── tracking.service.ts      ← recordLocation + getTripLocations
└── tracking.repository.ts   ← INSERT trip_locations (TimescaleDB) + device_tokens UPSERT

apps/api/src/modules/users/
└── device-token.routes.ts   ← POST /users/me/device-token
```

## Endpoints

| Método | Path | Auth | Descripción |
|---|---|---|---|
| GET | /trips/:id/track | JWT (pasajero del viaje, conductor del viaje, o admin) | Historial de ubicaciones GPS del viaje |
| POST | /users/me/device-token | JWT | Registrar/actualizar FCM token del dispositivo |

## Flujo GPS

```
Conductor → PATCH /drivers/me/location (desde mobile, cada 5s)
  → DriversService.updateLocation()
  → trackingService.recordLocation() → INSERT trip_locations (TimescaleDB)
  → Redis: SET driver:{id}:location HSET { lat, lng, updatedAt }  TTL 5 min
  → Socket.io emit trip:driver_location_updated a room trip:{id}
```

## Redis keys

```
driver:{id}:location    HSET { lat, lng, updatedAt }  TTL 5 min
```

## Tabla trip_locations (TimescaleDB hypertable)

```sql
trip_id UUID FK · driver_id UUID FK · lat DECIMAL · lng DECIMAL · recorded_at TIMESTAMPTZ
-- Migration 015 (Sprint 1): hypertable particionada por día
-- Retención: 90 días (R-DATA-003)
-- Compresión automática: datos > 7 días
-- Índice: (trip_id, recorded_at DESC)
```

## Tabla device_tokens

```sql
id UUID PK · user_id UUID FK · token TEXT · platform VARCHAR(10) · created_at · updated_at
-- Migration 030 (Sprint 7)
-- UPSERT por (user_id, platform)
```

## WebSocket events relacionados

```
trip:driver_location_updated  → { driverId, lat, lng, updatedAt }
                              → emitido a room trip:{id} (pasajero + conductor)
```

## Integración mobile

`location.service.ts` en `apps/mobile-v2/`:
- `watchPosition` cada 5s vía `expo-location`
- Cola offline en MMKV (máx 100 puntos)
- Flush al reconectar con timestamps originales
