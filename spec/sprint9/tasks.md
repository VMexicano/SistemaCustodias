# Sprint 9 — Tasks (TDD)
> Generado: 2026-04-24 · Sprint 9 Viajes Programados

---

## Resumen de tareas

| ID | Título | Tipo | Estado | Agentes | Irreversible |
|---|---|---|---|---|---|
| SCHED-API-001 | Agregar `scheduled_for` a `GET /admin/trips` | FEATURE | ✅ | backend | — |
| SCHED-API-002 | Migration 033: nuevos campos en `scheduled_trips` | MIGRATION | ✅ | backend | ✅ |
| SCHED-API-003 | Scheduler: despacho a T-30 + push pasajero T-15 | FEATURE | ✅ | backend | — |
| SCHED-API-004 | Push al conductor al aceptar viaje programado | FEATURE | ✅ | backend | — |
| SCHED-MOB-001 | `ScheduledTripsScreen` — lista + cancelar | FEATURE | ✅ | mobile | — |
| SCHED-MOB-002 | `ScheduleConfirmScreen` — date picker + confirmar | FEATURE | ✅ | mobile | — |
| SCHED-MOB-003 | Integrar navegación y acceso desde Home/Estimate | FEATURE | ✅ | mobile | — |
| SCHED-WEB-001 | Backoffice: sección "Viajes programados" | FEATURE | ✅ | mobile | — |
| SCHED-QA-001 | Tests Jest — pantallas nuevas | QA_ONLY | ✅ | qa | — |
| SCHED-API-005 | Agregar `search_started_at` a `GET /admin/trips` para badge de estado | FEATURE | 🔲 | backend | — |

---

## Grafo de dependencias

```
Grupo 1 (sin dependencias — lanzar en paralelo):
  SCHED-API-001 ──────────────────────────────────────────────┐
  SCHED-API-002 ──────────────────┐                           │
  SCHED-MOB-001 ──────────────┐   │                           │
  SCHED-MOB-002 ───────────┐  │   │                           │
                           │  │   │                           │
Grupo 2 (esperan G1):      │  │   │                           │
  SCHED-API-003 (← API-002)│  │   ↓                           │
  SCHED-API-004 (← API-002)│  │   ↓                           │
  SCHED-MOB-003 (← MOB-001+MOB-002) ───────────────────────┐  │
  SCHED-WEB-001 (← API-001) ←──────────────────────────────┘  │
                                                               │
Grupo 3 (espera G2 completo):                                  │
  SCHED-QA-001 ←─────────────────────────────────────────────-┘
```

---

## Grupos de ejecución paralela

### Grupo 1 — Sin dependencias (lanzar simultáneamente)
**Condición de inicio:** inmediato
- `SCHED-API-001` — backend
- `SCHED-API-002` — backend
- `SCHED-MOB-001` — mobile (escribe en `screens/passenger/ScheduledTripsScreen.tsx`)
- `SCHED-MOB-002` — mobile (escribe en `screens/passenger/ScheduleConfirmScreen.tsx`)

> Regla: SCHED-API-001 y SCHED-API-002 tocan archivos distintos (`admin.repository.ts` vs `migrations/`). Pueden correr en paralelo sin conflicto.
> SCHED-MOB-001 y SCHED-MOB-002 crean archivos nuevos distintos. Sin conflicto.

### Grupo 2 — Esperan Grupo 1
**Condición de inicio:** SCHED-API-002 ✅ para API-003 y API-004 · SCHED-MOB-001+MOB-002 ✅ para MOB-003 · SCHED-API-001 ✅ para WEB-001
- `SCHED-API-003` — backend (modifica `scheduler.service.ts`)
- `SCHED-API-004` — backend (modifica `trips.service.ts`)
- `SCHED-MOB-003` — mobile (modifica `types.ts`, `PassengerStack.tsx`, `HomeScreen.tsx`, `EstimateScreen.tsx`)
- `SCHED-WEB-001` — mobile/frontend (modifica `DashboardPage.tsx`)

