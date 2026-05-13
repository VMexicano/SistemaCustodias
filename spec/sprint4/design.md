# Sprint 4 — Ciclo de Viaje: Design

> **Fecha:** 2026-04-06
> **Estado:** Aprobado
> **ADRs aplicables:** ADR-001, ADR-002, ADR-003, ADR-005, ADR-009, ADR-023, ADR-024, ADR-025, ADR-026

---

## Diagrama de estados — TripStateMachine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      TRIP STATE MACHINE — Sprint 4                      │
└─────────────────────────────────────────────────────────────────────────┘

  [sistema]              [sistema]               [driver]
     │                      │                      │
     ▼                      ▼                      ▼
 REQUESTED ──────────► SEARCHING ──────────────► ACCEPTED
                           │                    │       │
                       [timeout]           [driver]     │ [passenger < 120s]
                        300s ▼                  ▼       ▼
                        CANCELLED       DRIVER_EN_ROUTE ──────────► CANCELLED
                                   [driver] │                      [passenger
                                            │                       ≥ 120s,
                                            ▼                      $50 MXN]
                                      DRIVER_ARRIVED
                                         │       │
                                    [driver]     │ [driver, no_show > 5min]
                                         ▼       ▼
                                     IN_PROGRESS CANCELLED
                                         │
                                  [recálculo ruta ↺]
                                  PATCH /trips/:id/destination
                                         │
                                         ▼
                                      COMPLETED ✓

Transiciones válidas y actores:
──────────────────────────────────────────────────────────────────────────
  [sistema]    REQUESTED       → SEARCHING          al crear viaje
  [sistema]    SEARCHING       → CANCELLED          timeout 300s (BullMQ)
  [driver]     SEARCHING       → ACCEPTED           driver acepta
  [driver]     ACCEPTED        → DRIVER_EN_ROUTE    driver confirma salida
  [driver]     ACCEPTED        → CANCELLED          driver cancela (sin cargo)
  [passenger]  ACCEPTED        → CANCELLED          passenger < 120s (sin cargo)
  [driver]     DRIVER_EN_ROUTE → DRIVER_ARRIVED     driver llega al pickup
  [driver]     DRIVER_EN_ROUTE → CANCELLED          driver cancela en ruta (sin cargo)
  [passenger]  DRIVER_EN_ROUTE → CANCELLED          passenger ≥ 120s ($50 MXN)
  [driver]     DRIVER_ARRIVED  → IN_PROGRESS        driver inicia viaje
  [driver]     DRIVER_ARRIVED  → CANCELLED          no_show: pasajero > 5min (sin cargo)
  [driver]     IN_PROGRESS     → COMPLETED          driver finaliza viaje
──────────────────────────────────────────────────────────────────────────
  Estados finales (sin retorno): COMPLETED · CANCELLED
```

---

## Arquitectura al finalizar el sprint

```
┌─────────────────────────────────────────────────────────────┐
│                     apps/api/src/modules/                   │
│                                                             │
│  pricing/                    trips/                         │
│  ├── pricing.routes.ts        ├── trips.routes.ts           │
│  ├── pricing.controller.ts    ├── trips.controller.ts       │
│  ├── pricing.service.ts       ├── trips.service.ts          │
│  ├── pricing.repository.ts    ├── trips.repository.ts       │
│  ├── pricing-engine.ts  ◄─────┤   (usa PricingEngine)       │
│  └── pricing.types.ts         ├── trip-state-machine.ts     │
│                               ├── trips.workers.ts          │
│                               └── trips.types.ts            │
│                                                             │
│  realtime/                                                  │
│  ├── realtime.plugin.ts   (Socket.io init + namespaces)     │
│  ├── passenger.namespace.ts                                 │
│  └── driver.namespace.ts                                    │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
    PostgreSQL              Redis               BullMQ
  (trips, history,     (driver locations,    (searching-timeout
   pricing_snapshot)    active rooms)         job)
```

---

## Estructura de directorios

```
apps/api/src/modules/
├── pricing/
│   ├── pricing.routes.ts
│   ├── pricing.controller.ts
│   ├── pricing.service.ts
│   ├── pricing.repository.ts
│   ├── pricing-engine.ts
│   └── pricing.types.ts
├── trips/
│   ├── trips.routes.ts
│   ├── trips.controller.ts
│   ├── trips.service.ts
│   ├── trips.repository.ts
│   ├── trip-state-machine.ts
│   ├── trips.workers.ts          ← BullMQ: searching-timeout
│   └── trips.types.ts
└── realtime/
    ├── realtime.plugin.ts
    ├── passenger.namespace.ts
    └── driver.namespace.ts

tests/
├── unit/
│   ├── pricing-engine.test.ts    ← 100% coverage obligatorio
│   └── trip-state-machine.test.ts ← 100% coverage obligatorio
└── integration/
    └── trips.integration.test.ts  ← flujo E2E completo

