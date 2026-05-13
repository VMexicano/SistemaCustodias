# Sprint 3 — Conductores: Design (SDD)

> **Última actualización:** 2026-04-06
> **Estado:** Aprobado

---

## 1. Arquitectura al finalizar Sprint 3

```
┌─────────────────────────────────────────────────────────┐
│                    Fastify API                          │
│                                                         │
│  /auth/*       → AuthModule    (Sprint 2 ✅)            │
│  /users/*      → UsersModule   (Sprint 2 ✅)            │
│  /drivers/*    → DriversModule (Sprint 3 🆕)            │
│  /admin/*      → AdminModule   (Sprint 3 🆕 parcial)    │
└────────────────────────┬────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     PostgreSQL        Redis         audit_logs
  (drivers,         (driver:loc,   (append-only)
   vehicles,         driver:trip)
   documents)
```

---

## 2. Estructura de directorios

```
apps/api/src/modules/drivers/
├── drivers.routes.ts           ← Endpoints + Zod schemas
├── drivers.controller.ts       ← HTTP adapter (sin lógica)
├── drivers.service.ts          ← Lógica de negocio
├── drivers.repository.ts       ← Acceso a BD (Knex)
├── drivers.types.ts            ← Interfaces DriverDTO, VehicleDTO, etc.
└── documents/
    ├── documents.controller.ts
    ├── documents.service.ts
    └── documents.repository.ts

apps/api/src/modules/admin/
└── documents/
    ├── admin-documents.routes.ts
    ├── admin-documents.controller.ts
    └── admin-documents.service.ts

apps/api/migrations/
├── 20240101000024_alter_drivers_schema.ts
├── 20240101000025_alter_vehicles_add_status.ts
├── 20240101000026_alter_trip_types_add_service_mode.ts
└── 20240101000027_add_unique_driver_documents.ts

apps/api/seeds/
└── 05_document_requirements.ts

apps/api/src/__tests__/drivers/
├── drivers.service.test.ts     ← Unit tests (service mock repo)
└── drivers.integration.test.ts ← Integration tests (Testcontainers)
```

---

## 3. Migraciones nuevas

### 20240101000024 — alter_drivers_schema

```typescript
// UP
await knex.schema.alterTable('drivers', (table) => {
  table.date('license_expiry').nullable();
  table.specificType('service_modes', 'TEXT[]').notNullable().defaultTo('{people}');
});

// DOWN
await knex.schema.alterTable('drivers', (table) => {
  table.dropColumn('license_expiry');
  table.dropColumn('service_modes');
});
```

### 20240101000025 — alter_vehicles_add_status

```typescript
// UP
await knex.schema.alterTable('vehicles', (table) => {
  table.string('status', 20).notNullable().defaultTo('pending');
});

// DOWN
await knex.schema.alterTable('vehicles', (table) => {
  table.dropColumn('status');
});
```

### 20240101000026 — alter_trip_types_add_service_mode

```typescript
// UP
await knex.schema.alterTable('trip_types', (table) => {
  table.string('service_mode', 20).notNullable().defaultTo('people');
});
// Update existing rows
await knex('trip_types').update({ service_mode: 'people' });

// DOWN
await knex.schema.alterTable('trip_types', (table) => {
  table.dropColumn('service_mode');
});
```

### 20240101000027 — add_unique_driver_documents

```typescript
// UP
await knex.schema.alterTable('driver_documents', (table) => {
  table.unique(['driver_id', 'requirement_id']);
});

// DOWN
await knex.schema.alterTable('driver_documents', (table) => {
  table.dropUnique(['driver_id', 'requirement_id']);
});
```

### Seed 05 — document_requirements (MX)