> Regla: SCHED-API-003 modifica `scheduler.service.ts`. SCHED-API-004 modifica `trips.service.ts`. Sin conflicto — corren en paralelo.
> SCHED-MOB-003 modifica archivos existentes (tipos, stack, Home, Estimate). WEB-001 modifica `DashboardPage.tsx`. Sin conflicto.

### Grupo 3 — Espera Grupo 2 completo
**Condición de inicio:** todos los anteriores ✅
- `SCHED-QA-001` — qa

---

## Tareas detalladas

---

### SCHED-API-001 — Agregar `scheduled_for` a `GET /admin/trips`

**Tipo:** FEATURE · **Sprint:** 9 · **Agentes:** backend
**Depende de:** ninguna · **Irreversible:** no

**Scope incluye:**
- `admin.repository.ts`: agregar `LEFT JOIN scheduled_trips as scht ON scht.trip_id = t.id` al método `getTrips()`
- Agregar `this.db.raw('scht.scheduled_for::text AS scheduled_for')` al SELECT
- `AdminTripRow`: agregar campo `scheduled_for?: string | null`
- `AdminTripDbRow`: agregar `scheduled_for?: string | null`
- Mapping en `mappedData`: `scheduled_for: trip.scheduled_for ?? null`

**Scope excluye:** Cancelar viajes desde admin, otros campos de `scheduled_trips`

**Criterio de aceptación (negocio):** `GET /admin/trips?status=SCHEDULED` devuelve `scheduled_for` por viaje
**Criterio de aceptación (técnico):** TypeScript strict, LEFT JOIN no rompe trips sin registro en `scheduled_trips` (null), tests existentes de admin siguen pasando

**Checklist técnico:**
- [ ] `dependencies_verified`: solo Knex — ya instalado
- [ ] `schema_verified`: `scheduled_trips.scheduled_for` existe desde migration 016 ✅
- [ ] `actor_resolution`: JWT admin roles=['admin'] — autenticación existente

**Tests a escribir (si aplica):**
- No requiere nuevo test de unidad — el comportamiento es un LEFT JOIN. Verificar que los tests de integración existentes (`admin.service.test.ts`) no fallan.

---

### SCHED-API-002 — Migration 033: nuevos campos en `scheduled_trips`

**Tipo:** MIGRATION · **Sprint:** 9 · **Agentes:** backend
**Depende de:** ninguna · **Irreversible:** sí — migración de BD (additive, bajo riesgo)

**Scope incluye:**
- Crear `apps/api/migrations/20240101000033_alter_scheduled_trips_add_dispatch_fields.ts`
- Agregar 5 columnas (ver design.md sección Migration 033)
- Actualizar `ScheduledTripRow` en `scheduled-trips.repository.ts` con los nuevos campos opcionales

**Scope excluye:** Lógica que use los campos (eso es SCHED-API-003/004), seeds

**Criterio de aceptación (negocio):** La tabla `scheduled_trips` tiene los campos que habilitan despacho anticipado y pre-asignación futura
**Criterio de aceptación (técnico):** `knex migrate:latest` sin errores, `knex migrate:rollback` sin errores, rows existentes tienen `dispatch_window_min = 30` y nulls en los demás

**Campos nuevos — tipos Knex:**
```typescript
// dispatch_window_min: integer().notNullable().defaultTo(30)
// search_started_at: timestamp({ useTz: true }).nullable()
// passenger_notified_searching_at: timestamp({ useTz: true }).nullable()
// pre_assigned_driver_id: uuid().nullable().references('id').inTable('drivers').onDelete('SET NULL')
// pre_assigned_at: timestamp({ useTz: true }).nullable()
```

**Checklist técnico:**
- [ ] `dependencies_verified`: Knex — ya instalado
- [ ] `schema_verified`: `drivers.id` es UUID PRIMARY KEY ✅ (FK válida)
- [ ] `actor_resolution`: N/A