db/seeds/
└── 06_commission_rules.ts        ← 20% MX (idempotente)
```

---

## Diseño de componentes

### PricingEngine

```typescript
interface PricingSnapshot {
  trip_type_id: string;
  base_fare: number;
  cost_per_km: number;
  cost_per_minute: number;
  min_fare: number;
  factors: Array<{
    id: string;
    code: string;
    type: 'fixed_amount' | 'percentage' | 'multiplier';
    value: number;
  }>;
  region_id: string;
  captured_at: string;  // ISO8601
}

interface PriceEstimate {
  estimated_distance_km: number;
  estimated_duration_min: number;
  base_fare: number;
  factors_applied: Array<{
    code: string;
    type: 'fixed_amount' | 'percentage' | 'multiplier';
    value: number;
    impact_amount: number;
  }>;
  subtotal: number;
  tax_amount: number;
  final_fare: number;
  currency: 'MXN';
  pricing_snapshot: PricingSnapshot;
}

class PricingEngine {
  estimate(params: {
    origin: LatLng;
    destination: LatLng;
    tripType: TripType;
    activeFactors: PricingFactor[];
    regionTaxPct: number;
  }): PriceEstimate

  recalculate(params: {
    newDestination: LatLng;
    currentOrigin: LatLng;   // pickup point (driver_arrived location)
    snapshot: PricingSnapshot;
    regionTaxPct: number;
  }): PriceEstimate

  // Haversine inline — sin dependencias externas (ADR-023)
  private calculateDistanceKm(a: LatLng, b: LatLng): number

  // Orden fijo: fixed_amount → percentage → multiplier
  private applyFactors(base: number, factors: PricingFactor[]): FactorResult[]
}
```

### TripStateMachine

```typescript
type TripStatus =
  | 'REQUESTED'
  | 'SEARCHING'
  | 'ACCEPTED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

type TripActor = 'system' | 'driver' | 'passenger';

interface TransitionResult {
  success: true;
  newStatus: TripStatus;
  cancellationFee: number;   // 0 si no aplica
  historyEntry: TripStatusHistory;
}

class TripStateMachine {
  // Lanza BusinessError('INVALID_TRIP_TRANSITION') si la transición no es válida
  // Lanza BusinessError('NOT_AUTHORIZED_FOR_TRANSITION') si el actor no tiene permiso
  // Usa SELECT FOR UPDATE internamente (recibe trx de Knex)
  transition(params: {
    trip: Trip;
    toStatus: TripStatus;
    actor: TripActor;
    actorId: string;
    trx: Knex.Transaction;
    notes?: string;
  }): Promise<TransitionResult>

  canTransition(from: TripStatus, to: TripStatus, actor: TripActor): boolean

  // Retorna el cargo de cancelación según la política MVP (ADR-026)
  getCancellationFee(trip: Trip, actor: TripActor): number
}
```

---

## Contratos de API

### POST /trips/estimate

```
Método: POST
Path:   /trips/estimate
Auth:   Bearer JWT (passenger)

Request:
{
  origin:      { lat: number; lng: number }
  destination: { lat: number; lng: number }
  trip_type_id: string   // minLength: 1
}

Response 200:
{
  estimated_distance_km: number
  estimated_duration_min: number
  base_fare:   number
  factors_applied: Array<{
    code:          string
    type:          'fixed_amount' | 'percentage' | 'multiplier'
    value:         number
    impact_amount: number
  }>
  subtotal:    number
  tax_amount:  number
  final_fare:  number
  currency:    'MXN'
  pricing_snapshot: PricingSnapshot
}

Errors:
  404 TRIP_TYPE_NOT_FOUND
  422 ORIGIN_EQUALS_DESTINATION
  422 DISTANCE_EXCEEDS_LIMIT     // > 200km
```

### POST /trips

```
Método: POST
Path:   /trips
Auth:   Bearer JWT (passenger)

Request:
{
  origin:      { lat: number; lng: number; address: string }
  destination: { lat: number; lng: number; address: string }
  trip_type_id: string
  notes?:      string
}

Response 201:
{
  id:             string
  status:         'REQUESTED'
  estimated_fare: number
  currency:       'MXN'
  created_at:     string
}

Errors:
  409 PASSENGER_ALREADY_HAS_ACTIVE_TRIP
  404 TRIP_TYPE_NOT_FOUND
  422 ORIGIN_EQUALS_DESTINATION
```

### PATCH /trips/:id/accept

```
Método: PATCH
Path:   /trips/:id/accept
Auth:   Bearer JWT (driver)

Request: {}   // driver_id viene del JWT

Response 200:
{
  id:          string
  status:      'ACCEPTED'
  accepted_at: string
}

Errors:
  409 DRIVER_ALREADY_HAS_ACTIVE_TRIP
  409 TRIP_NOT_IN_SEARCHING
  404 TRIP_NOT_FOUND
  403 DRIVER_NOT_APPROVED
