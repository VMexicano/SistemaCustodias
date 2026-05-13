# Sprint 10 — Diseño: Backend Foundation Multi-vertical + Companies + Configurations

## Arquitectura al finalizar el sprint

```
API (Fastify 4)
├── modules/
│   ├── auth/           ✅ sin cambios
│   ├── users/          ✅ sin cambios
│   ├── drivers/        ✅ sin cambios
│   ├── trips/          ✅ + metadata en request/response
│   ├── pricing/        ✅ sin cambios
│   ├── payments/       ✅ sin cambios
│   ├── notifications/  ✅ sin cambios
│   ├── tracking/       ✅ sin cambios
│   ├── scheduled-trips/✅ sin cambios
│   ├── scheduler/      ✅ sin cambios
│   ├── admin/          ✅ + companies + verticals endpoints
│   ├── verticals/      🆕 slug, features, config, GET /config
│   └── companies/      🆕 CRUD + company_users + configurations
└── shared/
    └── config-entity/  🆕 repositorio configurations

PostgreSQL
├── verticals           🆕
├── companies           🆕
├── company_users       🆕
├── configurations      🆕
├── trip_types          ✅ + vertical_id FK
└── trips               ✅ + metadata JSONB
```

---

## Estructura de directorios nuevos

```
apps/api/src/modules/
├── verticals/
│   ├── verticals.routes.ts
│   ├── verticals.controller.ts
│   ├── verticals.service.ts
│   └── verticals.repository.ts
└── companies/
    ├── companies.routes.ts
    ├── companies.controller.ts
    ├── companies.service.ts
    ├── companies.repository.ts
    ├── configurations.routes.ts
    ├── configurations.controller.ts
    ├── configurations.service.ts
    └── configurations.repository.ts

apps/api/migrations/
├── 20240101000034_create_verticals_add_vertical_id_metadata.ts
└── 20240101000035_create_companies_company_users_configurations.ts

apps/api/seeds/
└── 09_verticals_and_companies.ts
```

---

## Schema de base de datos

### Tabla: `verticals`

```sql
CREATE TABLE verticals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(50)  NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  features    JSONB        NOT NULL DEFAULT '{}',
  config      JSONB        NOT NULL DEFAULT '{}',
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

**features JSONB — interface TypeScript:**
```typescript
interface VerticalFeatures {
  scheduling:       boolean;  // viajes programados
  multiStop:        boolean;  // múltiples paradas en un viaje
  cargoDeclaration: boolean;  // declaración de carga/valor
  chainOfCustody:   boolean;  // firmas en cada parada
  temperatureLog:   boolean;  // monitoreo de temperatura
  b2bAccounts:      boolean;  // soporte a cuentas empresa
  pricingModel:     'per_km_min' | 'per_declared_value' | 'flat_rate';
}
```

**Seed inicial:**
```
taxi:       { scheduling: true,  multiStop: false, cargoDeclaration: false,
              chainOfCustody: false, temperatureLog: false, b2bAccounts: false,
              pricingModel: 'per_km_min' }
custody:    { scheduling: true,  multiStop: true,  cargoDeclaration: true,
              chainOfCustody: true,  temperatureLog: false, b2bAccounts: true,
              pricingModel: 'per_declared_value' }
cold-chain: { scheduling: true,  multiStop: true,  cargoDeclaration: true,
              chainOfCustody: true,  temperatureLog: true,  b2bAccounts: true,
              pricingModel: 'per_declared_value' }
```

### Alteraciones a tablas existentes

```sql
ALTER TABLE trip_types ADD COLUMN vertical_id UUID REFERENCES verticals(id);
ALTER TABLE trips      ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}';
```

### Tabla: `companies`

```sql
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_id   UUID REFERENCES verticals(id),
  slug          VARCHAR(100) NOT NULL UNIQUE,
  name          VARCHAR(255) NOT NULL,
  rfc           VARCHAR(13),          -- México
  tax_id        VARCHAR(50),          -- internacional
  contact_email VARCHAR(255),
  contact_phone VARCHAR(20),
  address       TEXT,
  active        BOOLEAN      NOT NULL DEFAULT true,
  metadata      JSONB        NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_companies_vertical_id ON companies(vertical_id);