---

### SCHED-API-003 — Scheduler: despacho a T-30 + push pasajero T-15

**Tipo:** FEATURE · **Sprint:** 9 · **Agentes:** backend
**Depende de:** SCHED-API-002

**Scope incluye:**
- `scheduler.service.ts`: cambiar condición de despacho a `scheduled_for - (dispatch_window_min * interval '1 minute') <= NOW() AND search_started_at IS NULL`
- Al despachar: `UPDATE scheduled_trips SET search_started_at = NOW() WHERE trip_id = :id`
- Nueva lógica tick T-15: buscar trips donde `search_started_at IS NOT NULL AND t.status = 'SEARCHING' AND scheduled_for - interval '15 minutes' <= NOW() AND passenger_notified_searching_at IS NULL`
  → enqueue notificationQueue `{ type: 'scheduled_trip_searching', passengerId, message: 'Estamos buscando tu conductor, mantente pendiente' }`
  → `UPDATE scheduled_trips SET passenger_notified_searching_at = NOW()`
- `scheduler.repository.ts`: actualizar métodos de query para leer `dispatch_window_min` y `search_started_at`

**Scope excluye:** Escalada de radio, asignación manual, penalizaciones

**Criterio de aceptación (negocio):** Viaje a las 9:00 AM despacha a las 8:30. Si a las 8:45 sin conductor, pasajero recibe push
**Criterio de aceptación (técnico):** Tests con `jest.useFakeTimers()` verifican ambas condiciones, `search_started_at` guardado, push mockeado verificado, viaje no se despacha dos veces

**Tests a escribir:**
```
scheduler.service.test.ts:
  ✓ despacha viaje cuando scheduled_for - 30min <= NOW y search_started_at IS NULL
  ✓ NO despacha viaje cuando search_started_at ya está seteado (idempotencia)
  ✓ NO despacha viaje cuando scheduled_for - 30min > NOW
  ✓ envía push pasajero cuando trip en SEARCHING y T-15 y passenger_notified_searching_at IS NULL
  ✓ NO envía push pasajero si passenger_notified_searching_at ya está seteado
  ✓ NO envía push pasajero si trip ya no está en SEARCHING
```

**Checklist técnico:**
- [ ] `dependencies_verified`: node-cron, BullMQ notificationQueue — ya instalados
- [ ] `schema_verified`: `scheduled_trips.dispatch_window_min`, `search_started_at`, `passenger_notified_searching_at` — disponibles tras SCHED-API-002
- [ ] `actor_resolution`: `changed_by = system` en status history

---

### SCHED-API-004 — Push al conductor al aceptar viaje programado

**Tipo:** FEATURE · **Sprint:** 9 · **Agentes:** backend
**Depende de:** SCHED-API-002

**Scope incluye:**
- `trips.service.ts` en la transición `SEARCHING → ACCEPTED`:
  1. Query: `SELECT scheduled_for FROM scheduled_trips WHERE trip_id = :id` (LEFT JOIN ya disponible)
  2. Si existe registro: enqueue notificationQueue con push al driver:
     `{ type: 'trip_scheduled_accepted', driverId, scheduledFor, message: 'Viaje agendado — el pasajero debe salir a las HH:MM. Llega a tiempo' }`
  3. Si no existe registro: flujo normal sin cambios
- Actualizar `scheduler.service.ts` (tick T-15): cuando envía `notif_15m_sent`, enviar push también al conductor asignado (si `trip.driver_id IS NOT NULL`)

**Scope excluye:** Push de recordatorio adicional a T-5 (futuro), penalizaciones, reemplazo de conductor

**Criterio de aceptación (negocio):** Conductor recibe push inmediato con hora acordada al aceptar; push de recordatorio a T-15
**Criterio de aceptación (técnico):** Tests verifican que `notificationQueue.add()` se llama con los datos correctos; trips no programados no generan push adicional

