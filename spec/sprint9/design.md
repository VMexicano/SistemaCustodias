# Sprint 9 — Design (SDD)
> Generado: 2026-04-24 · Sprint 9 Viajes Programados

---

## Arquitectura del sistema al finalizar Sprint 9

```
┌─────────────────────────────────────────────────────────────────────┐
│                        UBER_BASE — Sprint 9                         │
├──────────────────────────┬──────────────────────────────────────────┤
│  apps/mobile-v2          │  apps/api                                │
│  ─────────────────────── │  ─────────────────────────────────────── │
│  PassengerStack:         │  Módulo scheduled-trips (existente):     │
│  + ScheduledTripsScreen  │    POST /trips/schedule                  │
│  + ScheduleConfirmScreen │    GET  /trips/scheduled                 │
│                          │    DELETE /trips/scheduled/:tripId       │
│  HomeScreen:             │                                          │
│  + badge "Programados"   │  scheduler.service.ts (MODIFICADO):     │
│                          │    despacho a T-dispatch_window_min      │
│  EstimateScreen:         │    marca search_started_at               │
│  + CTA "Programar"       │    push pasajero a T-15 si SEARCHING     │
│                          │                                          │
│  @rn-community/          │  trips.service.ts (MODIFICADO):          │
│  datetimepicker (NEW)    │    push conductor al aceptar programado  │
│                          │                                          │
├──────────────────────────┤  admin.repository.ts (MODIFICADO):      │
│  apps/web                │    LEFT JOIN scheduled_trips             │
│  ─────────────────────── │    AdminTripRow.scheduled_for?: string   │
│  DashboardPage:          │                                          │
│  + Tab "Programados"     │  Migration 033 (NEW):                    │
│                          │    alter scheduled_trips                 │
└──────────────────────────┴──────────────────────────────────────────┘

Flujo de despacho anticipado (Opción A):

  NOW                T-30min           T-15min        T-0 (scheduled_for)
   │                    │                 │                   │
   │  SCHEDULED         │  REQUESTED      │  push pasajero    │  conductor
   │  (creado por       │  (scheduler     │  "buscando..."    │  en camino /
   │   pasajero)        │   despacha)     │  si SEARCHING     │  viaje inicia
   │                    │                 │                   │
   └────────────────────┴─────────────────┴───────────────────┘
         dispatch_window_min=30       passenger_notified_searching_at
```

---

## Estructura de directorios — archivos nuevos y modificados

```
apps/
├── mobile-v2/
│   ├── src/
│   │   ├── navigation/
│   │   │   ├── types.ts                    ← MODIFICADO: +ScheduleConfirm, +ScheduledTrips
│   │   │   └── PassengerStack.tsx          ← MODIFICADO: +2 screens
│   │   └── screens/
│   │       └── passenger/
│   │           ├── HomeScreen.tsx          ← MODIFICADO: +botón Programados
│   │           ├── EstimateScreen.tsx      ← MODIFICADO: +CTA "Programar"
│   │           ├── ScheduledTripsScreen.tsx  ← NUEVO
│   │           └── ScheduleConfirmScreen.tsx ← NUEVO
│   └── package.json                        ← MODIFICADO: +@rn-community/datetimepicker
│
├── api/
│   ├── migrations/
│   │   └── 20240101000033_alter_scheduled_trips_add_dispatch_fields.ts  ← NUEVO
│   └── src/modules/
│       ├── scheduled-trips/
│       │   └── scheduled-trips.repository.ts  ← MODIFICADO: ScheduledTripRow type
│       ├── scheduler/
│       │   └── scheduler.service.ts       ← MODIFICADO: despacho anticipado
│       ├── trips/
│       │   └── trips.service.ts           ← MODIFICADO: push conductor
│       └── admin/
│           └── admin.repository.ts        ← MODIFICADO: LEFT JOIN + scheduled_for
│
└── web/
    └── src/pages/
        └── DashboardPage.tsx              ← MODIFICADO: +sección Programados
```

---

## Migration 033 — `alter_scheduled_trips_add_dispatch_fields`

```typescript
// 20240101000033_alter_scheduled_trips_add_dispatch_fields.ts

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scheduled_trips', (table) => {
    // Opción A: ventana de despacho configurable (default 30 min)
    table.integer('dispatch_window_min').notNullable().defaultTo(30);

    // Auditoría: cuándo arrancó realmente la búsqueda
    table.timestamp('search_started_at', { useTz: true }).nullable();

    // Push "buscando conductor" al pasajero (T-15 antes de scheduled_for)
    table.timestamp('passenger_notified_searching_at', { useTz: true }).nullable();

    // Opción B (futuro): driver pre-asignado con anticipación
    table.uuid('pre_assigned_driver_id').nullable()
      .references('id').inTable('drivers').onDelete('SET NULL');

    // Auditoría: cuándo se hizo la pre-asignación
    table.timestamp('pre_assigned_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scheduled_trips', (table) => {
    table.dropColumn('dispatch_window_min');
    table.dropColumn('search_started_at');
    table.dropColumn('passenger_notified_searching_at');
    table.dropForeign(['pre_assigned_driver_id']);
    table.dropColumn('pre_assigned_driver_id');
    table.dropColumn('pre_assigned_at');
  });
}
```

