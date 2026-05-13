# Sprint 3 — Conductores: Tasks (TDD)

> **Última actualización:** 2026-04-06
> **Estado:** Aprobado — listo para `/team`

---

## Resumen de tareas

| ID | Título | Tipo | Estado | Agentes |
|---|---|---|---|---|
| DRV-001 | Migración + seeds: completar schema de conductores | MIGRATION | 🔲 | backend |
| DRV-002 | `POST /drivers/register` — Registro como conductor | FEATURE | 🔲 | backend, qa |
| DRV-003 | `GET/PATCH /drivers/me` — Perfil del conductor | FEATURE | 🔲 | backend, qa |
| DRV-004 | `GET/POST /drivers/me/documents` — Documentos | FEATURE | 🔲 | backend, qa |
| DRV-005 | `GET/POST /drivers/me/vehicles` — Vehículos | FEATURE | 🔲 | backend, qa |
| DRV-006 | `POST /drivers/me/go-online` + `go-offline` | FEATURE | 🔲 | backend, qa |
| DRV-007 | `PATCH /drivers/me/location` — GPS (Redis only) | FEATURE | 🔲 | backend, qa |
| DRV-008 | `PATCH /admin/documents/:id` — Revisión admin | FEATURE | 🔲 | backend, qa |
| DRV-009 | Tests de integración: módulo drivers completo | QA_ONLY | 🔲 | qa |

---

## Grafo de dependencias

```
DRV-001
  └─→ DRV-002
        ├─→ DRV-003 ──┐
        ├─→ DRV-004 ──┼──→ DRV-006 ──→ DRV-007
        └─→ DRV-005   │
        DRV-004 ───────┴──→ DRV-008
                                 └──→ DRV-009 (espera DRV-002..DRV-008)
```

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|---|---|---|
| G0 | DRV-001 | Sin dependencias — arrancar inmediatamente |
| G1 | DRV-002 | DRV-001 completado |
| G2 | DRV-003, DRV-004, DRV-005 | DRV-002 completado — **ejecutar en paralelo** |
| G3 | DRV-006, DRV-008 | DRV-003 + DRV-004 completados — **ejecutar en paralelo** |
| G4 | DRV-007 | DRV-006 completado |
| G5 | DRV-009 | DRV-002..DRV-008 completados |

---

## Detalle de tareas

---

### DRV-001 — Migración + seeds: completar schema de conductores

- **Tipo:** MIGRATION
- **Sprint:** 3
- **Agentes:** backend
- **Depende de:** ninguna
- **Scope incluye:**
  - Migración 024: `drivers` + `license_expiry DATE` + `service_modes TEXT[] DEFAULT '{people}'`
  - Migración 025: `vehicles` + `status VARCHAR(20) DEFAULT 'pending'`
  - Migración 026: `trip_types` + `service_mode VARCHAR(20) DEFAULT 'people'` + UPDATE rows existentes
  - Migración 027: `driver_documents` + `UNIQUE(driver_id, requirement_id)`
  - Seed 05: `document_requirements` para región MX (5 requisitos, idempotente)
- **Scope excluye:** Cambios a otras tablas, cambios al seed de trip_types existente más allá de agregar service_mode
- **Criterio de aceptación (negocio):** Los conductores tienen campos service_modes y license_expiry disponibles
- **Criterio de aceptación (técnico):**
  - `pnpm --filter api knex migrate:latest` aplica las 4 migraciones sin error
  - `pnpm --filter api knex seed:run` crea 5 registros en document_requirements para MX
  - `pnpm --filter api knex migrate:rollback` revierte correctamente con down()
  - Seed es idempotente: ejecutar dos veces no duplica registros
- **Irreversible:** sí — las 4 migraciones modifican tablas existentes con datos en producción
- **Referencia SDD:** spec/sprint3/design.md §3

**Specs TDD (tests a escribir):**
```
// No requiere tests unitarios — verificación con migrate:latest + migrate:rollback
// La integración se verifica en DRV-009
```

---

### DRV-002 — POST /drivers/register

- **Tipo:** FEATURE
- **Sprint:** 3
- **Agentes:** backend, qa
- **Depende de:** DRV-001
- **Scope incluye:**
  - Crear registro en `drivers` con status `pending`
  - Agregar rol `driver` en `user_roles` (idempotente)
  - Validación Zod del body
  - Retornar DriverDTO
