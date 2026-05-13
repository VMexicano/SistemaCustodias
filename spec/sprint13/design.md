# Design — Sprint 13: Backend Vertical Data Models

**Fecha:** 2026-04-27
**Sprint:** 13

---

## Arquitectura al finalizar el sprint

```
apps/api/src/modules/
├── custody/
│   ├── custody.routes.ts
│   ├── custody.controller.ts
│   ├── custody.service.ts
│   └── custody.repository.ts
├── temperature/
│   ├── temperature.routes.ts
│   ├── temperature.controller.ts
│   ├── temperature.service.ts
│   └── temperature.repository.ts
├── pricing/
│   └── pricing.service.ts      ← extender estimate() con pricingModel switch
└── drivers/
    └── drivers.service.ts      ← extender document query con vertical_id filter

apps/api/src/__tests__/
├── custody/
│   └── custody.service.test.ts
└── temperature/
    └── temperature.service.test.ts

apps/api/migrations/
└── 036_vertical_data_models.ts  ← temperature_readings + custody_events + alter tables

apps/api/seeds/
└── 10_vertical_document_requirements.ts
```

---

## Schema de BD — tablas nuevas (Migration 036)

### temperature_readings (hypertable TimescaleDB)
```sql
CREATE TABLE temperature_readings (
  trip_id       UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  celsius       DECIMAL(5,2) NOT NULL,
  sensor_id     TEXT,
  lat           DECIMAL(10,7),
  lng           DECIMAL(10,7)
);
SELECT create_hypertable('temperature_readings', 'recorded_at');
CREATE INDEX ON temperature_readings (trip_id, recorded_at DESC);
```

**Patrón Knex — insert:**
```typescript
await db('temperature_readings').insert({
  trip_id: tripId,
  recorded_at: new Date(),
  celsius: data.celsius,      // number JS → DECIMAL
  sensor_id: data.sensorId ?? null,
  lat: data.lat ?? null,
  lng: data.lng ?? null,
});
```

### custody_events (append-only)
```sql
CREATE TABLE custody_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  event_type      VARCHAR(30) NOT NULL CHECK (event_type IN ('pick_up','handoff','delivery')),
  actor_id        UUID NOT NULL REFERENCES users(id),
  signature_url   TEXT,
  photo_url       TEXT,
  declared_value  DECIMAL(12,2),
  notes           TEXT,
  lat             DECIMAL(10,7),
  lng             DECIMAL(10,7),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sequence        INTEGER NOT NULL
);
CREATE INDEX ON custody_events (trip_id, sequence);
CREATE UNIQUE INDEX ON custody_events (trip_id, sequence);
```

### Alteraciones a tablas existentes
```sql
-- document_requirements: requisitos por vertical
ALTER TABLE document_requirements
  ADD COLUMN vertical_id UUID REFERENCES verticals(id) ON DELETE SET NULL;

-- trip_types: soporte per_weight_km
ALTER TABLE trip_types
  ADD COLUMN weight_capacity_kg DECIMAL(8,2);
```

---

## Interfaces TypeScript

### CustodyEvent
```typescript
interface CustodyEventRow {
  id: string;
  trip_id: string;
  event_type: 'pick_up' | 'handoff' | 'delivery';
  actor_id: string;
  actor_name?: string;         // JOIN con users
  signature_url: string | null;
  photo_url: string | null;
  declared_value: number | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  occurred_at: string;         // ISO8601
  sequence: number;
}

interface CreateCustodyEventInput {
  tripId: string;
  actorId: string;
  eventType: 'pick_up' | 'handoff' | 'delivery';
  signatureUrl?: string;
  photoUrl?: string;
  declaredValue?: number;
  notes?: string;
  lat?: number;
  lng?: number;
}
```

### TemperatureReading
```typescript
interface TemperatureReadingRow {
  trip_id: string;
  recorded_at: string;         // ISO8601
  celsius: number;
  sensor_id: string | null;
  lat: number | null;
  lng: number | null;
}

interface TemperatureSummary {
  min: number;
  max: number;
  avg: number;
  out_of_range_count: number;
  total_readings: number;
}

interface CreateTemperatureInput {
  tripId: string;
  celsius: number;
  sensorId?: string;
  lat?: number;
  lng?: number;
}
```

### PricingModel extension
```typescript
type PricingModel = 'per_km_min' | 'fixed_rate' | 'per_weight_km';

interface EstimateInput {
  tripTypeId: string;
  distanceKm: number;
  durationMin: number;
  regionId: string;
  pricingModel?: PricingModel;   // default: 'per_km_min'
  weightKg?: number;             // solo para per_weight_km
}
```