```

### PATCH /trips/:id/status

```
Método: PATCH
Path:   /trips/:id/status
Auth:   Bearer JWT (driver)

Request:
{
  status: 'DRIVER_EN_ROUTE' | 'DRIVER_ARRIVED' | 'IN_PROGRESS' | 'COMPLETED'
  notes?: string
}

Response 200:
{
  id:         string
  status:     TripStatus
  updated_at: string
  final_fare?: number   // solo si status = 'COMPLETED'
}

Errors:
  409 INVALID_TRIP_TRANSITION
  403 NOT_AUTHORIZED_FOR_TRANSITION
  404 TRIP_NOT_FOUND
```

### PATCH /trips/:id/cancel

```
Método: PATCH
Path:   /trips/:id/cancel
Auth:   Bearer JWT (passenger | driver)

Request:
{
  reason?: string
}

Response 200:
{
  id:                string
  status:            'CANCELLED'
  cancellation_fee:  number   // 0 o 50 MXN
  cancelled_at:      string
}

Errors:
  409 TRIP_CANNOT_BE_CANCELLED   // estado final
  404 TRIP_NOT_FOUND
```

### PATCH /trips/:id/destination

```
Método: PATCH
Path:   /trips/:id/destination
Auth:   Bearer JWT (passenger)

Request:
{
  destination: { lat: number; lng: number; address: string }
}

Response 200:
{
  trip_id:             string
  new_destination:     { lat: number; lng: number; address: string }
  new_estimated_fare:  number
  delta_km:            number
  currency:            'MXN'
}

Errors:
  409 TRIP_NOT_IN_PROGRESS
  403 ONLY_PASSENGER_CAN_CHANGE_DESTINATION
  404 TRIP_NOT_FOUND
```

### GET /trips/:id

```
Método: GET
Path:   /trips/:id
Auth:   Bearer JWT (passenger | driver | admin)

Response 200: TripDetail completo con status_history, actores y pricing_snapshot
Errors: 404 TRIP_NOT_FOUND | 403 NOT_AUTHORIZED
```

### GET /trips/active

```
Método: GET
Path:   /trips/active
Auth:   Bearer JWT (passenger)

Response 200: TripDetail | null
```

### GET /trips

```
Método: GET
Path:   /trips
Auth:   Bearer JWT (passenger)
Query:  page?: number (default 1) · limit?: number (default 20, max 50)

Response 200:
{
  data:  TripSummary[]
  total: number
  page:  number
}
```

---

## Contrato WebSocket (ADR-024)

```typescript
// Namespace: /passenger  (auth: JWT en handshake)
// Servidor → cliente
'trip:status_changed': {
  trip_id: string
  status:  TripStatus
  driver?: { id: string; full_name: string; vehicle: string; rating_avg: number }
}
'driver:location': {
  trip_id:   string
  lat:       number
  lng:       number
  timestamp: string
}

// Namespace: /driver  (auth: JWT en handshake)
// Servidor → cliente
'trip:requested': {
  trip_id:      string
  origin:       { lat: number; lng: number; address: string }
  destination:  { lat: number; lng: number; address: string }
  fare:         number
  distance_km:  number
  expires_at:   string   // SEARCHING timeout
}
'trip:cancelled': {
  trip_id: string
  reason:  string
}
'trip:destination_changed': {
  trip_id:            string
  new_destination:    { lat: number; lng: number; address: string }
  new_estimated_fare: number
}

// Cliente → servidor (driver namespace)
'location:update': { lat: number; lng: number }
```

**Room naming:** `trip:{trip_id}` — pasajero y conductor del viaje activo se unen al mismo room.

---

## ADRs aplicables a este sprint

| ADR | Título | Impacto en Sprint 4 |
|---|---|---|
| ADR-001 | Monolito modular | Módulos `pricing/`, `trips/`, `realtime/` independientes |
| ADR-002 | Fastify | Todos los endpoints nuevos usan Fastify |
| ADR-003 | PostgreSQL + Redis + TimescaleDB | trips en PG, locations en Redis |
| ADR-005 | BullMQ | Job `searching-timeout` (300s) |
| ADR-009 | pricing_snapshot inmutable | Solo se escribe al crear el viaje |
| ADR-023 | Haversine inline + radio 5km | PricingEngine + búsqueda de conductores |
| ADR-024 | Socket.io namespaces | Realtime module |
| ADR-025 | TripStateMachine + SELECT FOR UPDATE | trips.service.ts |
| ADR-026 | Política cancelación MVP ($50 MXN ≥ 120s) | trip-state-machine.ts |

---

## Variables de entorno nuevas

```env
# No se requieren nuevas variables de entorno en este sprint.
# Socket.io usa el JWT_SECRET existente para el handshake.
# El radio de búsqueda (5km) se configura en region_config (BD).
```