- **Scope excluye:** Subida de documentos, registro de vehículo, notificaciones
- **Criterio de aceptación (negocio):** Un usuario puede registrarse como conductor
- **Criterio de aceptación (técnico):**
  - POST 201 con DriverDTO válido
  - POST 409 DRIVER_ALREADY_REGISTERED si ya existe
  - POST 422 si serviceModes vacío o licenseExpiry pasada
  - `user_roles` contiene rol `driver` tras registro
- **Irreversible:** no
- **Referencia SDD:** spec/sprint3/design.md §5, §6

**Specs TDD:**
```typescript
// drivers.service.test.ts
describe('DriversService.register', () => {
  it('creates driver with pending status and driver role')
  it('is idempotent for user_roles (no duplicate role)')
  it('throws DRIVER_ALREADY_REGISTERED if driver exists for user')
  it('throws VALIDATION_ERROR if licenseExpiry is in the past')
  it('throws VALIDATION_ERROR if serviceModes is empty')
})

// drivers.integration.test.ts
describe('POST /drivers/register', () => {
  it('returns 201 with DriverDTO for valid payload')
  it('returns 409 DRIVER_ALREADY_REGISTERED on duplicate')
  it('returns 422 with invalid serviceModes')
  it('returns 401 without auth token')
})
```

---

### DRV-003 — GET/PATCH /drivers/me

- **Tipo:** FEATURE
- **Sprint:** 3
- **Agentes:** backend, qa
- **Depende de:** DRV-002
- **Scope incluye:**
  - `GET /drivers/me` — retorna DriverDTO completo
  - `PATCH /drivers/me` — actualiza licenseNumber, licenseExpiry, serviceModes
  - Audit log de cambios (R-DATA-002)
- **Scope excluye:** Cambio de status, online toggle, rating
- **Criterio de aceptación (negocio):** Conductor puede ver y editar su perfil
- **Criterio de aceptación (técnico):**
  - GET 200 con DriverDTO
  - PATCH 200 con DriverDTO actualizado
  - PATCH ignora fields no permitidos (status, online, rating)
  - Cambios registrados en audit_logs
  - GET 404 si usuario no tiene perfil de conductor
- **Irreversible:** no
- **Referencia SDD:** spec/sprint3/design.md §5

**Specs TDD:**
```typescript
describe('DriversService.getProfile', () => {
  it('returns DriverDTO for existing driver')
  it('throws DRIVER_NOT_FOUND if no driver for userId')
})

describe('DriversService.updateProfile', () => {
  it('updates licenseNumber and returns updated DriverDTO')
  it('updates serviceModes to cargo')
  it('writes audit_log entry on update')
  it('throws VALIDATION_ERROR if licenseExpiry is in the past')
  it('throws DRIVER_NOT_FOUND if no driver for userId')
})

describe('GET /drivers/me', () => {
  it('returns 200 with DriverDTO for authenticated driver')
  it('returns 404 DRIVER_NOT_FOUND for user without driver profile')
  it('returns 401 without token')
})

describe('PATCH /drivers/me', () => {
  it('returns 200 and updates profile fields')
  it('returns 401 without token')
})
```

---

### DRV-004 — GET/POST /drivers/me/documents

- **Tipo:** FEATURE
- **Sprint:** 3
- **Agentes:** backend, qa
- **Depende de:** DRV-002
- **Scope incluye:**
  - `GET /drivers/me/documents` — lista requisitos de la región + estado actual de cada uno
  - `POST /drivers/me/documents` — upsert de documento (fileUrl + requirementId)
  - Transición pending → documents_submitted (R-DRV-003 precondición)
- **Scope excluye:** Upload de archivo a S3, revisión admin (DRV-008), expiración automática (Sprint 6)
- **Criterio de aceptación (negocio):** Conductor puede subir sus documentos
- **Criterio de aceptación (técnico):**
  - GET retorna array de DocumentRequirementDTO con status `not_submitted` para docs no enviados
  - POST 201 con DriverDocumentDTO, upsert si ya existe doc para ese requirement
  - POST cambia drivers.status a `documents_submitted` si era `pending`
  - POST 404 si requirementId no existe para la región del conductor