---

## Diseño de componentes — Mobile

### `types.ts` — tipos de navegación actualizados

```typescript
export type PassengerStackParamList = {
  Home: undefined;
  SessionMenu: undefined;
  Estimate: {
    originLat: number;
    originLng: number;
    originAddress: string;
    stops: Stop[];
  };
  ActiveTrip: undefined;
  // NUEVOS Sprint 9:
  ScheduleConfirm: {
    originLat: number;
    originLng: number;
    originAddress: string;
    stops: Stop[];           // destinations (primer stop = destino principal)
    tripTypeId: string;
    tripTypeName: string;
    estimatedFare: number;
  };
  ScheduledTrips: undefined;
};
```

### `ScheduleConfirmScreen.tsx` — estructura

```typescript
interface Props {
  route: RouteProp<PassengerStackParamList, 'ScheduleConfirm'>;
  navigation: StackNavigationProp<PassengerStackParamList>;
}

// State:
// - date: Date (inicial: hoy + 31 min)
// - showDatePicker: boolean
// - showTimePicker: boolean
// - loading: boolean
// - error: string | null

// Flujo:
// 1. Render resumen (origen, destino, tipo, precio estimado)
// 2. DateTimePicker fecha (modo 'date', minimumDate: hoy)
// 3. DateTimePicker hora (modo 'time')
// 4. Validación local: date >= now + 30 min → si no, muestra error inline
// 5. Al confirmar: POST /trips/schedule → ScheduledTrips

// API call:
// POST /trips/schedule
// Body: { origin, destination, tripTypeId, scheduledFor: date.toISOString() }
// Response: { trip_id, scheduled_for, estimated_fare, currency }
```

### `ScheduledTripsScreen.tsx` — estructura

```typescript
// Datos de cada tarjeta (ScheduledTripRow de GET /trips/scheduled):
// { trip_id, scheduled_for, origin_address, destination_address,
//   estimated_fare, trip_type_name }

// Flujo:
// 1. useQuery: GET /trips/scheduled → lista
// 2. Render FlatList de tarjetas
// 3. Estado vacío: "No tienes viajes programados"
// 4. Cancelar: Alert.alert confirmación → DELETE /trips/scheduled/:trip_id
//    → invalidate query → tarjeta desaparece

// Formato fecha: toLocaleDateString('es-MX') + toLocaleTimeString('es-MX')
```

### `EstimateScreen.tsx` — modificación CTA

```
// Actual:    [Confirmar — $XX.XX]
// Nuevo:     [Solicitar ahora]   [Programar]
//
// "Solicitar ahora" → POST /trips (flujo existente)
// "Programar"       → navigate('ScheduleConfirm', { ...params, tripTypeId, estimatedFare })
```

---

## Diseño — Backend

### `scheduler.service.ts` — lógica de despacho actualizada

```typescript
// ANTES (Sprint 6):
// WHERE st.scheduled_for <= NOW() AND t.status = 'SCHEDULED'

// DESPUÉS (Sprint 9):
// WHERE (st.scheduled_for - (st.dispatch_window_min * interval '1 minute')) <= NOW()
//   AND t.status = 'SCHEDULED'
//   AND st.search_started_at IS NULL   ← evita re-despachar

// Al despachar:
// 1. UPDATE scheduled_trips SET search_started_at = NOW() WHERE trip_id = :id
// 2. Transicionar SCHEDULED → REQUESTED (ya existente)

// Lógica adicional — push pasajero T-15:
// WHERE st.search_started_at IS NOT NULL
//   AND t.status = 'SEARCHING'
//   AND (st.scheduled_for - interval '15 minutes') <= NOW()
//   AND st.passenger_notified_searching_at IS NULL
// → enqueue push pasajero: "Estamos buscando tu conductor, mantente pendiente"
// → UPDATE SET passenger_notified_searching_at = NOW()
```

### `trips.service.ts` — push conductor al aceptar programado