CREATE INDEX idx_companies_active ON companies(active) WHERE deleted_at IS NULL;
```

### Tabla: `company_users`

```sql
CREATE TABLE company_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  role        VARCHAR(20) NOT NULL DEFAULT 'member',
              -- CHECK role IN ('owner', 'admin', 'member')
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);
CREATE INDEX idx_company_users_company ON company_users(company_id);
CREATE INDEX idx_company_users_user    ON company_users(user_id);
```

### Tabla: `configurations`

```sql
CREATE TABLE configurations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  VARCHAR(20)  NOT NULL,  -- 'company' | 'user' | 'vertical'
  entity_id    UUID         NOT NULL,
  namespace    VARCHAR(100) NOT NULL,  -- 'pricing' | 'notifications' | 'dispatch' | 'ui'
  key          VARCHAR(100) NOT NULL,
  value        JSONB        NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(entity_type, entity_id, namespace, key)
);
CREATE INDEX idx_configurations_entity ON configurations(entity_type, entity_id);
```

---

## Contratos de API

### Módulo: `verticals`

#### GET /config
```
Auth: ninguna
Response 200:
{
  slug: string
  name: string
  description: string | null
  features: VerticalFeatures
  config: Record<string, unknown>
}
Response 400: { code: 'VERTICAL_NOT_FOUND', message: string }
Cache: Redis key "vertical:config:{slug}" TTL 60s
Env: VERTICAL_SLUG=taxi
```

#### GET /admin/verticals
```
Auth: Bearer (roles: admin)
Response 200: Array<{
  id: string; slug: string; name: string
  features: VerticalFeatures; active: boolean
}>
```

#### PATCH /admin/verticals/:slug
```
Auth: Bearer (roles: admin)
Body: { features?: Partial<VerticalFeatures>; config?: Record<string, unknown>; name?: string }
Response 200: Vertical completo
Response 404: { code: 'VERTICAL_NOT_FOUND' }
Side effect: invalida Redis "vertical:config:{slug}"
```

---

### Módulo: `companies`

#### POST /admin/companies
```
Auth: Bearer (roles: admin)
Body: {
  name: string               // required
  slug: string               // required, único, regex: /^[a-z0-9-]+$/
  vertical_id?: string       // UUID, nullable
  rfc?: string               // max 13 chars
  tax_id?: string            // max 50 chars
  contact_email?: string
  contact_phone?: string
  address?: string
  metadata?: Record<string, unknown>
}
Response 201: Company completa
Errors:
  409 COMPANY_SLUG_TAKEN — slug ya existe
  422 VALIDATION_ERROR   — campos inválidos
```

#### GET /admin/companies
```
Auth: Bearer (roles: admin)
Query: page=1, limit=20, vertical_id?, active? (default: true)
Response 200: {
  data: Company[]
  total: number
  page: number
  limit: number
}
```

#### GET /admin/companies/:id
```
Auth: Bearer (roles: admin)
Response 200: Company + { users_count: number }
Response 404: COMPANY_NOT_FOUND
```

#### PATCH /admin/companies/:id
```
Auth: Bearer (roles: admin)
Body: Partial<{ name, rfc, tax_id, contact_email, contact_phone, address, active, metadata, vertical_id }>
Response 200: Company actualizada
Response 404: COMPANY_NOT_FOUND
```

#### GET /admin/companies/:id/users
```
Auth: Bearer (roles: admin)
Response 200: Array<{ user_id, full_name, phone, role, created_at }>
```

#### POST /admin/companies/:id/users
```
Auth: Bearer (roles: admin)
Body: { user_id: string; role: 'owner' | 'admin' | 'member' }
Response 201: CompanyUser
Errors:
  404 USER_NOT_FOUND
  409 USER_ALREADY_IN_COMPANY