**Tests a escribir:**
```
trips.service.test.ts:
  ✓ al aceptar viaje programado: notificationQueue.add() con type='trip_scheduled_accepted' y scheduledFor
  ✓ al aceptar viaje NO programado: notificationQueue.add() NO incluye tipo scheduled
  ✓ formato de hora: "HH:MM" en zona horaria America/Mexico_City

scheduler.service.test.ts (extensión de SCHED-API-003):
  ✓ en tick T-15: envía push al conductor asignado además del pasajero
```

**Checklist técnico:**
- [ ] `dependencies_verified`: notificationQueue (BullMQ) — ya instalado
- [ ] `schema_verified`: `scheduled_trips.scheduled_for`, `trips.driver_id` — existentes
- [ ] `actor_resolution`: `driver_id` en trips resuelve al conductor; push usa `device_tokens` por `user_id` del driver

---

### SCHED-MOB-001 — `ScheduledTripsScreen` — lista + cancelar

**Tipo:** FEATURE · **Sprint:** 9 · **Agentes:** mobile
**Depende de:** ninguna · **Irreversible:** no

**Scope incluye:**
- Crear `apps/mobile-v2/src/screens/passenger/ScheduledTripsScreen.tsx`
- `useQuery` → `GET /trips/scheduled` → lista de tarjetas
- Cada tarjeta: origen → destino, fecha/hora (`toLocaleDateString('es-MX') + toLocaleTimeString('es-MX')`), tipo de servicio, tarifa estimada (`$XX.XX MXN`)
- Estado vacío: icono + "No tienes viajes programados aún"
- Cancelar: `Alert.alert('¿Cancelar viaje?', '...', Cancelar | Sí)` → `DELETE /trips/scheduled/:trip_id` → `invalidateQueries`
- Pull-to-refresh en la lista

**Scope excluye:** Crear viaje desde esta pantalla, paginación, filtros

**Criterio de aceptación (negocio):** Pasajero ve lista, puede cancelar con confirmación
**Criterio de aceptación (técnico):** TypeScript strict, `useQuery` con loading/error states, invalidate funciona

**Contrato API consumido:**
- `GET /trips/scheduled` → `{ data: ScheduledTripRow[] }`
- `DELETE /trips/scheduled/:tripId` → 204

**Tests a escribir (SCHED-QA-001):**
```
ScheduledTripsScreen.test.tsx:
  ✓ render lista con 2 viajes: muestra origen, destino, fecha, tipo, precio de cada uno
  ✓ render estado vacío cuando data = []
  ✓ render loading state
  ✓ al cancelar y confirmar: llama DELETE y refresca lista
  ✓ al cancelar y rechazar confirmación: no llama DELETE
```

**Checklist técnico:**
- [ ] `dependencies_verified`: React Query, Axios — ya instalados
- [ ] `schema_verified`: `ScheduledTripRow` — definida en `scheduled-trips.repository.ts` ✅
- [ ] `actor_resolution`: JWT pasajero — autenticación existente via `api.client.ts` interceptor

---

### SCHED-MOB-002 — `ScheduleConfirmScreen` — date picker + confirmar

**Tipo:** FEATURE · **Sprint:** 9 · **Agentes:** mobile
**Depende de:** ninguna · **Irreversible:** no

**Scope incluye:**
- Crear `apps/mobile-v2/src/screens/passenger/ScheduleConfirmScreen.tsx`
- Verificar si `@react-native-community/datetimepicker` está disponible: `pnpm list --filter mobile-v2 @react-native-community/datetimepicker`
  - Si no está: `pnpm add @react-native-community/datetimepicker --filter mobile-v2` + anotar que requiere rebuild APK
