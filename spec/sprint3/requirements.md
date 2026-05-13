# Sprint 3 — Conductores: Requirements

> **Última actualización:** 2026-04-06
> **Estado:** Aprobado — listo para ejecución con `/team`

---

## Objetivo del sprint

Implementar el módulo de conductores completo: registro, perfil, documentos, vehículos, disponibilidad y actualización de ubicación GPS. El módulo incluye el flujo de onboarding (pending → approved) y la revisión de documentos por parte del admin. El diseño contempla multi-vertical desde el inicio: un conductor puede operar en modo `people`, `cargo` o `mixed` según los servicios que presta.

---

## Scope

| Incluye | Excluye |
|---|---|
| Registro de conductor (`POST /drivers/register`) | Upload de archivos a S3/GCS (Sprint 6) |
| Perfil del conductor (`GET/PATCH /drivers/me`) | Matching conductor↔pasajero (Sprint 4) |
| Gestión de documentos (`GET/POST /drivers/me/documents`) | Expiración automática de documentos (scheduler, Sprint 6) |
| Gestión de vehículos (`GET/POST /drivers/me/vehicles`) | Múltiples vehículos activos simultáneos |
| Disponibilidad (`go-online` / `go-offline`) | Notificaciones push al conductor (Sprint 5) |
| Actualización de GPS en Redis (`PATCH /drivers/me/location`) | Persistencia GPS en TimescaleDB (Sprint 4) |
| Revisión de documentos por admin (`PATCH /admin/documents/:id`) | Panel admin web (Sprint 6) |
| Tests de integración: módulo drivers completo | Tests E2E con Playwright (Sprint 6) |
| Migraciones: campos faltantes en schema existente | Reescritura del schema base |
| Seed: requisitos de documentos para región MX | Requisitos para otras regiones |
| `service_modes` en drivers y `service_mode` en trip_types | Lógica de matching por service_mode (Sprint 4) |

---

## Actores y stakeholders

| Actor | Rol | Interés en este sprint |
|---|---|---|
| Conductor (nuevo) | Usuario con rol `driver` | Poder registrarse, subir docs y ponerse online |
| Conductor (activo) | Usuario con `drivers.status = 'approved'` | Actualizar ubicación y disponibilidad |
| Administrador | Usuario con rol `admin` | Revisar y aprobar/rechazar documentos |
| Sistema | Lógica interna | Cambiar status a `approved` automáticamente (R-DRV-003) |

---

## Requerimientos funcionales

### RF-301 — Registro como conductor

**Como** usuario autenticado con rol `passenger`,
**quiero** registrarme como conductor proporcionando mis datos de licencia y modos de servicio,
**para** iniciar el proceso de onboarding y eventualmente aceptar viajes.

**Criterios de aceptación:**
- [ ] Un usuario autenticado puede registrarse como conductor enviando `licenseNumber`, `licenseExpiry` y `serviceModes`
- [ ] El sistema crea un registro en `drivers` con `status = 'pending'`
- [ ] El sistema agrega el rol `driver` en `user_roles` (idempotente si ya existe)
- [ ] Retorna 409 `DRIVER_ALREADY_REGISTERED` si el usuario ya tiene perfil de conductor
- [ ] `serviceModes` debe contener al menos un valor válido: `people`, `cargo` o `mixed`
- [ ] El campo `licenseExpiry` debe ser una fecha futura

### RF-302 — Consultar y actualizar perfil del conductor

**Como** conductor registrado,
**quiero** consultar mi perfil y actualizarlo,
**para** mantener mis datos al día.

**Criterios de aceptación:**
- [ ] `GET /drivers/me` retorna el DriverDTO completo incluyendo status, serviceModes, rating y totalTrips
- [ ] `PATCH /drivers/me` permite actualizar `licenseNumber`, `licenseExpiry` y `serviceModes`
- [ ] No se puede actualizar `status`, `online`, `rating` ni `totalTrips` desde este endpoint
- [ ] Retorna 404 `DRIVER_NOT_FOUND` si el usuario no tiene perfil de conductor
- [ ] Cambios se registran en `audit_logs` (R-DATA-002)

### RF-303 — Gestión de documentos

**Como** conductor en proceso de onboarding,
**quiero** ver los documentos requeridos y subir mis documentos,
**para** avanzar en el proceso de aprobación.

**Criterios de aceptación:**
- [ ] `GET /drivers/me/documents` retorna la lista de requisitos de la región del conductor, cada uno con su estado actual (`pending`, `approved`, `rejected`, `expired`, o `not_submitted`)
- [ ] `POST /drivers/me/documents` acepta `requirementId`, `fileUrl` y `expiresAt` (opcional)
- [ ] Si ya existe un documento para ese requisito, lo reemplaza (upsert)
- [ ] Cuando se sube un documento, el conductor pasa a `documents_submitted` si estaba en `pending`
- [ ] Retorna 404 `REQUIREMENT_NOT_FOUND` si el `requirementId` no existe para la región del conductor

