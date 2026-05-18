# Sprint 14 — Design: Event Catalog + CustodyEvent Envelope

**Sprint:** 14 — SistemaCustodias
**Fecha:** 2026-05-18
**Módulo:** custody-events

---

## Arquitectura del sistema al finalizar Sprint 14

```
Mobile (custodio/copiloto)
  │
  ├─ GET /orders/:id/event-catalog ──────────────────────────────┐
  │                                                               │
  └─ POST /orders/:id/events ──────────────────────────────────┐ │
        │                                                       │ │
        ▼                                                       │ │
  custody-events.routes.ts                                      │ │
        │                                                       │ │
        ▼                                                       │ │
  custody-events.controller.ts                                  │ │
        │                                                       │ │
        ▼                                                       │ │
  custody-events.service.ts                                     │ │
    ├─ custody-events.repository.ts ──► order_event (PG)        │ │
    ├─ custody-orders.repository.ts ──► custody_orders (PG)     │ │
    ├─ event_catalog lookup ──────────► event_catalog (PG) ◄────┘ │
    ├─ Ajv validate payload ◄──────────────────────────────────────┘
    ├─ HMAC-SHA256 integrity_hash ──► node:crypto
    └─ alertsQueue.add() ──────────► BullMQ ──► AlertEngine (si PANIC)

Web (supervisor/dispatcher)
  └─ GET /orders/:id/events ──► custody-events.controller ──► order_event (PG)
```

---

## Estructura de directorios (módulo nuevo)

```
apps/api/src/modules/custody-events/
  custody-events.types.ts
  custody-events.repository.ts
  custody-events.service.ts
  custody-events.controller.ts
  custody-events.routes.ts

apps/api/src/__tests__/custody-events/
  custody-events.service.test.ts

database/migrations/
  20260518_055_create_event_catalog.ts
  20260518_056_create_order_event.ts

apps/api/seeds/
  15_event_catalog.ts
```

**Archivos modificados:**
```
apps/api/src/shared/errors/business-error.ts   ← 4 nuevos códigos
apps/api/src/app.ts                            ← wiring módulo
apps/api/src/config/env.ts                     ← CUSTODY_EVENT_HMAC_SECRET
jest.config.ts                                 ← exclusiones repository/controller/routes
```

---

## Diseño de la base de datos

### Tabla `event_catalog` (M-055)

```sql
CREATE TABLE event_catalog (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_slug     VARCHAR(50) NOT NULL REFERENCES custody_types(slug) ON DELETE RESTRICT,
  code              VARCHAR(50) NOT NULL,
  label             VARCHAR(100) NOT NULL,
  requires_photo    BOOLEAN     NOT NULL DEFAULT false,
  requires_audio    BOOLEAN     NOT NULL DEFAULT false,
  requires_signature BOOLEAN   NOT NULL DEFAULT false,
  payload_schema    JSONB       NOT NULL,         -- JSON Schema draft-07
  interval_minutes  INT         NULL,             -- null = manual; >0 = periódico
  active            BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_catalog_vertical_code_unique UNIQUE (vertical_slug, code)
);
```

**Patrón Knex (JSONB):** pasar objeto JS directamente — `payload_schema: schemaObj` (no `JSON.stringify`).

### Tabla `order_event` (M-056)