- Resumen del viaje en la parte superior (origen, destino, tipo, tarifa)
- DateTimePicker fecha: `mode='date'`, `minimumDate={new Date()}`
- DateTimePicker hora: `mode='time'`, en pantalla separada o secuencial
- Validación local: `selectedDate >= new Date(Date.now() + 30 * 60 * 1000)` — mostrar error inline si no
- Botón "Confirmar programación": disabled si validación falla
- `POST /trips/schedule` → `{ trip_id, scheduled_for, estimated_fare }`
- Tras éxito: `navigation.replace('ScheduledTrips')`
- Manejo de errores API: `SCHEDULED_TOO_SOON`, `PASSENGER_HAS_ACTIVE_TRIP`

**Scope excluye:** Selección de origen/destino (viene de params), métodos de pago

**Criterio de aceptación (negocio):** Pasajero puede elegir fecha/hora ≥30 min y confirmar
**Criterio de aceptación (técnico):** Picker funcional en Android, validación local activa, POST integrado

**Contrato API consumido:**
- `POST /trips/schedule` → body `{ origin, destination, tripTypeId, scheduledFor }` → `{ trip_id, scheduled_for, estimated_fare, currency }`

**Tests a escribir (SCHED-QA-001):**
```
ScheduleConfirmScreen.test.tsx:
  ✓ render resumen con datos recibidos por params
  ✓ botón confirm disabled si fecha seleccionada < now + 30min
  ✓ muestra error inline "Selecciona al menos 30 minutos en el futuro"
  ✓ al confirmar con fecha válida: llama POST /trips/schedule con scheduledFor correcto
  ✓ muestra error de API PASSENGER_HAS_ACTIVE_TRIP
  ✓ navega a ScheduledTrips tras éxito
```

**Checklist técnico:**
- [ ] `dependencies_verified`: `@react-native-community/datetimepicker` — verificar antes de instalar
- [ ] `schema_verified`: body de `POST /trips/schedule` confirmado en `scheduled-trips.routes.ts` ✅
- [ ] `actor_resolution`: JWT pasajero — interceptor existente en `api.client.ts`

---

### SCHED-MOB-003 — Integrar navegación y acceso desde Home/Estimate

**Tipo:** FEATURE · **Sprint:** 9 · **Agentes:** mobile
**Depende de:** SCHED-MOB-001, SCHED-MOB-002

**Scope incluye:**
- `types.ts`: agregar `ScheduleConfirm` (con params) y `ScheduledTrips: undefined` a `PassengerStackParamList`
- `PassengerStack.tsx`: registrar `ScheduleConfirmScreen` y `ScheduledTripsScreen`
- `HomeScreen.tsx`: botón "Mis programados" en la UI (ícono de calendario o botón pequeño en header/overlay). Si hay viajes programados, mostrar badge numérico — requiere `useQuery GET /trips/scheduled` para count
- `EstimateScreen.tsx`: al tener un tipo de servicio seleccionado, mostrar segundo botón "Programar para después" junto al CTA existente "Solicitar ahora". Navega a `ScheduleConfirm` con los parámetros del viaje seleccionado

**Scope excluye:** DriverStack, RootNavigator, animaciones personalizadas, deep links

**Criterio de aceptación (negocio):** Flujo completo Estimate → ScheduleConfirm → ScheduledTrips funciona; HomeScreen → ScheduledTrips funciona
**Criterio de aceptación (técnico):** `PassengerStackParamList` tipado correctamente, sin errores TypeScript en navegación, badge se actualiza con React Query

**Checklist técnico:**
- [ ] `dependencies_verified`: React Navigation — ya instalado
- [ ] `schema_verified`: params de `ScheduleConfirm` deben incluir todos los campos que `ScheduleConfirmScreen` espera (origen, destino, tripTypeId, estimatedFare, tipeName)
- [ ] `actor_resolution`: N/A (solo navegación)

