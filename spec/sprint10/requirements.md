# Sprint 10 — Requisitos: Backend Foundation Multi-vertical + Companies + Configurations

## Objetivo

Construir la capa de datos y API que convierte RideBase en una plataforma multi-propósito real.
Al terminar este sprint, el backend soporta múltiples verticales (taxi, custodia, cadena de frío),
gestión de empresas B2B y configuraciones custom por entidad — todo sin romper los módulos existentes.

---

## Scope

| Incluye | Excluye |
|---|---|
| Tabla `verticals` con feature flags JSONB | UI del backoffice (Sprint 11) |
| Tabla `companies` + `company_users` | Pantallas mobile nuevas (Sprint 12) |
| Tabla `configurations` (key-value por entidad) | Validación semántica del metadata por vertical |
| `trip_types.vertical_id` FK | Módulos específicos de custody/cold-chain |
| `trips.metadata` JSONB | Pricing diferenciado por vertical |
| Módulo API `verticals` (CRUD admin + GET /config) | Multi-tenancy completo (auth por empresa) |
| Módulo API `companies` + `configurations` | Rebuild APK mobile |
| Seed inicial: 3 verticals + empresa demo | |
| Extensión de `POST /trips` y `GET /trips/:id` con metadata | |
| QA: tests unitarios + integración módulos nuevos | |

---

## Actores

| Actor | Interés en el sprint |
|---|---|
| Administrador de plataforma | Puede crear empresas, vincular usuarios, configurar verticals desde API |
| Empresa cliente (futuro) | Sus datos quedan correctamente modelados para Sprint 11+ |
| Developer/DevOps | Base de datos sin migraciones destructivas; rollback disponible |

---

## Requerimientos funcionales

### RF-1001 — Gestión de verticals
**Como** administrador de plataforma,
**quiero** poder consultar y actualizar los feature flags de un vertical desde la API,
**para** habilitar o deshabilitar capacidades del platform sin deployar código nuevo.

Criterios de aceptación:
- [ ] `GET /config` sin auth retorna `{ slug, name, features, config }` del vertical activo según `VERTICAL_SLUG` env var
- [ ] `GET /config` retorna 400 si `VERTICAL_SLUG` no corresponde a ningún vertical en BD
- [ ] `GET /admin/verticals` con token admin retorna lista de todos los verticals
- [ ] `PATCH /admin/verticals/:slug` con token admin actualiza `features` y `config`
- [ ] `GET /config` está cacheado 60s en Redis; PATCH invalida el cache

### RF-1002 — Extensión de trip_types con vertical
**Como** administrador de plataforma,
**quiero** que cada tipo de viaje esté asociado a un vertical,
**para** poder filtrar y mostrar solo los tipos relevantes por vertical activo.

Criterios de aceptación:
- [ ] Todos los `trip_types` existentes tienen `vertical_id` apuntando al vertical `taxi`
- [ ] Un `trip_type` sin `vertical_id` sigue siendo válido (nullable — backward compatible)

### RF-1003 — Extensión de trips con metadata
**Como** desarrollador de un vertical,
**quiero** poder guardar metadata arbitraria en un viaje,
**para** almacenar campos específicos del vertical (ej: `declared_value`, `cargo_type`) sin migrar la tabla trips.

Criterios de aceptación:
- [ ] `POST /trips/estimate` acepta `metadata` opcional; lo retorna en el response
- [ ] `POST /trips` guarda `metadata` en `trips.metadata`
- [ ] `GET /trips/:id` y `GET /trips/active` incluyen `metadata` en el response
- [ ] `metadata` no especificado → `{}` por defecto

### RF-1004 — Gestión de empresas
**Como** administrador de plataforma,
**quiero** dar de alta empresas con su información fiscal y vincularlas a un vertical,
**para** separar operaciones B2B de las B2C en la plataforma.

Criterios de aceptación:
- [ ] `POST /admin/companies` crea empresa con nombre, slug único, RFC/tax_id, vertical_id, contacto
- [ ] `GET /admin/companies` lista empresas con paginación y filtro por `vertical_id`
- [ ] `GET /admin/companies/:id` retorna detalle completo
- [ ] `PATCH /admin/companies/:id` actualiza campos editables
- [ ] Desactivar empresa: `PATCH /admin/companies/:id` con `{ active: false }` — soft delete
- [ ] Un slug de empresa es único globalmente; intentar duplicar retorna 409

### RF-1005 — Usuarios de empresa
**Como** administrador de plataforma,
**quiero** vincular usuarios existentes a una empresa con un rol,
**para** modelar la estructura interna de cada cliente B2B.

Criterios de aceptación:
- [ ] `POST /admin/companies/:id/users` vincula un `user_id` existente con rol ('owner'|'admin'|'member')
- [ ] `GET /admin/companies/:id/users` lista usuarios vinculados con su rol
- [ ] `DELETE /admin/companies/:id/users/:userId` desvincula al usuario
- [ ] Un usuario no puede estar vinculado dos veces a la misma empresa (409 si se intenta)

### RF-1006 — Configuraciones custom por entidad
**Como** administrador de plataforma,
**quiero** guardar configuraciones personalizadas por empresa o usuario,
**para** que cada cliente pueda tener parámetros distintos sin modificar el código.

Criterios de aceptación:
- [ ] `PUT /config/entity/:entityType/:entityId/:namespace/:key` crea o actualiza (upsert) una configuración
- [ ] `GET /config/entity/:entityType/:entityId` retorna todas las configs de esa entidad agrupadas por namespace
- [ ] `DELETE /config/entity/:entityType/:entityId/:namespace/:key` elimina una config específica
- [ ] `entityType` acepta solo: `company`, `user`, `vertical`
- [ ] El `value` es JSONB libre — la API no valida su estructura interna

---

## Requerimientos no funcionales

- Todas las migraciones tienen `down()` implementado y probado
- Seed es idempotente — segunda ejecución sin errores
- `GET /config` responde en ≤100ms con cache Redis activo
- Cobertura módulos nuevos ≥80%; cobertura global no baja del 75%
- TripStateMachine y PricingEngine siguen en 100%

---

## Restricciones técnicas inamovibles

- Stack: Fastify 4 + Knex 3 + PostgreSQL 15 + Redis 7
- Patrón: routes → controller → service → repository
- `trips.metadata` — Zod schema: `z.record(z.unknown()).default({})`
- `configurations.value` — no tipado en backend (JSONB libre); cliente responsable
- No cambiar la firma de `TripStateMachine` ni `PricingEngine`

---

## Decisiones pendientes (no bloquean Sprint 10)

- ¿El `VERTICAL_SLUG` activo se configura solo por env var o también desde admin UI? (Sprint 11)
- ¿Los `trip_types` de custody/cold-chain se crean en seed o desde admin UI? (Sprint 12+)
- ¿La auth de empresa (login de usuario de empresa) cambia el JWT? (Sprint futuro)