```typescript
// Orden de inserción: region_config (ya existe) → document_requirements
// Los IDs de region_config se resuelven en runtime con:
//   knex('region_config').where({ country_code: 'MX' }).select('id').first()

const requirements = [
  { code: 'drivers_license',    name: 'Licencia de conducir',        required: true,  applies_to: 'driver'   },
  { code: 'drivers_license_b',  name: 'Licencia tipo B (carga)',     required: false, applies_to: 'driver'   },
  { code: 'vehicle_registration', name: 'Tarjeta de circulación',    required: true,  applies_to: 'vehicle'  },
  { code: 'vehicle_insurance',  name: 'Seguro de auto vigente',      required: true,  applies_to: 'vehicle'  },
  { code: 'driver_photo',       name: 'Foto de identificación',      required: true,  applies_to: 'driver'   },
];
// Insert con ON CONFLICT DO NOTHING para idempotencia
```

---

## 4. Interfaces TypeScript

```typescript
// drivers.types.ts

export type DriverStatus = 'pending' | 'documents_submitted' | 'under_review' | 'approved' | 'suspended' | 'banned';
export type ServiceMode   = 'people' | 'cargo' | 'mixed';
export type DocumentStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'not_submitted';
export type VehicleStatus  = 'pending' | 'approved' | 'rejected';

export interface DriverDTO {
  id: string;
  userId: string;
  licenseNumber: string | null;
  licenseExpiry: string | null;   // ISO 8601 date
  status: DriverStatus;
  serviceModes: ServiceMode[];
  online: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  totalTrips: number;
  createdAt: string;
}

export interface DocumentRequirementDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  required: boolean;
  appliesTo: 'driver' | 'vehicle';
  // Estado actual del documento del conductor para este requisito:
  documentStatus: DocumentStatus;
  documentId: string | null;
  fileUrl: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
}

export interface DriverDocumentDTO {
  id: string;
  requirementId: string;
  requirementCode: string;
  requirementName: string;
  fileUrl: string;
  status: DocumentStatus;
  expiresAt: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
}

export interface VehicleDTO {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  status: VehicleStatus;
  active: boolean;
  createdAt: string;
}

export interface DriverLocationDTO {
  latitude: number;
  longitude: number;
  updatedAt: string;
}
```

---

## 5. Contratos de API

### POST /drivers/register

```
Auth: Bearer token (pasajero autenticado)
Rate: 10 req / 1 hora por IP

Request:
{
  licenseNumber:  string    // min 5, max 50
  licenseExpiry:  string    // ISO 8601 date — debe ser futura
  serviceModes:   ('people' | 'cargo' | 'mixed')[]  // min 1 elemento
}

Response 201:
{
  driver: DriverDTO
}

Errores:
  409  DRIVER_ALREADY_REGISTERED
  422  VALIDATION_ERROR
  401  TOKEN_INVALID
```

---

### GET /drivers/me

```
Auth: Bearer token (rol driver)

Response 200: DriverDTO

Errores:
  404  DRIVER_NOT_FOUND
  401  TOKEN_INVALID
```

---

### PATCH /drivers/me

```
Auth: Bearer token (rol driver)

Request (todos opcionales):
{
  licenseNumber?: string
  licenseExpiry?: string    // ISO 8601 date — debe ser futura
  serviceModes?:  ('people' | 'cargo' | 'mixed')[]
}

Response 200: DriverDTO

Errores:
  404  DRIVER_NOT_FOUND
  422  VALIDATION_ERROR
  401  TOKEN_INVALID
```

---

### GET /drivers/me/documents

```
Auth: Bearer token (rol driver)

Response 200: DocumentRequirementDTO[]
// Lista todos los requisitos de la región del conductor
// con el estado actual de cada uno

Errores:
  404  DRIVER_NOT_FOUND
  401  TOKEN_INVALID
```

---

### POST /drivers/me/documents

```
Auth: Bearer token (rol driver)

Request:
{
  requirementId:  string (UUID)
  fileUrl:        string (URL válida, max 2048 chars)
  expiresAt?:     string (ISO 8601 date)
}

Response 201: DriverDocumentDTO

Comportamiento:
  - Si ya existe doc para ese requirementId → upsert (reemplaza)
  - Si conductor estaba en 'pending' → pasa a 'documents_submitted'

Errores:
  404  DRIVER_NOT_FOUND
  404  REQUIREMENT_NOT_FOUND
  422  VALIDATION_ERROR
  401  TOKEN_INVALID
```