- **Irreversible:** no
- **Referencia SDD:** spec/sprint3/design.md §5

**Specs TDD:**
```typescript
describe('DriversService.getDocuments', () => {
  it('returns all region requirements with not_submitted for unsent docs')
  it('returns requirement with its document status when submitted')
})

describe('DriversService.submitDocument', () => {
  it('creates document and returns DriverDocumentDTO')
  it('upserts (replaces) existing document for same requirement')
  it('transitions driver status from pending to documents_submitted')
  it('does not change status if already documents_submitted or higher')
  it('throws REQUIREMENT_NOT_FOUND for unknown requirementId')
})

describe('GET /drivers/me/documents', () => {
  it('returns 200 with all region requirements')
  it('returns 401 without token')
})

describe('POST /drivers/me/documents', () => {
  it('returns 201 with DriverDocumentDTO')
  it('returns 404 REQUIREMENT_NOT_FOUND for invalid requirementId')
  it('returns 401 without token')
})
```

---

### DRV-005 — GET/POST /drivers/me/vehicles

- **Tipo:** FEATURE
- **Sprint:** 3
- **Agentes:** backend, qa
- **Depende de:** DRV-002
- **Scope incluye:**
  - `GET /drivers/me/vehicles` — lista vehículos (no soft-deleted)
  - `POST /drivers/me/vehicles` — registrar vehículo nuevo (status: pending, active: primer vehículo = true)
  - Validación de placa única en toda la plataforma
- **Scope excluye:** Aprobación de vehículo (admin), múltiples activos, soft-delete
- **Criterio de aceptación (negocio):** Conductor puede registrar su vehículo
- **Criterio de aceptación (técnico):**
  - GET 200 con array de VehicleDTO
  - POST 201 con VehicleDTO, primer vehículo con active=true
  - POST 409 VEHICLE_PLATE_DUPLICATE si placa ya existe
- **Irreversible:** no
- **Referencia SDD:** spec/sprint3/design.md §5

**Specs TDD:**
```typescript
describe('DriversService.getVehicles', () => {
  it('returns empty array for driver with no vehicles')
  it('returns VehicleDTO array')
})

describe('DriversService.registerVehicle', () => {
  it('creates vehicle with pending status')
  it('sets active=true for first vehicle')
  it('sets active=false for subsequent vehicles')
  it('throws VEHICLE_PLATE_DUPLICATE for existing plate')
})

describe('POST /drivers/me/vehicles', () => {
  it('returns 201 with VehicleDTO')
  it('returns 409 VEHICLE_PLATE_DUPLICATE for duplicate plate')
  it('returns 422 with invalid year')
  it('returns 401 without token')
})
```

---

### DRV-006 — POST /drivers/me/go-online + go-offline

- **Tipo:** FEATURE
- **Sprint:** 3
- **Agentes:** backend, qa
- **Depende de:** DRV-003, DRV-004
- **Scope incluye:**
  - `POST /drivers/me/go-online` — validaciones R-DRV-001/004, SET online=true en PG
  - `POST /drivers/me/go-offline` — SET online=false en PG, DELETE Redis location key
  - Audit log de ambas operaciones (R-DATA-002)
  - Inicializar `driver:{id}:location` vacío en go-online (sin coordenadas)
- **Scope excluye:** Notificaciones push, matching con viajes
- **Criterio de aceptación (negocio):** Conductor aprobado puede activar/desactivar disponibilidad
- **Criterio de aceptación (técnico):**
  - go-online 200 si status=approved, docs ok, vehículo activo
  - go-online 403 DRIVER_NOT_APPROVED si status ≠ approved
  - go-online 403 DOCUMENTS_EXPIRED si hay docs required expirados
  - go-online 403 NO_ACTIVE_VEHICLE si no hay vehículo activo
  - go-offline 200 siempre (no falla aunque ya esté offline)
  - `drivers.online` refleja el estado correcto en PG
- **Irreversible:** no
- **Referencia SDD:** spec/sprint3/design.md §5, §8