```typescript
// En la transición SEARCHING → ACCEPTED:
// 1. Buscar si existe registro en scheduled_trips para este trip_id
// 2. Si existe:
//    const hour = scheduledFor.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
//    notificationQueue.add({ type: 'trip_scheduled_reminder', driverId, scheduledFor, hour })
//
// Nota: el campo notif_15m_sent del scheduler también enviará recordatorio al conductor
//   — el scheduler debe enviar push TANTO al pasajero como al conductor en ese tick
```

### `admin.repository.ts` — LEFT JOIN `scheduled_trips`

```typescript
// AdminTripRow: agregar campo opcional
scheduled_for?: string | null;  // ISO string, null si no es viaje programado

// En getTrips():
// Agregar a la query:
.leftJoin('scheduled_trips as scht', 'scht.trip_id', 't.id')
// Agregar al SELECT:
this.db.raw('scht.scheduled_for::text AS scheduled_for')
// En el mapping: scheduled_for: trip.scheduled_for ?? null
```

---

## Contratos de API — endpoints existentes que se consumen desde mobile

### `GET /trips/scheduled`
```
Headers: Authorization: Bearer <access_token>

Response 200:
{
  data: Array<{
    id: string;               // scheduled_trips.id
    trip_id: string;
    scheduled_for: string;    // ISO 8601
    origin_address: string;
    destination_address: string;
    estimated_fare: number | null;
    trip_type_name: string;
  }>
}
```

### `POST /trips/schedule`
```
Headers: Authorization: Bearer <access_token>
Body:
{
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  tripTypeId: string;
  scheduledFor: string;  // ISO 8601, mínimo: now + 30 min
}

Response 201:
{
  trip_id: string;
  scheduled_for: string;   // ISO 8601
  estimated_fare: number;
  currency: "MXN";
}

Errores:
  400 SCHEDULED_TOO_SOON    — menos de 30 min de anticipación
  409 PASSENGER_HAS_ACTIVE_TRIP — ya tiene viaje activo/programado
  404 TRIP_TYPE_NOT_FOUND
```

### `DELETE /trips/scheduled/:tripId`
```
Headers: Authorization: Bearer <access_token>

Response 204: (sin body)

Errores:
  404 TRIP_NOT_FOUND
  403 FORBIDDEN
  409 TRIP_NOT_SCHEDULED
```

### `GET /admin/trips?status=SCHEDULED` (modificado Sprint 9)
```
Headers: Authorization: Bearer <admin_jwt>

Response 200:
{
  data: Array<{
    id: string;
    status: "SCHEDULED";
    passenger_name: string;
    origin_address: string;
    destination_address: string;
    scheduled_for: string | null;   // ← NUEVO en Sprint 9
    fare_amount: number | null;
    created_at: string;
  }>;
  total: number;
  page: number;
  limit: number;
}
```

---

## ADRs aplicables

### ADR-034 — DateTimePicker React Native (NUEVA)
**Fecha:** 2026-04-24 · **Estado:** Aceptada · **Área:** Mobile

**Contexto:** `ScheduleConfirmScreen` requiere que el pasajero seleccione fecha y hora. Opciones:
- `@react-native-community/datetimepicker` — componente nativo Android/iOS
- Picker custom con ScrollView/FlatList de slots pre-definidos

**Decisión:** `@react-native-community/datetimepicker`

**Consecuencias:**
- Facilita: UX nativa consistente con el sistema operativo, soporte por la comunidad RN
- Complica: requiere verificar si ya está como dep transitiva de Expo Bare antes de instalar; si no → `pnpm add` + rebuild APK
- Criterio de revisión: si el rebuild se vuelve frecuente y costoso, evaluar picker custom

---

### ADR-035 — `dispatch_window_min` configurable por viaje (NUEVA)
**Fecha:** 2026-04-24 · **Estado:** Aceptada · **Área:** Backend / BD

**Contexto:** El despacho anticipado arranca la búsqueda X minutos antes de `scheduled_for`. Opciones:
- Hardcodear 30 minutos en el scheduler
- Almacenar la ventana por viaje en `scheduled_trips.dispatch_window_min`

**Decisión:** Almacenar en BD con `DEFAULT 30`

**Consecuencias:**
- Facilita: En Fase 2, el admin puede configurar ventanas distintas por región, tipo de servicio o demanda histórica sin nueva migración
- Complica: El scheduler lee el campo en cada tick (mínimo overhead — un INTEGER por row)
- Criterio de revisión: Si nunca se varía el valor después de 6 meses, se puede simplificar

---

### ADRs anteriores aplicables
- ADR-009: `pricing_snapshot` inmutable — no tocar
- ADR-018: OTPChannelService abstracto — notificaciones vía BullMQ
- ADR-029: node-cron para el scheduler
- ADR-031: Mapbox (no Google Maps) en mobile