```sql
CREATE TYPE order_event_actor_role AS ENUM ('custodio', 'copiloto', 'supervisor', 'system');

CREATE TABLE order_event (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID                  NOT NULL REFERENCES custody_orders(id) ON DELETE RESTRICT,
  tenant_id       UUID                  NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  event_type      VARCHAR(50)           NOT NULL,
  sequence_no     INT                   NOT NULL,
  actor_id        UUID                  REFERENCES users(id) ON DELETE SET NULL,
  actor_role      order_event_actor_role NOT NULL,
  app_timestamp   TIMESTAMPTZ           NOT NULL,
  auto_timestamp  TIMESTAMPTZ           NULL,     -- Monitor Engine (Sprint 15)
  location        JSONB                 NOT NULL,
  evidence        JSONB                 NULL,
  payload         JSONB                 NOT NULL,
  device          JSONB                 NOT NULL,
  integrity_hash  VARCHAR(64)           NOT NULL,
  created_at      TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
  CONSTRAINT order_event_order_sequence_unique UNIQUE (order_id, sequence_no)
);

CREATE INDEX order_event_order_id_created_at_idx ON order_event (order_id, created_at DESC);
CREATE INDEX order_event_tenant_id_created_at_idx ON order_event (tenant_id, created_at DESC);
```

> **Regla:** `order_event` es append-only. El módulo nunca emite `UPDATE` ni `DELETE`.

---

## Diseño de componentes

### `custody-events.types.ts`

```typescript
export type OrderEventActorRole = 'custodio' | 'copiloto' | 'supervisor' | 'system';

export interface EventCatalogRow {
  id: string;
  vertical_slug: string;
  code: string;
  label: string;
  requires_photo: boolean;
  requires_audio: boolean;
  requires_signature: boolean;
  payload_schema: Record<string, unknown>;
  interval_minutes: number | null;
  active: boolean;
}

export interface EventCatalogDTO {
  code: string;
  label: string;
  requiresPhoto: boolean;
  requiresAudio: boolean;
  requiresSignature: boolean;
  payloadSchema: Record<string, unknown>;
  intervalMinutes: number | null;
}

export interface OrderEventRow {
  id: string;
  order_id: string;
  tenant_id: string;
  event_type: string;
  sequence_no: number;
  actor_id: string | null;
  actor_role: OrderEventActorRole;
  app_timestamp: Date;
  auto_timestamp: Date | null;
  location: EventLocation;
  evidence: EventEvidence | null;
  payload: Record<string, unknown>;
  device: EventDevice;
  integrity_hash: string;
  created_at: Date;
}

export interface EventLocation {
  lat: number;
  long: number;
  accuracy_meters: number;
  speed_kmh?: number;
  heading_degrees?: number;
  provider: 'gps' | 'network' | 'fused';
}

export interface EventEvidence {
  photos?: { url: string; hash: string; taken_at: string }[];
  audio?: { url: string; duration_seconds: number; hash: string };
  signature?: { data: string; algorithm: 'HMAC-SHA256'; signed_by: string };
}

export interface EventDevice {
  battery_percent: number;
  signal_strength: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
  app_version: string;
  os: 'ios' | 'android';
  mock_location_detected: boolean;
}

export interface CreateCustodyEventPayload {
  event_type: string;
  actor_role: OrderEventActorRole;
  app_timestamp: string;             // ISO 8601
  location: EventLocation;
  evidence?: EventEvidence;
  payload: Record<string, unknown>;
  device: EventDevice;
}

export interface OrderEventDTO {
  id: string;
  orderId: string;
  eventType: string;
  sequenceNo: number;
  actorRole: OrderEventActorRole;
  appTimestamp: string;
  location: EventLocation;
  payload: Record<string, unknown>;
  device: Pick<EventDevice, 'signal_strength'>;
  integrityHash: string;
  createdAt: string;
  evidence?: EventEvidence;           // solo para supervisor/dispatcher
}
```

### `custody-events.repository.ts`

```typescript
interface ICustodyEventsRepository {
  findCatalogByVertical(verticalSlug: string): Promise<EventCatalogRow[]>;
  findCatalogEntry(verticalSlug: string, code: string): Promise<EventCatalogRow | null>;
  getNextSequenceNo(orderId: string, trx: Knex.Transaction): Promise<number>;
  create(data: Omit<OrderEventRow, 'id' | 'created_at'>, trx: Knex.Transaction): Promise<OrderEventRow>;
  findByOrder(orderId: string, limit: number, offset: number): Promise<{ events: OrderEventRow[]; total: number }>;
}
```