---

## Contratos de API

### POST /trips/:id/custody/events
```
Método: POST
Path:   /trips/:id/custody/events
Auth:   driver JWT (trip.driver_id === JWT.sub → lookup drivers)
```

**Request body:**
```typescript
{
  event_type:     'pick_up' | 'handoff' | 'delivery';  // requerido
  signature_url?: string;
  photo_url?:     string;
  declared_value?: number;
  notes?:         string;
  lat?:           number;
  lng?:           number;
}
```

**Response 201:**
```typescript
{
  id:          string;
  trip_id:     string;
  event_type:  string;
  actor_id:    string;
  occurred_at: string;
  sequence:    number;
}
```

**Errores:**
| HTTP | Código | Condición |
|---|---|---|
| 404 | TRIP_NOT_FOUND | trip no existe |
| 403 | FORBIDDEN | JWT no es el conductor de este viaje |
| 409 | TRIP_NOT_ACTIVE | viaje no está en ACCEPTED o IN_PROGRESS |

---

### GET /trips/:id/custody
```
Método: GET
Path:   /trips/:id/custody
Auth:   driver | passenger | admin JWT
```

**Response 200:**
```typescript
{
  trip_id: string;
  events: Array<{
    id:             string;
    event_type:     string;
    actor_id:       string;
    actor_name:     string;
    signature_url:  string | null;
    photo_url:      string | null;
    declared_value: number | null;
    notes:          string | null;
    lat:            number | null;
    lng:            number | null;
    occurred_at:    string;
    sequence:       number;
  }>;
}
```

**Errores:**
| HTTP | Código | Condición |
|---|---|---|
| 404 | TRIP_NOT_FOUND | trip no existe |
| 403 | FORBIDDEN | usuario no tiene acceso al viaje |

---

### POST /trips/:id/temperature
```
Método: POST
Path:   /trips/:id/temperature
Auth:   driver JWT
```

**Request body:**
```typescript
{
  celsius:    number;    // requerido; rango validado: -100 a 200
  sensor_id?: string;
  lat?:       number;
  lng?:       number;
}
```

**Response 201:**
```typescript
{
  trip_id:     string;
  celsius:     number;
  recorded_at: string;
}
```

**Errores:**
| HTTP | Código | Condición |
|---|---|---|
| 404 | TRIP_NOT_FOUND | trip no existe |
| 403 | FORBIDDEN | JWT no es el conductor de este viaje |
| 409 | TRIP_NOT_IN_PROGRESS | viaje no está en IN_PROGRESS |
| 400 | INVALID_TEMPERATURE | celsius fuera de rango [-100, 200] |

---

### GET /trips/:id/temperature
```
Método: GET
Path:   /trips/:id/temperature
Auth:   driver | passenger | admin JWT
Query:  ?from=ISO8601&to=ISO8601&limit=integer (todos opcionales)
```

**Response 200:**
```typescript
{
  trip_id:  string;
  readings: Array<{
    celsius:     number;
    recorded_at: string;
    sensor_id:   string | null;
    lat:         number | null;
    lng:         number | null;
  }>;
  summary: {
    min:               number;
    max:               number;
    avg:               number;
    out_of_range_count: number;   // 0 si no hay setpoints en trips.metadata
    total_readings:    number;
  };
}
```

---

### POST /trips/estimate *(extensión)*
```typescript
// Body — nuevos campos opcionales
{
  ...,                    // campos existentes sin cambio
  weight_kg?: number;     // para pricingModel per_weight_km
}
```

La lógica del PricingEngine lee `pricingModel` del vertical activo (desde `GET /config` cacheado en Redis).

---

## ADRs aplicables

| ADR | Decisión | Aplicación en este sprint |
|---|---|---|
| ADR-003 | PostgreSQL + TimescaleDB | temperature_readings como hypertable |
| ADR-008 | SELECT FOR UPDATE en transiciones | custody_events: verificar estado del viaje con lock |
| ADR-009 | pricing_snapshot inmutable | La extensión de pricing NO modifica pricing_snapshot |
| ADR-036 | verticals con features JSONB | Agregar pricingModel + nuevos feature flags al schema |
| ADR-040 | temperature_readings hypertable | Implementación directa |
| ADR-041 | custody_events append-only | Sin update/delete en service ni routes |
| ADR-042 | pricingModel en features | Switch en PricingEngine.estimate() |
| ADR-043 | document_requirements.vertical_id | Migración + seed + query update |

---

## Variables de entorno nuevas

Ninguna — los módulos usan la BD y Redis existentes.