---

### GET /drivers/me/vehicles

```
Auth: Bearer token (rol driver)

Response 200: VehicleDTO[]

Errores:
  404  DRIVER_NOT_FOUND
  401  TOKEN_INVALID
```

---

### POST /drivers/me/vehicles

```
Auth: Bearer token (rol driver)

Request:
{
  make:         string  // max 50
  model:        string  // max 50
  year:         number  // 1990..currentYear+1
  color:        string  // max 30
  licensePlate: string  // max 20, unique
}

Response 201: VehicleDTO

Comportamiento:
  - Si es el primer vehículo del conductor → active = true
  - status inicial = 'pending'

Errores:
  404  DRIVER_NOT_FOUND
  409  VEHICLE_PLATE_DUPLICATE
  422  VALIDATION_ERROR
  401  TOKEN_INVALID
```

---

### POST /drivers/me/go-online

```
Auth: Bearer token (rol driver)

Request: {} (vacío)

Response 200:
{
  online: true
  driverStatus: 'approved'
}

Errores:
  403  DRIVER_NOT_APPROVED    (drivers.status !== 'approved')
  403  DOCUMENTS_EXPIRED      (algún doc required está expirado)
  403  NO_ACTIVE_VEHICLE      (sin vehículo activo)
  404  DRIVER_NOT_FOUND
  401  TOKEN_INVALID
```

---

### POST /drivers/me/go-offline

```
Auth: Bearer token (rol driver)

Request: {} (vacío)

Response 200:
{
  online: false
}

Errores:
  404  DRIVER_NOT_FOUND
  401  TOKEN_INVALID
```

---

### PATCH /drivers/me/location

```
Auth: Bearer token (rol driver)
Rate: 1000 req / 1 hora por driver

Request:
{
  latitude:  number  // -90..90
  longitude: number  // -180..180
}

Response 200:
{
  updated: true
}

Comportamiento:
  - Escribe HSET driver:{driverId}:location { lat, lng, updatedAt } con TTL 5 min
  - NO persiste en TimescaleDB (Sprint 4)

Errores:
  403  DRIVER_OFFLINE   (drivers.online = false)
  404  DRIVER_NOT_FOUND
  422  VALIDATION_ERROR
  401  TOKEN_INVALID
```

---

### PATCH /admin/documents/:documentId

```
Auth: Bearer token (rol admin)

Request:
{
  status:           'approved' | 'rejected'
  rejectionReason?: string  // requerido si status = 'rejected'
}

Response 200: DriverDocumentDTO

Comportamiento post-aprobación (R-DRV-003):
  - Consultar todos los driver_documents del conductor donde required = true
  - Si TODOS están 'approved' → cambiar drivers.status a 'approved'
  - Registrar en audit_logs

Errores:
  404  DOCUMENT_NOT_FOUND
  422  VALIDATION_ERROR  (rejected sin rejectionReason)
  403  FORBIDDEN
  401  TOKEN_INVALID
```

---

## 6. Diseño del servicio — DriversService

```typescript
export class DriversService {
  constructor(
    private readonly driversRepo: DriversRepository,
    private readonly documentsRepo: DocumentsRepository,
    private readonly usersRepo: UsersRepository,
    private readonly redis: Redis,
    private readonly db: Database,
  ) {}

  async register(userId: string, data: RegisterDriverDTO): Promise<DriverDTO>
  async getProfile(userId: string): Promise<DriverDTO>
  async updateProfile(userId: string, data: UpdateDriverDTO): Promise<DriverDTO>
  async getDocuments(userId: string): Promise<DocumentRequirementDTO[]>
  async submitDocument(userId: string, data: SubmitDocumentDTO): Promise<DriverDocumentDTO>
  async getVehicles(userId: string): Promise<VehicleDTO[]>
  async registerVehicle(userId: string, data: RegisterVehicleDTO): Promise<VehicleDTO>
  async goOnline(userId: string): Promise<{ online: true }>
  async goOffline(userId: string): Promise<{ online: false }>
  async updateLocation(userId: string, data: LocationDTO): Promise<void>
}

export class AdminDocumentsService {
  constructor(
    private readonly documentsRepo: DocumentsRepository,
    private readonly driversRepo: DriversRepository,
    private readonly db: Database,
  ) {}

  async reviewDocument(adminId: string, documentId: string, data: ReviewDocumentDTO): Promise<DriverDocumentDTO>
  // Incluye lógica de auto-aprobación (R-DRV-003)
}
```

