# Snapshot — Módulo: trips
> Última actualización: 2026-05-08 | Estado: ✅ Completo + Approval Flow (Sprint 17)

## Estado
- Implementación: 100%
- Tests TripStateMachine: 60/60 ✅ (100% lines / 100% branches)
- Tests integración: 47/47 ✅ (Testcontainers — incluye smoke, concurrencia, flujos completos)
- Tests unitarios service: **61/61 ✅** (+32 nuevos 2026-05-08)
- Tests realtime: 27/27 ✅
- Smoke E2E approval-flow: 5 tests (4 API + 1 UI skip guard)
- Cobertura `trips.service.ts`: **97.2% lines / 85.58% branches** ✅
- Cobertura `trips.repository.ts`: **86.15% lines / 69.86% branches** ✅ (subió de 38% gracias a integration tests)
- Cobertura global: **81.66% lines / 70.95% branches** ✅ (ambos umbrales superados)

## Archivos
```
apps/api/src/modules/trips/
├── trips.types.ts           ← TripStatus (+ PENDING_APPROVAL, APPROVED), TripActor (+ dispatcher), Trip, TripStatusHistory
├── trip-state-machine.ts    ← Clase pura: 16 transiciones (5 nuevas Sprint 17), getCancellationFee()
├── trips.repository.ts      ← CRUD + findActiveBy{Passenger,Driver}Id + findAllActiveByDriverId + findPendingApproval
├── trips.service.ts         ← 11 métodos: + approveTrip, rejectTrip, getPendingApproval, handlePromoteApproved
├── trips.controller.ts      ← 12 handlers: + approve, reject
├── trips.routes.ts          ← 11 rutas: + POST /:id/approve, POST /:id/reject
├── trips.queue.ts           ← BullMQ — searching-timeout (300s) + trip.promote-approved (0s) en Redis
└── trips.workers.ts         ← registerTripsWorkers(timeout handler, promoteApproved handler)

apps/api/src/modules/admin/
└── admin-trips.routes.ts    ← GET /admin/trips/pending-approval (paginado, admin only)

apps/web/src/pages/AprobacionesPage.tsx    ← tabla + approve/reject + modal reason
apps/web/src/hooks/usePendingApprovals.ts  ← TanStack Query staleTime 30s
apps/mobile-v2/src/screens/passenger/ActiveTripScreen.tsx  ← banners PENDING_APPROVAL + APPROVED

migrations/...038_alter_trips_add_approval_fields.ts  ← approved_at, approved_by FK admin_users
seeds/11_enable_approval_verticals.ts                 ← requiresApproval: true en custody + cold-chain
```

## Endpoints
| Método | Path | Auth |
|---|---|---|
| POST | /trips | JWT passenger |
| PATCH | /trips/:id/accept | JWT driver |
| PATCH | /trips/:id/status | JWT driver |
| PATCH | /trips/:id/cancel | JWT passenger o driver |
| PATCH | /trips/:id/destination | JWT passenger |
| GET | /trips/active | JWT passenger |
| GET | /trips/driver/active | JWT driver |
| GET | /trips/:id | JWT (actor del viaje o admin) |
| GET | /trips | JWT passenger |
| POST | /trips/:id/approve | JWT admin o dispatcher |
| POST | /trips/:id/reject | JWT admin o dispatcher |
| GET | /admin/trips/pending-approval | JWT admin |

## Estado de la máquina
```
Flujo taxi (requiresApproval: false):
  REQUESTED → SEARCHING → ACCEPTED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED

Flujo B2B (requiresApproval: true):
  REQUESTED → PENDING_APPROVAL → APPROVED → SEARCHING → ACCEPTED → ...
                    ↓↓               ↓↓
                CANCELLED        CANCELLED
```
16 transiciones · 2 estados finales · 4 actores (system, driver, passenger, dispatcher)

## Trip Stacking (R-TRIP-002) — Sprint 16
- `acceptTrip` permite hasta 2 viajes por conductor
- Segundo viaje solo permitido si el primero está `IN_PROGRESS` con ≤10 min restantes
- Errores: `DRIVER_TRIP_QUEUE_FULL` (409) si ya hay 2 · `DRIVER_NOT_NEAR_COMPLETION` (409) si >10 min
- Mobile: `queuedTrip` en store — no reemplaza `activeTrip`, se promueve al completar viaje 1

## Mobile — driver.store
```typescript
interface ActiveTrip { id, status, originLat, originLng, destinationLat, destinationLng }
// Estado del store:
activeTrip: ActiveTrip | null    // viaje actual en ejecución
queuedTrip: ActiveTrip | null    // viaje aceptado en cola (stacking)
```