**Specs TDD:**
```typescript
describe('DriversService.goOnline', () => {
  it('sets online=true for approved driver with docs and vehicle')
  it('throws DRIVER_NOT_APPROVED if status is pending')
  it('throws DOCUMENTS_EXPIRED if a required doc is expired')
  it('throws NO_ACTIVE_VEHICLE if driver has no active vehicle')
  it('writes audit_log entry')
})

describe('DriversService.goOffline', () => {
  it('sets online=false and deletes Redis location key')
  it('is idempotent — succeeds even if already offline')
  it('writes audit_log entry')
})

describe('POST /drivers/me/go-online', () => {
  it('returns 200 { online: true } for approved driver')
  it('returns 403 DRIVER_NOT_APPROVED')
  it('returns 401 without token')
})

describe('POST /drivers/me/go-offline', () => {
  it('returns 200 { online: false }')
  it('returns 401 without token')
})
```

---

### DRV-007 — PATCH /drivers/me/location

- **Tipo:** FEATURE
- **Sprint:** 3
- **Agentes:** backend, qa
- **Depende de:** DRV-006
- **Scope incluye:**
  - `PATCH /drivers/me/location` — HSET en Redis con TTL 5 min
  - Validación de lat/lng
  - Verificación de driver online antes de escribir
- **Scope excluye:** Persistencia en TimescaleDB (Sprint 4), broadcast a pasajeros (Sprint 4)
- **Criterio de aceptación (negocio):** La posición del conductor online está disponible en Redis
- **Criterio de aceptación (técnico):**
  - POST 200 y Redis contiene `driver:{id}:location` con TTL ≤ 300 seg
  - POST 403 DRIVER_OFFLINE si driver.online=false
  - Latencia < 50ms (escritura en Redis únicamente)
- **Irreversible:** no
- **Referencia SDD:** spec/sprint3/design.md §5, §8

**Specs TDD:**
```typescript
describe('DriversService.updateLocation', () => {
  it('writes lat/lng to Redis HSET with 5-minute TTL')
  it('throws DRIVER_OFFLINE if driver.online is false')
})

describe('PATCH /drivers/me/location', () => {
  it('returns 200 { updated: true } for online driver')
  it('returns 403 DRIVER_OFFLINE for offline driver')
  it('returns 422 with invalid coordinates (lat > 90)')
  it('returns 401 without token')
})
```

---

### DRV-008 — PATCH /admin/documents/:documentId

- **Tipo:** FEATURE
- **Sprint:** 3
- **Agentes:** backend, qa
- **Depende de:** DRV-004
- **Scope incluye:**
  - `PATCH /admin/documents/:documentId` — approved | rejected
  - Auto-aprobación del conductor (R-DRV-003) cuando todos los docs required están aprobados
  - Audit log del cambio de status del conductor (R-DATA-002)
  - `reviewedAt` y `reviewedBy` en el documento
- **Scope excluye:** Panel web admin, notificaciones push al conductor (Sprint 5)
- **Criterio de aceptación (negocio):** Admin puede aprobar/rechazar docs y el sistema auto-aprueba conductores
- **Criterio de aceptación (técnico):**
  - PATCH 200 con DriverDocumentDTO actualizado
  - Si todos los docs required aprobados → drivers.status = 'approved'
  - PATCH 403 si el token no tiene rol admin
  - PATCH 404 DOCUMENT_NOT_FOUND para doc inexistente
  - PATCH 422 si status=rejected sin rejectionReason
- **Irreversible:** no
- **Referencia SDD:** spec/sprint3/design.md §5, §6

**Specs TDD:**
```typescript
describe('AdminDocumentsService.reviewDocument', () => {
  it('approves document and records reviewedAt + reviewedBy')
  it('rejects document with rejectionReason')
  it('auto-approves driver when all required docs are approved (R-DRV-003)')
  it('does not auto-approve if not all required docs are approved')
  it('writes audit_log for driver status change')
  it('throws DOCUMENT_NOT_FOUND for unknown documentId')
  it('throws VALIDATION_ERROR if rejecting without rejectionReason')
})

describe('PATCH /admin/documents/:documentId', () => {
  it('returns 200 DriverDocumentDTO for admin')
  it('triggers driver auto-approval when all docs approved')
  it('returns 403 FORBIDDEN for non-admin token')
  it('returns 404 DOCUMENT_NOT_FOUND')
  it('returns 422 on rejected without rejectionReason')
  it('returns 401 without token')
})
```