---

## 7. Diseño del repositorio — DriversRepository

```typescript
export class DriversRepository {
  async findByUserId(userId: string): Promise<Driver | undefined>
  async create(data: CreateDriverData): Promise<Driver>
  async update(driverId: string, data: Partial<Driver>): Promise<Driver>
  async setOnline(driverId: string, online: boolean): Promise<void>
}

export class DocumentsRepository {
  async findRequirementsByRegion(regionId: string): Promise<DocumentRequirement[]>
  async findRequirementById(id: string): Promise<DocumentRequirement | undefined>
  async findByDriver(driverId: string): Promise<DriverDocument[]>
  async findById(id: string): Promise<DriverDocument | undefined>
  async upsert(data: UpsertDocumentData): Promise<DriverDocument>
  async update(id: string, data: Partial<DriverDocument>): Promise<DriverDocument>
  async countRequiredApproved(driverId: string): Promise<{ total: number; approved: number }>
}

export class VehiclesRepository {
  async findByDriver(driverId: string): Promise<Vehicle[]>
  async findActiveByDriver(driverId: string): Promise<Vehicle | undefined>
  async findByPlate(licensePlate: string): Promise<Vehicle | undefined>
  async create(data: CreateVehicleData): Promise<Vehicle>
}
```

---

## 8. Redis keys del módulo

```
driver:{id}:location    HSET { lat: string, lng: string, updatedAt: string }
                        TTL: 5 minutos
                        SET en go-online (vacío), HSET en cada location update
                        DELETE en go-offline
```

---

## 9. ADRs aplicables

| ADR | Decisión | Aplica en |
|---|---|---|
| ADR-001 | Monolito modular | Estructura de módulos |
| ADR-002 | Fastify (throughput location) | Rate limit 1000 req/h en /location |
| ADR-003 | PostgreSQL + Redis | Drivers en PG, location en Redis |
| ADR-008 | SELECT FOR UPDATE | go-online: verificar y actualizar atomicamente |
| ADR-013 | Testcontainers | Tests de integración |
| ADR-014 | SDD/TDD por sprint | Este documento |
| ADR-019 | URLs de documentos | POST /drivers/me/documents acepta fileUrl |
| ADR-020 | Registro separado | POST /drivers/register es flujo independiente |
| ADR-021 | service_modes multi-vertical | drivers.service_modes + trip_types.service_mode |

---

## 10. Variables de entorno nuevas

Ninguna. El módulo de drivers no requiere nuevas variables de entorno. Las credenciales de Redis y PostgreSQL ya están configuradas desde Sprint 1.

---

## 11. BusinessErrors nuevos

```typescript
// Agregar a business-error.ts:
DRIVER_ALREADY_REGISTERED    // 409 — usuario ya tiene perfil de conductor
DRIVER_NOT_FOUND             // 404 — ya estaba declarado en steering/business-rules.md
DRIVER_NOT_APPROVED          // 403 — R-DRV-001
DOCUMENTS_EXPIRED            // 403 — R-DRV-001
NO_ACTIVE_VEHICLE            // 403 — go-online sin vehículo activo
DRIVER_OFFLINE               // 403 — actualizar location sin estar online
REQUIREMENT_NOT_FOUND        // 404 — requisito de documento no existe para la región
VEHICLE_PLATE_DUPLICATE      // 409 — placa ya registrada en el sistema
DOCUMENT_NOT_FOUND           // 404 — documento no existe para admin review
```
