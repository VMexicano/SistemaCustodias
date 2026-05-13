# Snapshot — Scheduler

**Estado:** ✅ Sprint 6 completo
**Última actualización:** 2026-04-07

## Módulos implementados

### SchedulerService (`apps/api/src/modules/scheduler/`)
- `scheduler.repository.ts` — getDueTrips (FOR UPDATE SKIP LOCKED), getPendingReminders, markNotifSent, markActivated
- `scheduler.service.ts` — cron cada minuto, activateDueTrips + sendReminders en paralelo

### ScheduledTripsService (`apps/api/src/modules/scheduled-trips/`)
- `scheduled-trips.repository.ts` — create, findByPassenger, findByTripId
- `scheduled-trips.service.ts` — schedule(), getScheduled(), cancel()
- `scheduled-trips.controller.ts` — handlers REST
- `scheduled-trips.routes.ts` — POST/GET/DELETE /trips/schedule

## Endpoints

| Método | Path | Auth | Descripción |
|---|---|---|---|
| POST | /trips/schedule | passenger | Crear viaje programado |
| GET | /trips/scheduled | passenger | Listar mis viajes programados |
| DELETE | /trips/scheduled/:tripId | passenger | Cancelar viaje programado |

## Estado SCHEDULED en TripStateMachine
- `SCHEDULED → REQUESTED` (actor: system, activado por cron)
- `SCHEDULED → CANCELLED` (actor: passenger, DELETE endpoint)

## Cobertura de tests
- scheduler.service.ts: 97.91% líneas / 100% branches
- scheduled-trips.service.ts: 97.95% líneas / 92.85% branches
- Tests: scheduler.service.test.ts (11), scheduled-trips.service.test.ts (15)

## Dependencias
- node-cron ^4.2.1 + @types/node-cron ^3.0.11
- NotificationQueue (para recordatorios 24h/1h/15m)
- TripStateMachine (transiciones SCHEDULED)
- PricingEngine (estimatedFare al crear viaje programado)
