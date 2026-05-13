# Snapshot — Módulo: verticals + companies + configurations
> Última actualización: 2026-05-07 | Estado: ✅ Completo (Sprint 10 + ADR-046)

## Estado
- Implementación: 100%
- Tests unitarios verticals.service: 5/5 ✅
- Tests unitarios companies.service: 7/7 ✅
- Tests unitarios configurations.service: 8/8 ✅
- Cobertura services: 100% (verticals.service, configurations.service) / 60% companies.service
- Cobertura global post-sprint: 80.41% statements (> umbral 75%)

## Archivos

```
apps/api/src/modules/verticals/
├── verticals.repository.ts    ← findBySlug, findAll, update
├── verticals.service.ts       ← getConfig (Redis cache TTL 60s), getAll, updateFeatures
├── verticals.controller.ts    ← 3 handlers
└── verticals.routes.ts        ← GET /config (sin auth), GET/PATCH /admin/verticals (admin)

apps/api/src/modules/companies/
├── companies.repository.ts    ← create (409 SLUG_TAKEN), findAll, findById, update, addUser, removeUser
├── companies.service.ts       ← CRUD + user management
├── companies.controller.ts    ← 7 handlers
├── companies.routes.ts        ← 7 endpoints bajo /admin/companies
├── configurations.repository.ts ← upsert (ON CONFLICT MERGE), findAllByEntity (grouped), deleteOne
├── configurations.service.ts  ← validateEntityType, upsert, getGrouped, delete
├── configurations.controller.ts ← 3 handlers
└── configurations.routes.ts   ← GET/PUT/DELETE /config/entity/:type/:id/:ns/:key

apps/api/migrations/
├── 20240101000034_create_verticals_add_vertical_id_metadata.ts
└── 20240101000035_create_companies_company_users_configurations.ts

apps/api/seeds/
└── 09_verticals_and_companies.ts  ← idempotente (ON CONFLICT)
```

## Endpoints

| Método | Path | Auth | Notas |
|---|---|---|---|
| GET | /config | ninguna | Vertical activo (VERTICAL_SLUG env). Redis TTL 60s |
| GET | /admin/verticals | admin JWT | Lista todos los activos |
| PATCH | /admin/verticals/:slug | admin JWT | Actualiza features/config, invalida cache |
| POST | /admin/companies | admin JWT | 409 si slug duplicado |
| GET | /admin/companies | admin JWT | Paginado, filtro vertical_id y active |
| GET | /admin/companies/:id | admin JWT | Con users_count |
| PATCH | /admin/companies/:id | admin JWT | Soft delete si active=false |
| GET | /admin/companies/:id/users | admin JWT | Lista usuarios vinculados |
| POST | /admin/companies/:id/users | admin JWT | Vincular usuario por user_id + role |
| DELETE | /admin/companies/:id/users/:userId | admin JWT | Desvincular usuario |
| GET | /config/entity/:type/:id | admin JWT | Agrupado por namespace |
| PUT | /config/entity/:type/:id/:ns/:key | admin JWT | Upsert (crea o actualiza) |
| DELETE | /config/entity/:type/:id/:ns/:key | admin JWT | 404 si no existe |

## Schema de BD

```sql
-- verticals
id UUID PK, slug UNIQUE, name, description, features JSONB, config JSONB, active, timestamps

-- companies  
id UUID PK, vertical_id FK, slug UNIQUE, name, rfc, tax_id, contact_email, contact_phone,
address, active, metadata JSONB, timestamps, deleted_at (soft delete)

-- company_users
id UUID PK, company_id FK, user_id FK, role CHECK (owner|admin|member), timestamps
UNIQUE(company_id, user_id)

-- configurations
id UUID PK, entity_type CHECK (company|user|vertical), entity_id UUID, namespace, key, value JSONB
UNIQUE(entity_type, entity_id, namespace, key)
```

## Verticales registradas (Seed 09)

| slug | pricingModel | scheduling | multiStop | cargoDeclaration | chainOfCustody | temperatureLog | b2bAccounts | requiresApproval | custodyEventTypes | cargoFields | unitTypeDetermination |
|---|---|---|---|---|---|---|---|---|---|---|---|
| taxi | per_km_min | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | — | — |
| custody | per_declared_value | ✅ | ✅ | ✅ | ✅ | ✗ | ✅ | **✅** | 3 tipos (✍️ en handoff/delivery) | 4 campos (declared_value requerido) | by_declared_value |
| cold-chain | per_declared_value | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | **✅** | 3 tipos (✍️ en delivery) | 4 campos | by_cargo_type |

## Extensibilidad de custody (ADR-046)

`vertical.store.ts` exporta 3 nuevos tipos para habilitar configuración por JSONB:
- `CustodyEventTypeConfig` — code, label, requiresPhoto, requiresSignature
- `CargoFieldConfig` — key, label, type, required, placeholder, multiline
- `VerticalFeatures.unitTypeDetermination` — by_declared_value | by_cargo_type | manual | null

`CustodyEventScreen` y `CargoDeclarationScreen` leen del store con fallback a defaults genéricos. Un fork solo necesita actualizar el seed para tener su flujo completo.

## Patrón Redis cache

```typescript
// Key: "vertical:config:{slug}"  TTL: 60s
// Cache miss → BD → SET EX 60
// PATCH /admin/verticals/:slug → DEL key
```

## ADRs aplicables

- ADR-036: verticals como entidad de primera clase con features JSONB
- ADR-037: trips.metadata JSONB para extensibilidad por vertical sin migraciones
- ADR-038: companies + company_users como capa B2B — usuarios compartidos entre empresas
- ADR-039: configurations key-value por entidad con namespace
- ADR-046: custodyEventTypes y cargoFields configurables por JSONB — extensibilidad para fork de custodia de valores
