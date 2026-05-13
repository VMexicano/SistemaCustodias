# Sprint 17 — Diseño: Flujo de Aprobación Multi-vertical

---

## Arquitectura al finalizar el sprint

```
                        ┌──────────────────────────────────────────────┐
                        │              TRIP STATE MACHINE               │
                        │                                              │
  [taxi vertical]       │  REQUESTED ──system──▶ SEARCHING ──driver──▶ ACCEPTED ──▶ ...  │
                        │                                              │
  [custody/cold-chain]  │  REQUESTED ──system──▶ PENDING_APPROVAL     │
                        │                              │               │
                        │                    dispatcher│passenger      │
                        │                              ▼               │
                        │                          APPROVED            │
                        │                              │               │
                        │                       system │ (BullMQ)      │
                        │                              ▼               │
                        │                          SEARCHING ──driver──▶ ACCEPTED ──▶ ...│
                        └──────────────────────────────────────────────┘

  Mobile (Pasajero)          Backend API                  Backoffice Web
  ┌────────────────┐         ┌───────────────┐            ┌────────────────────┐
  │ ActiveTrip     │◄──WS───►│ trips.service │◄───REST───►│ AprobacionesPage   │
  │ "En revisión"  │         │ trips.repo    │            │ (POST approve/reject│
  │ "Aprobado"     │         │ state-machine │            │  GET pending)       │
  └────────────────┘         │ BullMQ jobs  │            └────────────────────┘
                             └───────────────┘
                                    │
                              Redis (config cache)
                              requiresApproval lookup
```

---

## Estructura de directorios — cambios

```
apps/api/
├── migrations/
│   └── 20240101000038_alter_trips_add_approval_fields.ts   ← NUEVO
├── seeds/
│   └── 11_enable_approval_verticals.ts                     ← NUEVO
├── src/modules/trips/
│   ├── trip-state-machine.ts      ← MODIFICADO (nuevos estados + actor)
│   ├── trips.types.ts             ← MODIFICADO (TripStatus + TripActor)
│   ├── trips.service.ts           ← MODIFICADO (enrutamiento requiresApproval)
│   ├── trips.repository.ts        ← MODIFICADO (findPendingApproval)
│   └── trips.routes.ts            ← MODIFICADO (approve + reject + pending-approval)
├── src/__tests__/trips/
│   └── trip-state-machine.test.ts ← MODIFICADO (nuevas ramas)
└── tests/e2e/smoke/
    └── approval-flow.spec.ts      ← NUEVO

apps/mobile-v2/src/screens/driver/
└── ActiveTripScreen.tsx           ← MODIFICADO (nuevos casos status)

apps/web/src/pages/
└── AprobacionesPage.tsx           ← NUEVO
apps/web/src/components/layout/
└── Sidebar.tsx                    ← MODIFICADO (badge pendientes)
```

---

## Diseño de componentes clave

### 1. `TripStatus` y `TripActor` — tipos actualizados

```typescript
// trips.types.ts
export type TripStatus =
  | 'SCHEDULED'
  | 'REQUESTED'
  | 'PENDING_APPROVAL'   // ← NUEVO
  | 'APPROVED'           // ← NUEVO
  | 'SEARCHING'
  | 'ACCEPTED'
  | 'DRIVER_EN_ROUTE'
  | 'DRIVER_ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export type TripActor = 'system' | 'driver' | 'passenger' | 'dispatcher'; // ← dispatcher nuevo

export interface Trip {
  // ... campos existentes ...
  approved_at: Date | null;   // ← NUEVO
  approved_by: string | null; // ← NUEVO (admin_users.id)
}
```

### 2. `VALID_TRANSITIONS` — mapa extendido

```typescript
// trip-state-machine.ts — adiciones al Map existente
['REQUESTED→PENDING_APPROVAL',  ['system']],
['PENDING_APPROVAL→APPROVED',   ['dispatcher']],
['PENDING_APPROVAL→CANCELLED',  ['dispatcher', 'passenger']],
['APPROVED→SEARCHING',          ['system']],
['APPROVED→CANCELLED',          ['dispatcher', 'passenger']],
```

Las transiciones existentes NO cambian. La transición `REQUESTED→SEARCHING` sigue siendo válida para taxi.

### 3. `VerticalFeatures` — interface extendida

```typescript
// vertical.types.ts (o donde esté definida)
export interface VerticalFeatures {
  scheduling?: boolean;
  cargoDeclaration?: boolean;
  temperatureLog?: boolean;
  chainOfCustody?: boolean;
  requiresApproval?: boolean;       // ← NUEVO
  approvalRole?: 'dispatcher';      // ← NUEVO (extensible a futuro)
  custodyEventTypes?: CustodyEventTypeConfig[];
  cargoFields?: CargoFieldConfig[];
  unitTypeDetermination?: 'weight' | 'volume' | 'count';
}
```

### 4. `trips.service.createTrip` — lógica de enrutamiento