> `getNextSequenceNo()` usa `SELECT MAX(sequence_no) FROM order_event WHERE order_id = ? FOR UPDATE` dentro de la transacción activa — garantiza incremento sin race condition.

### `custody-events.service.ts`

```typescript
const ACTIVE_STATUSES = [
  'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT',
  'AT_DELIVERY', 'INCIDENT', 'RESOLVED'
] as const;

class CustodyEventService {
  constructor(
    private repo: ICustodyEventsRepository,
    private ordersRepo: ICustodyOrdersRepository,
    private alertsQueue: Queue,
    private hmacSecret: string,
  ) {}

  async getCatalog(orderId: string): Promise<EventCatalogDTO[]>
  async createEvent(orderId: string, actorId: string, data: CreateCustodyEventPayload): Promise<OrderEventDTO>
  async getEvents(orderId: string, limit: number, offset: number, includeEvidence: boolean): Promise<{ events: OrderEventDTO[]; total: number }>

  private calculateIntegrityHash(envelope: Omit<CreateCustodyEventPayload, never>): string
    // HMAC-SHA256 con node:crypto — ordena las claves antes de stringify para determinismo
  
  private validatePayload(schema: Record<string, unknown>, payload: Record<string, unknown>): void
    // Ajv compile + validate — lanza EVENT_PAYLOAD_INVALID con ajv.errorsText() si falla
}
```

**Flujo de `createEvent()`:**
```
1. ordersRepo.findById(orderId) → ORDER_NOT_FOUND si no existe
2. Verificar order.status ∈ ACTIVE_STATUSES → ORDER_NOT_ACTIVE_FOR_EVENT si no
3. repo.findCatalogEntry(order.custody_type.slug, data.event_type) → EVENT_TYPE_NOT_FOUND si no
4. validatePayload(catalog.payload_schema, data.payload) → EVENT_PAYLOAD_INVALID si falla
5. integrity_hash = calculateIntegrityHash({ ...data })  ← servidor no confía en cliente
6. db.transaction(trx =>
     sequence_no = await repo.getNextSequenceNo(orderId, trx)
     event = await repo.create({ ...data, sequence_no, integrity_hash, auto_timestamp: null }, trx)
   )
7. if data.event_type === 'PANIC':
     alertsQueue.add('create-alert', { type: 'panic', orderId, actorId })  ← fuera de transacción
8. return toDTO(event)
```

---

## Contratos de API

### `GET /orders/:id/event-catalog`

**Auth:** JWT requerido · Roles: `custodio`, `copiloto`, `supervisor`, `dispatcher`

**Response 200:**
```typescript
{
  orderId: string;
  custodyType: string;        // slug del vertical
  catalog: EventCatalogDTO[]; // array de 5 tipos en MVP
}
```

**Errores:**
| Código HTTP | Código interno | Descripción |
|---|---|---|
| 404 | `ORDER_NOT_FOUND` | La orden no existe |
| 409 | `ORDER_NOT_ACTIVE_FOR_EVENT` | La orden no está en estado activo |
| 403 | `FORBIDDEN` | Actor no tiene permiso sobre esta orden |

---

### `POST /orders/:id/events`

**Auth:** JWT requerido · Roles: `custodio`, `copiloto`

**Request body:**
```typescript
{
  event_type: string;
  actor_role: 'custodio' | 'copiloto' | 'supervisor' | 'system';
  app_timestamp: string;       // ISO 8601
  location: {
    lat: number;
    long: number;
    accuracy_meters: number;
    speed_kmh?: number;
    heading_degrees?: number;
    provider: 'gps' | 'network' | 'fused';
  };
  evidence?: {
    photos?: { url: string; hash: string; taken_at: string }[];
    audio?: { url: string; duration_seconds: number; hash: string };
    signature?: { data: string; algorithm: 'HMAC-SHA256'; signed_by: string };
  };
  payload: Record<string, unknown>;  // validado contra payload_schema del catálogo
  device: {
    battery_percent: number;
    signal_strength: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
    app_version: string;
    os: 'ios' | 'android';
    mock_location_detected: boolean;
  };
}
```