## Decisiones clave
- TripStateMachine es clase pura — SELECT FOR UPDATE lo aplica trips.service.ts
- JWT sub = user_id; driver_id se resuelve via DriversRepository.findByUserId()
- BullMQ queue: initTripsQueue(redis) desde app.ts (singleton lazy)
- `buildIntegrationApp` también debe inicializar `paymentQueue` y `notificationQueue` (fix 2026-04-23)
- `SEARCHING→CANCELLED` permite actor `passenger` además de `system` (fix 2026-04-23)
- Socket.io: getIO() singleton desde realtime.plugin.ts
- Rooms: trip:{trip_id} — pasajero y conductor del mismo viaje
- Cancelación passenger: $0 si < 120s de ACCEPTED; $50 MXN si ≥ 120s (ADR-026)
- Driver cancela: siempre $0
- **[Sprint 17]** Dispatcher actorId = null en todas las transiciones (FK changed_by → users.id, admin vive en admin_users). Trazabilidad via trips.approved_by + notes del historial (ADR-047)
- **[Sprint 17]** `requiresApproval` se lee de `verticalService.getConfig()` en createTrip — inyectado via setVerticalService() para evitar dependencia circular en app.ts

## Cambios Sprint 10
- `trips.metadata JSONB DEFAULT '{}'` — campo opcional en POST /trips, retornado en GET /trips/:id y /active
- `trips.types.ts`: Trip interface incluye `metadata: Record<string, unknown>`
- `CreateTripDto`: incluye `metadata?: Record<string, unknown>`

## ADRs
- ADR-023: Haversine + radio 5km
- ADR-024: Socket.io namespaces (pendiente escritura formal)
- ADR-025: TripStateMachine clase pura (pendiente escritura formal)
- ADR-026: Política cancelación MVP (pendiente escritura formal)
- ADR-037: trips.metadata JSONB para extensibilidad multi-vertical sin migraciones adicionales

## Tests unitarios service — cobertura por método (2026-05-08)
| Método | Branches cubiertas |
|---|---|
| `getTripTrack` | TRIP_NOT_FOUND, admin, passenger own/other, driver found/notfound/mismatch, sin trackingService, con trackingService |
| `createTrip` | requiresApproval true/false, PASSENGER_HAS_ACTIVE_TRIP |
| `acceptTrip` | DRIVER_NOT_FOUND, DRIVER_NOT_APPROVED, DRIVER_TRIP_QUEUE_FULL, DRIVER_HAS_ACTIVE_TRIP, DRIVER_NOT_NEAR_COMPLETION, TRIP_NOT_FOUND, TRIP_NOT_IN_SEARCHING |
| `updateStatus` | DRIVER_NOT_FOUND, TRIP_NOT_FOUND, IN_PROGRESS (started_at), COMPLETED (final_fare + payment queue) |
| `cancelTrip` | DRIVER_NOT_FOUND, TRIP_NOT_FOUND, FORBIDDEN passenger/driver, re-throw non-cancel, TRIP_CANNOT_BE_CANCELLED (COMPLETED/CANCELLED), happy path passenger |
| `changeDestination` | TRIP_NOT_FOUND, TRIP_NOT_IN_PROGRESS, ONLY_PASSENGER_CAN_CHANGE_DESTINATION, happy path (deltaKm) |
| `getTripById` | TRIP_NOT_FOUND, FORBIDDEN, admin, passenger own, driver assigned |
| `getActiveTrip` | delegación a repo |
| `getActiveTripForDriver` | driver not found → null, delegación a repo |
| `getTripHistory` | delegación paginada |
| `getPendingApproval` | delegación a repo |
| `handleSearchingTimeout` | trip null, not SEARCHING, auto-cancel, race condition |
| `approveTrip` | sin driver (APPROVED), con driver (ACCEPTED), wrong status, driver offline, driver not found |
| `rejectTrip` | happy path, wrong status, empty/whitespace reason |
| `handlePromoteApproved` | trip null, not APPROVED, race condition inner, happy path (SEARCHING + enqueue) |

Sin cubrir (acceptTrip happy path): requiere `db` callable para `this.db('scheduled_trips').where().first()` — bajo impacto, ~6 líneas.

## Pendiente
- acceptTrip happy path (6 líneas): necesita callable db mock — coverage actual ya supera ambos umbrales
- Bug corregido 2026-05-08: `createTrip` — `getIO()` sin try/catch causaba 500 en integration tests cuando Socket.io no estaba inicializado
