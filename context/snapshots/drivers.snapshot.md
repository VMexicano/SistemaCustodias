# Snapshot — Módulo: drivers
> Última actualización: 2026-04-06 | Estado: ✅ Sprint 3 completo — 114/114 tests pasan

## Estado
- Implementación: 100%
- Tests: 114/114 (unit + integration con Testcontainers)
- Integrado en app.ts: ✅ Sí
- Spec: ✅ spec/sprint3/ generado y aprobado

## Responsabilidad
Registro, perfil, documentos, vehículos, disponibilidad y ubicación GPS de conductores.
Soporte multi-vertical desde el inicio: service_modes por conductor.

## Estados del conductor
```
pending → documents_submitted → under_review → approved
                                              ↓ (puede ocurrir en cualquier momento)
                                         suspended | banned
```

## Service modes (ADR-021)
```
people   — transporte de personas (taxi)
cargo    — transporte de carga/paquetes
mixed    — ambos
```

## Endpoints planeados (Sprint 3)
```
POST   /drivers/register                → Registro como conductor (RF-301)
GET    /drivers/me                      → Perfil (RF-302)
PATCH  /drivers/me                      → Actualizar perfil (RF-302)
GET    /drivers/me/documents            → Lista de docs requeridos + estado (RF-303)
POST   /drivers/me/documents            → Subir documento (RF-303)
GET    /drivers/me/vehicles             → Vehículos registrados (RF-304)
POST   /drivers/me/vehicles             → Registrar vehículo (RF-304)
POST   /drivers/me/go-online            → Activar disponibilidad (RF-305)
POST   /drivers/me/go-offline           → Desactivar disponibilidad (RF-305)
PATCH  /drivers/me/location             → Actualizar GPS — Redis only (RF-306)
PATCH  /admin/documents/:documentId     → Revisión admin (RF-307)
```

## Tablas afectadas
`drivers` · `driver_documents` · `document_requirements` · `vehicles` · `user_roles` · `audit_logs`

## Migraciones nuevas (Sprint 3)
```
024: drivers + license_expiry + service_modes TEXT[]
025: vehicles + status
026: trip_types + service_mode
027: driver_documents + UNIQUE(driver_id, requirement_id)
```

## Seeds nuevos (Sprint 3)
```
05_document_requirements.ts — 5 requisitos para región MX
```

## Redis keys
```
driver:{id}:location    HSET { lat, lng, updatedAt }  TTL 5 min
driver:{id}:active_trip STRING (Sprint 4)
```

## Reglas críticas
- R-DRV-001: go-online requiere todos los documentos requeridos aprobados y vehículo activo
- R-DRV-002: Si doc vence durante viaje → terminar viaje, suspender después
- R-DRV-003: Aprobación automática cuando todos los docs requeridos están aprobados
- R-DRV-004: online=true solo si status='approved'
- Documentos configurables por región desde admin (no hardcodeados)

## BusinessErrors del módulo
```
DRIVER_ALREADY_REGISTERED  409
DRIVER_NOT_FOUND           404
DRIVER_NOT_APPROVED        403
DOCUMENTS_EXPIRED          403
NO_ACTIVE_VEHICLE          403
DRIVER_OFFLINE             403
REQUIREMENT_NOT_FOUND      404
VEHICLE_PLATE_DUPLICATE    409
DOCUMENT_NOT_FOUND         404
```

## Archivos implementados
```
src/modules/drivers/
├── drivers.routes.ts
├── drivers.controller.ts
├── drivers.service.ts
├── drivers.repository.ts
├── drivers.types.ts
└── documents/
    ├── documents.controller.ts
    ├── documents.service.ts
    └── documents.repository.ts

src/modules/admin/documents/
├── admin-documents.routes.ts
├── admin-documents.controller.ts
└── admin-documents.service.ts

src/__tests__/drivers/
├── drivers.service.test.ts
└── drivers.integration.test.ts
```

## ADRs aplicables
- ADR-019: URLs de documentos (cliente provee URL, sin S3 en Sprint 3)
- ADR-020: Registro de conductor como flujo separado
- ADR-021: service_modes multi-vertical