**Response 201:**
```typescript
{
  id: string;
  orderId: string;
  eventType: string;
  sequenceNo: number;
  createdAt: string;
}
```

**Errores:**
| Código HTTP | Código interno | Descripción |
|---|---|---|
| 404 | `ORDER_NOT_FOUND` | La orden no existe |
| 409 | `ORDER_NOT_ACTIVE_FOR_EVENT` | Estado de orden no activo |
| 404 | `EVENT_TYPE_NOT_FOUND` | event_type no existe en el catálogo del vertical |
| 422 | `EVENT_PAYLOAD_INVALID` | payload no cumple el payload_schema del catálogo |
| 409 | `DUPLICATE_SEQUENCE_NO` | Race condition en asignación de sequence_no |

---

### `GET /orders/:id/events`

**Auth:** JWT requerido · Roles: `custodio`, `copiloto`, `supervisor`, `dispatcher`

**Query params:**
```
limit  : number (default 50, máx 100)
offset : number (default 0)
```

**Response 200:**
```typescript
{
  orderId: string;
  events: OrderEventDTO[];
  total: number;
  limit: number;
  offset: number;
}
```

---

## Seed 15 — event_catalog

Orden de inserción (sin FK circular):

```
1. Verificar que custody_types existen (slugs: cash_transport, high_value_package, confidential_docs, vip_escort)
2. INSERT INTO event_catalog ← 5 tipos × 4 verticals = 20 filas
   ON CONFLICT (vertical_slug, code) DO NOTHING
```

### Payload schemas por tipo de evento

```typescript
// CHECKPOINT — rutinario cada 15 min
{
  type: 'object',
  required: ['route_on_track', 'vehicle_secured', 'cargo_intact'],
  properties: {
    route_on_track: { type: 'boolean' },
    vehicle_secured: { type: 'boolean' },
    cargo_intact: { type: 'boolean' },
    notes: { type: 'string', maxLength: 500 }
  },
  additionalProperties: false
}

// PANIC — manual
{
  type: 'object',
  required: ['panic_code', 'crew_status'],
  properties: {
    panic_code: { type: 'string', enum: ['ROBBERY_ATTEMPT', 'ACCIDENT', 'MEDICAL', 'OTHER'] },
    crew_status: { type: 'string', enum: ['SAFE', 'THREAT', 'UNKNOWN'] },
    auto_triggered: { type: 'boolean' }
  },
  additionalProperties: false
}

// CARGO_STATUS — verificación de carga (requires_photo: true)
{
  type: 'object',
  required: ['declared_value_confirmed', 'seals_intact'],
  properties: {
    declared_value_confirmed: { type: 'boolean' },
    seals_intact: { type: 'boolean' },
    seal_codes: { type: 'array', items: { type: 'string' } },
    temperature_celsius: { type: ['number', 'null'] }
  },
  additionalProperties: false
}

// INCIDENT — reporte de incidencia
{
  type: 'object',
  required: ['incident_type', 'severity', 'description'],
  properties: {
    incident_type: { type: 'string', enum: ['FLAT_TIRE', 'ACCIDENT', 'DETOUR', 'DELAY', 'OTHER'] },
    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    description: { type: 'string', maxLength: 1000 },
    estimated_delay_minutes: { type: 'integer', minimum: 0 },
    police_report_no: { type: ['string', 'null'] }
  },
  additionalProperties: false
}

// DELIVERY_ATTEMPT — intento de entrega (requires_signature: true)
{
  type: 'object',
  required: ['recipient_present', 'id_verified', 'recipient_name'],
  properties: {
    recipient_present: { type: 'boolean' },
    id_verified: { type: 'boolean' },
    id_type: { type: 'string', enum: ['INE', 'PASSPORT', 'RFC', 'OTHER'] },
    id_number: { type: 'string' },
    recipient_name: { type: 'string', maxLength: 200 }
  },
  additionalProperties: false
}
```