```

#### DELETE /admin/companies/:id/users/:userId
```
Auth: Bearer (roles: admin)
Response 204: sin body
Response 404: COMPANY_USER_NOT_FOUND
```

---

### Módulo: `configurations`

#### GET /config/entity/:entityType/:entityId
```
Auth: Bearer (roles: admin)
Params: entityType ('company' | 'user' | 'vertical'), entityId (UUID)
Response 200: {
  [namespace: string]: {
    [key: string]: unknown
  }
}
-- Ejemplo:
{
  "pricing":       { "discount_pct": 10, "min_fare_override": 30 },
  "notifications": { "sms_enabled": false }
}
```

#### PUT /config/entity/:entityType/:entityId/:namespace/:key
```
Auth: Bearer (roles: admin)
Body: { value: unknown }  -- cualquier JSON válido
Response 200: { entity_type, entity_id, namespace, key, value }
-- Upsert: crea si no existe, actualiza si existe
```

#### DELETE /config/entity/:entityType/:entityId/:namespace/:key
```
Auth: Bearer (roles: admin)
Response 204: sin body
Response 404: CONFIG_NOT_FOUND
```

---

### Extensión módulo `trips`

#### POST /trips/estimate — body extendido
```typescript
// Campo nuevo (opcional):
metadata?: Record<string, unknown>  // default {}
// Response incluye: metadata (lo que se mandó)
```

#### POST /trips — body extendido
```typescript
metadata?: Record<string, unknown>  // se persiste en trips.metadata
```

#### GET /trips/:id y GET /trips/active — response extendido
```typescript
// Campo nuevo en response:
metadata: Record<string, unknown>
```

---

## ADRs aplicables

### ADR-036 — `verticals` como entidad de primera clase con feature flags JSONB

**Contexto:** La plataforma necesita soportar múltiples modelos de negocio (taxi, custodia, cadena de frío) desde la misma base de código.

**Decisión:** Crear tabla `verticals` con columna `features JSONB`. El vertical activo se determina por `VERTICAL_SLUG` env var. La API expone `GET /config` (público) que retorna el vertical activo. Los feature flags son el mecanismo de extensión — no se usa branching de código por vertical.

**Consecuencias:** Admin puede cambiar features sin deploy. La UI y la app leen `/config` al arrancar para adaptar su comportamiento.

---

### ADR-037 — `trips.metadata JSONB` para extensibilidad sin migraciones

**Contexto:** Cada vertical necesita guardar campos distintos en un viaje (taxi: ninguno extra; custodia: `declared_value`, `cargo_type`; cadena de frío: `temp_min`, `temp_max`).

**Decisión:** Agregar `trips.metadata JSONB DEFAULT {}`. Los módulos de vertical guardarán sus campos aquí hasta que el volumen justifique tablas propias. La API no valida el contenido del metadata — cada vertical es responsable.

**Consecuencias:** Migración única para todos los verticales. El riesgo es pérdida de tipado; se mitiga con validación Zod en cada módulo de vertical cuando se implemente.

---

### ADR-038 — `companies` + `company_users` como capa B2B

**Contexto:** Clientes empresariales necesitan ser modelados separados de usuarios individuales.

**Decisión:** Tabla `companies` independiente vinculada a `verticals`. Los usuarios existentes se asocian vía `company_users` — no se duplica la entidad `users`. Un usuario puede pertenecer a múltiples empresas (con distintos roles).

**Consecuencias:** La auth sigue siendo por usuario individual (no por empresa). En Sprint futuro se puede agregar `company_id` al JWT si se necesita contexto de empresa en cada request.

---

### ADR-039 — `configurations` como key-value store por entidad

**Contexto:** Cada empresa o usuario puede necesitar parámetros distintos (descuentos, límites, toggles de features).

**Decisión:** Tabla `configurations` con `(entity_type, entity_id, namespace, key)` como clave única y `value JSONB` libre. El namespace organiza las configs por dominio (`pricing`, `notifications`, `dispatch`).

**Consecuencias:** Flexibilidad máxima sin migraciones. El riesgo es configs huérfanas si se elimina la entidad — se mitiga con soft delete en companies y limpieza periódica (Sprint futuro).

---

## Variables de entorno nuevas

```bash
# apps/api/.env y .env.example
VERTICAL_SLUG=taxi   # slug del vertical activo en esta instancia
```