> Regla de archivos compartidos (Sprint 6):
> SCHED-MOB-003 **MODIFICA** archivos existentes. SCHED-MOB-001 y SCHED-MOB-002 **CREAN** archivos nuevos.
> Lanzar MOB-003 solo cuando MOB-001 y MOB-002 ✅ para evitar conflictos en imports.

---

### SCHED-WEB-001 — Backoffice: sección "Viajes programados"

**Tipo:** FEATURE · **Sprint:** 9 · **Agentes:** mobile (frontend Vite/React)
**Depende de:** SCHED-API-001

**Scope incluye:**
- `DashboardPage.tsx`: agregar nueva tab o sección "Programados" (junto a las existentes "Viajes" y "Conductores")
- `useQuery` → `GET /admin/trips?status=SCHEDULED&limit=50`
- Tabla con columnas: Pasajero | Origen → Destino | Fecha programada | Tipo | Tarifa estimada
- Fecha formateada: `new Date(scheduled_for).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })`
- Estado vacío: "No hay viajes programados"
- Solo lectura — sin botones de acción

**Scope excluye:** Paginación, filtros por fecha, cancelar desde admin, editar

**Criterio de aceptación (negocio):** Admin ve todos los viajes SCHEDULED con fecha/hora de salida
**Criterio de aceptación (técnico):** TypeScript strict, `scheduled_for` formateado correctamente, sin errores si `scheduled_for` es null (LEFT JOIN puede devolver null para trips sin registro en scheduled_trips)

**Contrato API consumido:**
- `GET /admin/trips?status=SCHEDULED` → `AdminTripRow[]` con `scheduled_for?: string | null`

**Checklist técnico:**
- [ ] `dependencies_verified`: TanStack Query, TanStack Router — ya instalados en `apps/web`
- [ ] `schema_verified`: `AdminTripRow.scheduled_for` disponible tras SCHED-API-001 ✅
- [ ] `actor_resolution`: JWT admin — autenticación existente via `lib/auth.ts`

---

### SCHED-QA-001 — Tests Jest para pantallas nuevas

**Tipo:** QA_ONLY · **Sprint:** 9 · **Agentes:** qa
**Depende de:** SCHED-MOB-001, SCHED-MOB-002, SCHED-MOB-003

**Scope incluye:**
- `apps/mobile-v2/src/__tests__/screens/ScheduledTripsScreen.test.tsx` (ver tests en SCHED-MOB-001)
- `apps/mobile-v2/src/__tests__/screens/ScheduleConfirmScreen.test.tsx` (ver tests en SCHED-MOB-002)
- Mock de `@react-native-community/datetimepicker` en jest setup si no existe ya

**Scope excluye:** Tests E2E Detox, tests de admin web, tests de backend (esos van en SCHED-API-003/004)

**Criterio de aceptación (técnico):**
- ≥80% statement coverage en `ScheduledTripsScreen.tsx` y `ScheduleConfirmScreen.tsx`
- Todos los tests pasan con `npx jest --silent --testPathPattern="Scheduled"`
- Mock de datetimepicker: `jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker')`

**Notas al agente qa:**
- Seguir patrón de tests existentes en `apps/mobile-v2/src/__tests__/stores/trip.store.test.ts`
- Las pantallas usan React Query — wrappear con `QueryClientProvider` en render de test
- Los API calls van via `api.client.ts` — mockear con `jest.mock('../../../services/api.client')`

---

### SCHED-API-005 — Agregar `search_started_at` a `GET /admin/trips` para badge de estado

**Tipo:** FEATURE · **Sprint:** 9 (pendiente) · **Agentes:** backend
**Depende de:** SCHED-API-001 ✅, SCHED-API-002 ✅ · **Irreversible:** no

**Contexto:** La migration 033 agregó `search_started_at` a `scheduled_trips`. El campo registra cuándo el scheduler arrancó la búsqueda de conductor (T-30 min antes de `scheduled_for`). Con este dato, el backoffice puede mostrar un badge que distinga entre "Pendiente de despacho" y "Buscando conductor".