---

## Variable de entorno nueva

```env
# .env
CUSTODY_EVENT_HMAC_SECRET=<string-aleatorio-32-chars-mínimo>
```

Validar en `config/env.ts` con Zod — fail-fast en startup si ausente.

---

## ADRs aplicables

| ADR | Título | Relevancia |
|---|---|---|
| ADR-001 | Monolito modular | `custody-events/` es un módulo autocontenido |
| ADR-003 | BullMQ fuera de transacción | `alertsQueue.add()` va después del commit |
| ADR-004 | JSONB extensible | `payload_schema` y `payload` son JSONB |
| ADR-007 | Snapshots inmutables | `order_event` es append-only (mismo principio) |
| ADR-014 | Módulo separado vs UBER_BASE | `custody-events/` no extiende el módulo base |
| ADR-022 | integrity_hash calculado por servidor | Nuevo — ver detalles abajo |
| ADR-023 | event_catalog por vertical_slug | Nuevo — ver detalles abajo |

### ADR-022 — integrity_hash calculado por servidor

**Fecha:** 2026-05-18 · **Estado:** ✅ Vigente

**Contexto:** El envelope CustodyEvent incluye `integrity_hash` como mecanismo anti-manipulación. No se puede confiar en el cliente para calcular el hash ya que el dispositivo podría estar comprometido.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Cliente calcula el hash | Carga distribuida | No confiable — dispositivo puede estar comprometido |
| Servidor calcula el hash | Confiable, autoridad única | Ligero overhead de CPU por request |
| BD calcula con trigger | Transparente | Difícil de testear, acoplamiento a PG |

**Decisión:** El servidor calcula `HMAC-SHA256(JSON.stringify(canonicalEnvelope), CUSTODY_EVENT_HMAC_SECRET)` donde `canonicalEnvelope` es el payload ordenado por clave (sort determinístico). El cliente puede enviar `integrity_hash` pero el servidor lo ignora y recalcula siempre. Lo que se almacena en BD es el hash del servidor.

**Consecuencias:**
- `CUSTODY_EVENT_HMAC_SECRET` es variable de entorno obligatoria (Zod fail-fast)
- Monitor Engine (Sprint 15) puede verificar el hash de cualquier evento histórico
- En producción, rotar el secret invalida la verificación de hashes históricos — documentar en runbook

---

### ADR-023 — event_catalog por (vertical_slug, code)

**Fecha:** 2026-05-18 · **Estado:** ✅ Vigente

**Contexto:** El catálogo de eventos podría ser global (un set para todos los tipos de custodia) o por vertical (cada tipo tiene su propio catálogo). La arquitectura de negocio describe `vertical_slug` como FK del catálogo.

**Opciones consideradas:**
| Opción | Pros | Contras |
|---|---|---|
| Catálogo global (sin FK) | Menos filas en seed | Sin customización por tipo de custodia |
| Por vertical_slug | Customizable por tipo, patrón ADR-004 | 20 filas en seed (4 × 5) |
| Por custody_type_id (UUID) | FK fuerte | Acoplamiento a ID — difícil de leer en queries |

**Decisión:** `event_catalog.vertical_slug` como FK a `custody_types.slug`. Permite que dos tipos de custodia tengan diferentes catálogos de eventos sin cambios de código. En MVP, los 5 tipos base son idénticos para los 4 verticals — el seed los inserta con `ON CONFLICT DO NOTHING`.

**Consecuencias:**
- Agregar evento exclusivo de un vertical = `INSERT INTO event_catalog` sin código nuevo (patrón ADR-004)
- Seed idempotente: re-ejecutar no crea duplicados
- Lookup en service: `order → custody_type.slug → event_catalog`