---

### DRV-009 — Tests de integración: módulo drivers

- **Tipo:** QA_ONLY
- **Sprint:** 3
- **Agentes:** qa
- **Depende de:** DRV-002, DRV-003, DRV-004, DRV-005, DRV-006, DRV-007, DRV-008
- **Scope incluye:**
  - Suite de integración completa en `drivers.integration.test.ts`
  - Testcontainers (PostgreSQL + Redis) para aislamiento
  - Flujo E2E de onboarding: register → documents → vehicle → admin review → go-online → location
- **Scope excluye:** Tests E2E con Playwright (Sprint 6)
- **Criterio de aceptación (negocio):** Flujo de onboarding completo verifica reglas de negocio R-DRV-001..004
- **Criterio de aceptación (técnico):**
  - Todos los tests de DRV-002..DRV-008 pasan
  - Cobertura del módulo drivers ≥ 75%
  - Suite < 30 segundos en CI
- **Irreversible:** no
- **Referencia TDD:** Specs listadas en DRV-002..DRV-008

**Flujo E2E a incluir:**
```typescript
describe('Driver onboarding — flujo completo', () => {
  it('full flow: register → submit docs → register vehicle → admin approves → go-online → update location', async () => {
    // 1. Crear usuario y autenticar (helpers de Sprint 2)
    // 2. POST /drivers/register → 201 (status: pending)
    // 3. POST /drivers/me/documents × N → status: documents_submitted
    // 4. POST /drivers/me/vehicles → 201
    // 5. PATCH /admin/documents/:id × N (como admin) → último aprueba → driver status: approved
    // 6. POST /drivers/me/go-online → 200
    // 7. PATCH /drivers/me/location → 200, Redis tiene location
    // 8. POST /drivers/me/go-offline → 200, Redis location eliminada
  })

  it('go-online fails if driver has no active vehicle')
  it('go-online fails if a required document is pending')
  it('admin rejection keeps driver in documents_submitted')
})
```

---

## Definition of Done — Sprint 3

- [ ] Las 4 migraciones aplican y revierten sin error
- [ ] El seed 05 es idempotente
- [ ] Los 9 endpoints responden con los status codes documentados
- [ ] Auto-aprobación (R-DRV-003) funciona correctamente
- [ ] `driver:{id}:location` en Redis con TTL 5 min tras go-online + update-location
- [ ] Audit log en 100% de operaciones de escritura
- [ ] TypeScript strict — cero errores de tipo
- [ ] ESLint — cero warnings
- [ ] Tests: todos los specs unitarios pasan
- [ ] Tests integración: flujo E2E completo pasa
- [ ] `context/snapshots/drivers.snapshot.md` actualizado
- [ ] `docs/06_memory.md` actualizado con módulo drivers ✅

---

## Notas por agente

### backend
- El patrón es idéntico a Sprint 2: routes → controller → service → repository
- `DriversService` recibe Redis como dependencia inyectada (igual que `AuthService`)
- Usar `authenticate` + `authorize('driver')` en rutas de conductor
- Usar `authorize('admin')` en rutas de `/admin/*`
- `goOnline` necesita SELECT para verificar estado antes de UPDATE — no requiere FOR UPDATE en Sprint 3 (no hay concurrencia de viajes aún, eso es Sprint 4)
- El upsert en documentos: `INSERT ... ON CONFLICT (driver_id, requirement_id) DO UPDATE`
- `service_modes` en PG es `TEXT[]` — en Knex usar `knex.raw("'{people}'")` o `specificType`

### qa
- Usar `build-integration-app.ts` como base — agregar `DriversService` y `AdminDocumentsService` al wiring
- Los seeds corren en `build-integration-app.ts` (ya configurado) — el seed 05 estará disponible automáticamente
- Para tests de admin: crear usuario admin via seed o helper, obtener token con rol admin
- Verificar Redis directamente: `await redis.hgetall('driver:{id}:location')`

### devops
- No hay cambios de infraestructura en Sprint 3
- Las migraciones son additive (ALTER TABLE) — no requieren downtime en producción