**Scope incluye:**
- `admin.repository.ts`: agregar `scht.search_started_at::text AS search_started_at` al SELECT del LEFT JOIN ya existente (misma query de SCHED-API-001)
- `AdminTripRow`: agregar `search_started_at?: string | null`
- `DashboardPage.tsx`: columna o badge en la sección "Programados":
  - `search_started_at IS NULL` → badge gris "⏳ Pendiente despacho" (se despachará a `scheduled_for - 30 min`)
  - `search_started_at IS NOT NULL` → badge azul "🔍 Buscando conductor"

**Scope excluye:** `passenger_notified_searching_at`, `pre_assigned_driver_id` (Opción B futura), otros endpoints admin

**Criterio de aceptación (negocio):** El admin puede distinguir visualmente qué viajes programados ya están en búsqueda activa de conductor y cuáles aún no han sido despachados

**Criterio de aceptación (técnico):** `AdminTripRow.search_started_at?: string | null`, LEFT JOIN sin cambios estructurales (solo agregar campo al SELECT), TypeScript strict, tests admin existentes siguen pasando

**Implementación estimada:** ~30 min — es una sola línea en el SELECT + tipo + badge en UI

---

## Definition of Done — Sprint 9 completo

- [ ] Migration 033 aplicada sin errores (`knex migrate:latest`)
- [ ] `GET /admin/trips?status=SCHEDULED` devuelve `scheduled_for`
- [ ] Scheduler despacha a T-30 min (no T-0)
- [ ] `search_started_at` se guarda al despachar
- [ ] Push al pasajero si SEARCHING a T-15
- [ ] Push al conductor al aceptar viaje programado
- [ ] `ScheduledTripsScreen` funcional (lista + cancelar)
- [ ] `ScheduleConfirmScreen` funcional (picker + POST)
- [ ] Navegación completa: Home → Programados, Estimate → ScheduleConfirm → ScheduledTrips
- [ ] Sección "Programados" en backoffice con `scheduled_for` formateado
- [ ] Tests Jest ≥80% coverage en pantallas nuevas
- [ ] TypeScript: `npx tsc --noEmit` sin errores en `apps/api` y `apps/mobile-v2`
- [ ] `npx jest --silent` pasa en el módulo (backend + mobile)
- [ ] ADR-034 y ADR-035 documentadas en `docs/13_decisions_log.md`
- [ ] `context/snapshots/scheduled-trips.snapshot.md` actualizado

---

## Notas por agente

### Agente backend
- SCHED-API-002 debe completarse antes de SCHED-API-003 y SCHED-API-004
- En `scheduler.service.ts`: agregar `AND st.search_started_at IS NULL` a la condición de despacho es **crítico** para idempotencia — sin esto el scheduler re-despacharía el mismo viaje cada minuto
- Usar `knex.raw("scheduled_for - (dispatch_window_min * interval '1 minute') <= NOW()")` para la comparación

### Agente mobile
- Verificar `@react-native-community/datetimepicker` como primer paso de SCHED-MOB-002: `pnpm list --filter mobile-v2 @react-native-community/datetimepicker`
- Si no está instalado: documentar en el handoff que se requiere `pnpm add` + rebuild APK antes de que el agente QA pueda testear en emulador
- El badge en HomeScreen requiere una query ligera — puede usar `select count` o reutilizar la query de lista (contar `data.length`)
- En EstimateScreen, el botón "Programar" solo aparece cuando hay una tarjeta seleccionada (no en estado de carga inicial)

### Agente qa
- Mockear `@react-native-community/datetimepicker` globalmente en `jest.setup.ts` si aún no está mockeado
- Los tests de `scheduler.service.ts` deben usar `jest.useFakeTimers()` y `jest.setSystemTime()` para simular el paso del tiempo
- No correr la suite completa — usar `--testPathPattern="Scheduled|scheduler"` durante desarrollo