### RF-304 — Gestión de vehículos

**Como** conductor registrado,
**quiero** registrar y consultar mis vehículos,
**para** que el sistema sepa en qué vehículo voy a operar.

**Criterios de aceptación:**
- [ ] `GET /drivers/me/vehicles` retorna todos los vehículos del conductor (no soft-deleted)
- [ ] `POST /drivers/me/vehicles` registra un nuevo vehículo con `make`, `model`, `year`, `color`, `licensePlate`
- [ ] `licensePlate` es única en toda la plataforma — retorna 409 `VEHICLE_PLATE_DUPLICATE` si ya existe
- [ ] El primer vehículo registrado queda como activo automáticamente (`active = true`)
- [ ] El vehículo nuevo inicia con `status = 'pending'`

### RF-305 — Disponibilidad: go-online / go-offline

**Como** conductor aprobado,
**quiero** activar y desactivar mi disponibilidad,
**para** recibir o dejar de recibir solicitudes de viaje.

**Criterios de aceptación:**
- [ ] `POST /drivers/me/go-online` retorna 200 y pone `drivers.online = true`
- [ ] Retorna 403 `DRIVER_NOT_APPROVED` si `drivers.status !== 'approved'` (R-DRV-001)
- [ ] Retorna 403 `DOCUMENTS_EXPIRED` si algún documento requerido está expirado (R-DRV-001)
- [ ] Retorna 403 `NO_ACTIVE_VEHICLE` si el conductor no tiene vehículo activo
- [ ] `POST /drivers/me/go-offline` retorna 200 y pone `drivers.online = false`
- [ ] go-offline funciona siempre independientemente del estado del conductor
- [ ] Ambas operaciones registran en `audit_logs` (R-DATA-002)

### RF-306 — Actualización de ubicación GPS

**Como** conductor online,
**quiero** enviar mi ubicación GPS al servidor,
**para** que el sistema pueda mostrarla a los pasajeros.

**Criterios de aceptación:**
- [ ] `PATCH /drivers/me/location` acepta `latitude` y `longitude` (decimales)
- [ ] Guarda en Redis: `driver:{id}:location` (HSET con TTL 5 min)
- [ ] Retorna 403 `DRIVER_OFFLINE` si `drivers.online = false`
- [ ] Rate limit: 1000 req/hora por conductor (ADR-002)
- [ ] No persiste en TimescaleDB en este sprint

### RF-307 — Revisión de documentos por admin

**Como** administrador,
**quiero** revisar y aprobar o rechazar los documentos de un conductor,
**para** controlar quién puede operar en la plataforma.

**Criterios de aceptación:**
- [ ] `PATCH /admin/documents/:documentId` acepta `status` (`approved` | `rejected`) y `rejectionReason` (requerido si `rejected`)
- [ ] Solo usuarios con rol `admin` pueden llamar este endpoint (retorna 403 `FORBIDDEN` si no)
- [ ] Registra `reviewedAt` y `reviewedBy` en `driver_documents`
- [ ] Tras aprobación: si TODOS los documentos requeridos están `approved`, el sistema cambia `drivers.status` a `approved` automáticamente (R-DRV-003)
- [ ] El cambio de status a `approved` se registra en `audit_logs`
- [ ] Retorna 404 `DOCUMENT_NOT_FOUND` si el documento no existe

---

## Requerimientos no funcionales

| NFR | Valor |
|---|---|
| Latencia `PATCH /drivers/me/location` | < 50ms (escritura solo en Redis) |
| Rate limit location | 1000 req/hora por driver (ADR-002) |
| Cobertura de tests | ≥ 75% líneas en módulo drivers |
| Audit log | 100% de operaciones de escritura en entidades de negocio |
| Validación de schema | Zod en todas las rutas (fail-fast) |

---

## Restricciones técnicas inamovibles

- Stack inamovible: Fastify 4 + Knex 3 + PostgreSQL + Redis (steering/architecture.md)
- Patrón: `routes → controller → service → repository` — sin lógica en controller
- Soft delete en `vehicles.deleted_at` — nunca `DELETE`
- `audit_logs` para todo cambio de entidad de negocio (R-DATA-002)
- UUID como PK en todas las tablas (R-DATA-004)
- Timestamps TIMESTAMPTZ en UTC (R-DATA-005)
- TypeScript strict — sin `any`

---

## Decisiones pendientes (no bloquean Sprint 3)

| Decisión | Impacto | Sprint |
|---|---|---|
| ¿Proceso de verificación de documentos es manual o con servicio externo (INE API, etc.)? | Flujo admin Sprint 6 | Antes de Sprint 6 |
| ¿Qué documentos se requieren para modo `cargo`? | Seed document_requirements | Antes de Sprint 6 |
| ¿Radio inicial de búsqueda de conductores? | Matching Sprint 4 | Antes de Sprint 4 |
| ¿Un conductor puede tener múltiples vehículos activos? | Hoy: solo uno | Antes de Sprint 4 |
