# Snapshot — Módulo: Scheduled Trips
> Última actualización: 2026-04-24 — Sprint 9 completo

---

## Estado: ✅ COMPLETO (Sprint 9)

## Cobertura de tests

| Área | Tests | Notas |
|---|---|---|
| scheduler.service (backend) | 26 unit tests (Sprint 6) | Incluye despacho T-30 y push T-15 |
| scheduled-trips.service (backend) | integrado en scheduled-trips.service.test.ts | mockRow actualizado con campos migration 033 |
| ScheduledTripsScreen (mobile) | 10 unit tests | list, empty, cancel, loading states |
| ScheduleConfirmScreen (mobile) | 14 unit tests | DateTimePicker, validación, POST, error codes |

---

## Arquitectura del módulo

### Backend — endpoints existentes (Sprint 6, sin cambios en Sprint 9)

```
POST   /trips/schedule          → scheduled-trips.controller → scheduled-trips.service
GET    /trips/scheduled         → scheduled-trips.controller → scheduled-trips.repository
DELETE /trips/scheduled/:tripId → scheduled-trips.controller → scheduled-trips.service
```

### Backend — modificaciones Sprint 9

```
scheduler.service.ts
  - Despacho: WHERE (scheduled_for - dispatch_window_min * INTERVAL) <= NOW() AND search_started_at IS NULL
  - markSearchStarted(): UPDATE scheduled_trips SET search_started_at = NOW()
  - getTripsNeedingSearchingNotification(): T-15 push al pasajero si SEARCHING
  - markPassengerNotifiedSearching(): se llama ANTES de encolar el push (idempotencia)

trips.service.ts (acceptTrip)
  - Tras SEARCHING→ACCEPTED: busca scheduled_trips para este trip_id
  - Si existe: encola push al conductor ('trip_scheduled_accepted') con hora formateada es-MX

admin.repository.ts (getTrips)
  - LEFT JOIN scheduled_trips AS scht ON scht.trip_id = t.id
  - SELECT: scht.scheduled_for::text, scht.search_started_at::text
  - AdminTripRow: scheduled_for?: string|null; search_started_at?: string|null
```

### Mobile — pantallas Sprint 9

```
apps/mobile-v2/src/screens/passenger/
  ScheduledTripsScreen.tsx
    - useQuery(['scheduled-trips']) → GET /trips/scheduled
    - FlatList de tarjetas, pull-to-refresh, estado vacío
    - Cancelar: Alert.alert → DELETE /trips/scheduled/:id → invalidateQueries

  ScheduleConfirmScreen.tsx
    - Params: originLat, originLng, originAddress, stops[], tripTypeId, tripTypeName, estimatedFare
    - DateTimePicker date (modo date, minimumDate hoy) → DateTimePicker time (modo time)
    - Validación: fecha seleccionada >= now + 30 min
    - POST /trips/schedule → navigation.replace('ScheduledTrips')

  HomeScreen.tsx — botón "Mis programados" (testID: home-scheduled-trips-btn)
  EstimateScreen.tsx — CTA "Programar para después" cuando hay tipo seleccionado
```

### Backoffice web — Sprint 9

```
apps/web/src/pages/DashboardPage.tsx
  - useQuery: GET /admin/trips?status=SCHEDULED&limit=50 (refetchInterval: 30s)
  - Tab "Programados" con tabla: pasajero, origen→destino, fecha programada, tipo, tarifa, estado
  - getDispatchBadge(): "🔍 Buscando conductor" (search_started_at != null) | "⏳ Despacha a las HH:MM"
  - formatScheduledDate(): es-MX, timezone America/Mexico_City
```

---

## Schema de BD — tabla scheduled_trips (post migration 033)

```sql
scheduled_trips:
  trip_id                        UUID PK FK trips.id
  scheduled_for                  TIMESTAMPTZ NOT NULL
  reminder_24h_sent              BOOLEAN DEFAULT false
  reminder_1h_sent               BOOLEAN DEFAULT false
  dispatch_window_min            INTEGER NOT NULL DEFAULT 30   -- ADR-035
  search_started_at              TIMESTAMPTZ NULL              -- guard idempotencia
  passenger_notified_searching_at TIMESTAMPTZ NULL             -- push T-15
  pre_assigned_driver_id         UUID NULL FK drivers.id       -- Opción B (Fase 2)
  pre_assigned_at                TIMESTAMPTZ NULL              -- Opción B (Fase 2)
```

---

## Reglas de negocio críticas

- Un pasajero no puede programar si ya tiene un viaje activo/programado (PASSENGER_HAS_ACTIVE_TRIP)
- Mínimo 30 minutos de anticipación (SCHEDULED_TOO_SOON)
- El scheduler despacha a T-dispatch_window_min (DEFAULT 30), NO a T-0
- `search_started_at IS NULL` en el WHERE del scheduler — idempotencia estricta
- Push al conductor se encola DESPUÉS de la transacción de acceptTrip
- Push T-15 al pasajero: `passenger_notified_searching_at` se marca ANTES de encolar (evita duplicados)

---

## ADRs aplicables

| ADR | Decisión |
|---|---|
| ADR-029 | Scheduler: node-cron cada minuto |
| ADR-034 | @react-native-community/datetimepicker para selección nativa de fecha/hora |
| ADR-035 | dispatch_window_min almacenado por viaje (DEFAULT 30), no hardcodeado |

---

## Bug corregido (2026-04-25) — commit 67aa213

`scheduledRepo.create()` usaba `this.db` (conexión global) en lugar de `trx` dentro del bloque `db.transaction()` de `scheduled-trips.service.ts`. El FK constraint `scheduled_trips.trip_id → trips.id` fallaba porque el `INSERT INTO trips` todavía no se había commiteado cuando se intentaba el `INSERT INTO scheduled_trips`.

**Fix:** `create(tripId, scheduledFor, trx?: Knex.Transaction)` — el service ahora pasa `trx`.

---

## Pendiente (Fase 2)

- Opción B: pre-asignación de conductor (campos ya en DB: pre_assigned_driver_id, pre_assigned_at)
- Escalada de radio de búsqueda si T-10 sin conductor
- Penalización al conductor por cancelar viaje programado aceptado
- Rebuild APK (requiere native rebuild por @react-native-community/datetimepicker)
- Smoke tests Playwright staging