```typescript
// Pseudocódigo — lógica de decisión al crear viaje
async createTrip(data: CreateTripDto, passengerId: string): Promise<Trip> {
  const config = await this.verticalService.getConfig(); // Redis, TTL 60s
  const requiresApproval = config.features?.requiresApproval ?? false;

  const initialStatus: TripStatus = requiresApproval
    ? 'PENDING_APPROVAL'   // B2B: espera aprobación del dispatcher
    : 'SEARCHING';          // Taxi: despacho inmediato (flujo actual)

  // El resto del flujo de creación no cambia
}
```

### 5. BullMQ job: `APPROVED → SEARCHING`

```typescript
// Nuevo job type: 'trip.promote-approved'
// Se encola inmediatamente después de POST /trips/:id/approve (sin assigned_driver_id)
// Procesador: transiciona APPROVED → SEARCHING usando el state machine
// Delay: 0 (inmediato) — no hay espera intencional
// Idempotencia: verificar trip.status === 'APPROVED' antes de transicionar
```

---

## Contratos de API

### `POST /trips/:id/approve`

- **Auth:** JWT admin con rol `dispatcher` o `admin`
- **Request:**
```typescript
interface ApproveRequest {
  assigned_driver_id?: string; // uuid — asignación manual opcional
}
```
- **Response 200:**
```typescript
interface ApproveResponse {
  id: string;
  status: 'APPROVED' | 'ACCEPTED'; // ACCEPTED si se asignó conductor
  approved_at: string;             // ISO 8601
  approved_by: string;             // admin_users.id
}
```
- **Errores:**

| HTTP | Código interno | Condición |
|---|---|---|
| 404 | `TRIP_NOT_FOUND` | Trip no existe |
| 409 | `INVALID_TRIP_TRANSITION` | Trip no está en PENDING_APPROVAL |
| 403 | `NOT_AUTHORIZED_FOR_TRANSITION` | JWT no tiene rol dispatcher/admin |
| 404 | `DRIVER_NOT_FOUND` | `assigned_driver_id` no existe |
| 409 | `DRIVER_NOT_AVAILABLE` | Conductor asignado no está online |

---

### `POST /trips/:id/reject`

- **Auth:** JWT admin con rol `dispatcher` o `admin`
- **Request:**
```typescript
interface RejectRequest {
  reason: string; // requerido
}
```
- **Response 200:**
```typescript
interface RejectResponse {
  id: string;
  status: 'CANCELLED';
  cancellation_reason: string;
  cancelled_at: string;
}
```
- **Errores:**

| HTTP | Código interno | Condición |
|---|---|---|
| 404 | `TRIP_NOT_FOUND` | Trip no existe |
| 409 | `INVALID_TRIP_TRANSITION` | Trip no está en PENDING_APPROVAL |
| 400 | `VALIDATION_ERROR` | `reason` vacío o ausente |

---

### `GET /admin/trips/pending-approval`

- **Auth:** JWT admin
- **Query params:**
```typescript
interface PendingApprovalQuery {
  limit?: number;   // default 20, max 100
  offset?: number;  // default 0
}
```
- **Response 200:**
```typescript
interface PendingApprovalResponse {
  data: Array<{
    id: string;
    passenger_id: string;
    passenger_phone: string;
    origin_address: string;
    destination_address: string;
    estimated_fare: number | null;
    metadata: Record<string, unknown>;
    created_at: string;
    wait_minutes: number; // calculado: (now - created_at) en minutos
  }>;
  total: number;
  limit: number;
  offset: number;
}
```
- **Errores:** solo 401/403

---

## Migración 038

```typescript
// 20240101000038_alter_trips_add_approval_fields.ts
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trips', (table) => {
    table.timestamp('approved_at', { useTz: true }).nullable();
    table.uuid('approved_by').nullable()
      .references('id').inTable('admin_users').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trips', (table) => {
    table.dropColumn('approved_at');
    table.dropColumn('approved_by');
  });
}
```

---

## Seed 11

```typescript
// 11_enable_approval_verticals.ts — idempotente
// UPDATE verticals SET features = features || '{"requiresApproval": true}'::jsonb
// WHERE slug IN ('custody', 'cold-chain')
// ON CONFLICT DO NOTHING no aplica a UPDATE — usar WHERE para idempotencia natural
```

---

## ADRs aplicables

| ADR | Título | Relevancia |
|---|---|---|
| ADR-036 | Verticals como entidad de primera clase con features JSONB | El flag `requiresApproval` vive en `features` JSONB |
| ADR-037 | trips.metadata JSONB | `metadata` ya soporta datos extra por vertical sin migraciones |
| ADR-025 | SELECT FOR UPDATE en transiciones | Las nuevas transiciones siguen la misma regla |
| ADR-047 | Flujo de aprobación opcional en TripStateMachine | **Este sprint** |

---

## Variables de entorno nuevas

Ninguna. El flag se resuelve desde Redis (`GET /config`) que ya está configurado con `VERTICAL_SLUG`.
