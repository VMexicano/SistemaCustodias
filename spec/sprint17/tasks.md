# Sprint 17 — Tasks: Flujo de Aprobación Multi-vertical

---

## Resumen de tareas

| ID | Título | Tipo | Agente(s) | Depende de | Irreversible | Estado |
|---|---|---|---|---|---|---|
| TRIPS-017-001 | Migración 038: approved_at + approved_by | MIGRATION | backend | — | ⚠️ sí | 🔲 |
| TRIPS-017-002 | State machine: PENDING_APPROVAL + APPROVED + dispatcher | FEATURE | backend, qa | TRIPS-017-001 | — | 🔲 |
| TRIPS-017-003 | Service + endpoints approve/reject | FEATURE | backend, qa | TRIPS-017-002 | — | 🔲 |
| TRIPS-017-004 | Seed 11: requiresApproval en custody + cold-chain | MIGRATION | backend | TRIPS-017-002 | — | 🔲 |
| TRIPS-017-005 | Mobile: feedback visual PENDING_APPROVAL / APPROVED | FEATURE | mobile | TRIPS-017-003 | — | 🔲 |
| TRIPS-017-006 | Backoffice: cola de aprobaciones + badge sidebar | FEATURE | backend, mobile | TRIPS-017-003 | — | 🔲 |

---

## Grafo de dependencias

```
TRIPS-017-001
      │
      ▼
TRIPS-017-002
      │
      ├──────────────────┐
      ▼                  ▼
TRIPS-017-003      TRIPS-017-004
      │
      ├──────────────────┐
      ▼                  ▼
TRIPS-017-005      TRIPS-017-006
```

---

## Grupos de ejecución paralela

| Grupo | Condición de inicio | Tareas |
|---|---|---|
| G1 | Sin dependencias | TRIPS-017-001 |
| G2 | G1 completado | TRIPS-017-002 |
| G3 | G2 completado | TRIPS-017-003 ∥ TRIPS-017-004 |
| G4 | G3 completado | TRIPS-017-005 ∥ TRIPS-017-006 |

---

## Detalle de tareas

---

### TRIPS-017-001 — Migración 038: approved_at + approved_by

- **Tipo:** MIGRATION
- **Agente:** backend
- **Depende de:** ninguna
- **Irreversible:** ⚠️ Sí — requiere aprobación humana antes de ejecutar en producción. Reversible con `down()` en dev/staging.

**Checklist SDD:**
- [ ] `dependencies_verified`: Knex disponible — sin deps nuevas
- [ ] `schema_verified`: `trips` existe en migration 013; `admin_users` en migration 032
- [ ] `actor_resolution`: N/A — migración de esquema

**Specs TDD — tests a escribir:**
- [ ] Test de migración: `up()` agrega `approved_at` (nullable timestamptz) y `approved_by` (nullable uuid FK → admin_users)
- [ ] Test de migración: `down()` elimina ambas columnas sin error
- [ ] Verificar que el `SELECT *` de un trip existente no falla tras la migración (columnas nullable con valor NULL)

**Implementación:**
```
apps/api/migrations/20240101000038_alter_trips_add_approval_fields.ts
```

**Referencia SDD:** `spec/sprint17/design.md` → sección "Migración 038"

---

### TRIPS-017-002 — State machine: PENDING_APPROVAL + APPROVED + actor dispatcher

- **Tipo:** FEATURE
- **Agente:** backend, qa
- **Depende de:** TRIPS-017-001
- **Irreversible:** no

**Checklist SDD:**
- [ ] `dependencies_verified`: sin deps nuevas
- [ ] `schema_verified`: `trip_status_history.actor_type` es texto libre — acepta 'dispatcher' sin migración
- [ ] `actor_resolution`: N/A — clase pura sin JWT

**Specs TDD — tests a escribir (todos en `trip-state-machine.test.ts`):**

Nuevas transiciones válidas:
- [ ] `REQUESTED → PENDING_APPROVAL` por actor `system` → OK
- [ ] `PENDING_APPROVAL → APPROVED` por actor `dispatcher` → OK
- [ ] `PENDING_APPROVAL → CANCELLED` por actor `dispatcher` → OK (sin cargo)
- [ ] `PENDING_APPROVAL → CANCELLED` por actor `passenger` → OK (sin cargo — no hay accepted_at)
- [ ] `APPROVED → SEARCHING` por actor `system` → OK
- [ ] `APPROVED → CANCELLED` por actor `dispatcher` → OK
- [ ] `APPROVED → CANCELLED` por actor `passenger` → OK

Transiciones inválidas (deben lanzar BusinessError):
- [ ] `PENDING_APPROVAL → SEARCHING` por cualquier actor → `INVALID_TRIP_TRANSITION`
- [ ] `PENDING_APPROVAL → APPROVED` por actor `passenger` → `NOT_AUTHORIZED_FOR_TRANSITION`
- [ ] `PENDING_APPROVAL → APPROVED` por actor `driver` → `NOT_AUTHORIZED_FOR_TRANSITION`
- [ ] `APPROVED → ACCEPTED` directamente → `INVALID_TRIP_TRANSITION`

Invariante taxi (regresión):
- [ ] `REQUESTED → SEARCHING` por actor `system` sigue siendo válido
- [ ] Ninguna transición existente se rompe

**Cobertura obligatoria:** 100% lines y branches en `trip-state-machine.ts`

**Archivos a modificar:**
```
apps/api/src/modules/trips/trips.types.ts
apps/api/src/modules/trips/trip-state-machine.ts
apps/api/src/__tests__/trips/trip-state-machine.test.ts
```

**Referencia SDD:** `spec/sprint17/design.md` → sección "VALID_TRANSITIONS — mapa extendido"

---

### TRIPS-017-003 — Service + endpoints approve/reject

- **Tipo:** FEATURE
- **Agente:** backend, qa
- **Depende de:** TRIPS-017-002
- **Irreversible:** no

**Checklist SDD:**
- [ ] `dependencies_verified`: BullMQ instalado (ya existe). Sin deps nuevas.
- [ ] `schema_verified`: `trips.approved_at` + `trips.approved_by` existen (migration 038). `admin_users.id` existe (migration 032).
- [ ] `actor_resolution`: `POST /trips/:id/approve` recibe JWT admin → `req.user.id` es `admin_users.id` → persiste en `approved_by`

**Specs TDD — tests a escribir:**

`trips.service` — lógica de enrutamiento:
- [ ] `createTrip` con `requiresApproval: true` (mock vertical config) → trip creado con status `PENDING_APPROVAL`
- [ ] `createTrip` con `requiresApproval: false` → trip creado con status `SEARCHING` (sin regresión)
- [ ] `approveTrip` con trip en PENDING_APPROVAL → status APPROVED, `approved_at` y `approved_by` guardados
- [ ] `approveTrip` con `assigned_driver_id` válido y online → status ACCEPTED directamente
- [ ] `approveTrip` con trip NO en PENDING_APPROVAL → lanza `INVALID_TRIP_TRANSITION`
- [ ] `rejectTrip` con trip en PENDING_APPROVAL → status CANCELLED, `cancellation_reason` guardado
- [ ] `rejectTrip` con `reason` vacío → lanza `VALIDATION_ERROR`

`trips.repository`:
- [ ] `findPendingApproval(limit, offset)` retorna solo trips con status PENDING_APPROVAL, ordenados por created_at asc
- [ ] `findPendingApproval` retorna `wait_minutes` calculado

BullMQ job `trip.promote-approved`:
- [ ] Job procesado: trip en APPROVED → transiciona a SEARCHING
- [ ] Job con trip ya en SEARCHING (idempotencia) → no lanza error, no re-transiciona

E2E smoke:
- [ ] `POST /trips` (custody) → 201 PENDING_APPROVAL → `POST /trips/:id/approve` → 200 APPROVED → BullMQ → SEARCHING

**Archivos a crear/modificar:**
```
apps/api/src/modules/trips/trips.service.ts        ← createTrip + approveTrip + rejectTrip
apps/api/src/modules/trips/trips.repository.ts     ← findPendingApproval
apps/api/src/modules/trips/trips.routes.ts         ← POST approve, POST reject
apps/api/src/modules/admin/admin.routes.ts         ← GET pending-approval
tests/e2e/smoke/approval-flow.spec.ts              ← NUEVO
```

**Referencia SDD:** `spec/sprint17/design.md` → sección "Contratos de API"

---

### TRIPS-017-004 — Seed 11: requiresApproval en custody y cold-chain

- **Tipo:** MIGRATION
- **Agente:** backend
- **Depende de:** TRIPS-017-002
- **Irreversible:** no (seed idempotente)

**Checklist SDD:**
- [ ] `dependencies_verified`: sin deps nuevas
- [ ] `schema_verified`: `verticals.features` es JSONB (migration 034) — acepta `||` operator
- [ ] `actor_resolution`: N/A

**Specs TDD:**
- [ ] Seed ejecutado dos veces → mismo resultado (idempotencia)
- [ ] `SELECT features->>'requiresApproval' FROM verticals WHERE slug = 'custody'` → `'true'`
- [ ] `SELECT features->>'requiresApproval' FROM verticals WHERE slug = 'cold-chain'` → `'true'`
- [ ] `SELECT features->>'requiresApproval' FROM verticals WHERE slug = 'taxi'` → `NULL` o `'false'`

**Orden de inserción:** no hay FK nueva — el seed solo hace UPDATE, no INSERT.

**Archivos a crear:**
```
apps/api/seeds/11_enable_approval_verticals.ts
```

**Referencia SDD:** `spec/sprint17/design.md` → sección "Seed 11"

---

### TRIPS-017-005 — Mobile: feedback visual PENDING_APPROVAL / APPROVED

- **Tipo:** FEATURE
- **Agente:** mobile
- **Depende de:** TRIPS-017-003
- **Irreversible:** no

**Checklist SDD:**
- [ ] `dependencies_verified`: sin deps nuevas
- [ ] `schema_verified`: la API retorna `status` como string — no hay contrato roto
- [ ] `actor_resolution`: N/A

**Specs TDD — tests a escribir (en `ActiveTripScreen.test.tsx` o similar):**
- [ ] Render con `trip.status = 'PENDING_APPROVAL'` → muestra texto "Tu solicitud está en revisión"
- [ ] Render con `trip.status = 'PENDING_APPROVAL'` → NO muestra mapa ni info del conductor
- [ ] Render con `trip.status = 'APPROVED'` → muestra texto "Solicitud aprobada, buscando conductor"
- [ ] Render con `trip.status = 'SEARCHING'` → comportamiento existente sin regresión
- [ ] Render con `trip.status = 'ACCEPTED'` → comportamiento existente sin regresión

**Implementación:** solo agregar casos al `switch(trip.status)` existente en `ActiveTripScreen.tsx`. Sin pantallas nuevas.

**Archivos a modificar:**
```
apps/mobile-v2/src/screens/driver/ActiveTripScreen.tsx  (o la pantalla equivalente del pasajero)
```

**Referencia SDD:** `spec/sprint17/design.md` → sección "Arquitectura"

---

### TRIPS-017-006 — Backoffice: cola de aprobaciones + badge sidebar

- **Tipo:** FEATURE
- **Agente:** backend (endpoint ya en TRIPS-017-003), mobile/web
- **Depende de:** TRIPS-017-003
- **Irreversible:** no

**Checklist SDD:**
- [ ] `dependencies_verified`: TanStack Query y Router ya instalados en `apps/web`. Sin deps nuevas.
- [ ] `schema_verified`: `GET /admin/trips/pending-approval` definido en TRIPS-017-003
- [ ] `actor_resolution`: JWT admin → autorizado para ver cola y aprobar/rechazar

**Specs TDD — Playwright smoke test (`approval-flow.spec.ts`):**
- [ ] Login como admin → navegar a `/admin/approvals` → ver tabla de solicitudes pendientes
- [ ] Click "Aprobar" en una solicitud → trip desaparece de la lista
- [ ] Click "Rechazar" con motivo → trip desaparece de la lista con reason guardado
- [ ] Badge en sidebar muestra número correcto de pendientes

**Implementación:**
- `AprobacionesPage.tsx`: tabla con `origin_address`, `destination_address`, `passenger_phone`, `wait_minutes`, botones Aprobar/Rechazar
- `usePendingApprovals()`: hook TanStack Query, `staleTime: 30_000`, refetch cada 30s
- `Sidebar.tsx`: agregar ítem "Aprobaciones" con badge desde `usePendingApprovals().data?.total`
- Rutas TanStack Router: agregar `/admin/approvals`

**Archivos a crear/modificar:**
```
apps/web/src/pages/AprobacionesPage.tsx      ← NUEVO
apps/web/src/hooks/usePendingApprovals.ts    ← NUEVO
apps/web/src/components/layout/Sidebar.tsx   ← MODIFICADO (badge)
apps/web/src/router.tsx                      ← MODIFICADO (nueva ruta)
tests/e2e/smoke/approval-flow.spec.ts        ← NUEVO (compartido con backend)
```

**Referencia SDD:** `spec/sprint17/design.md` → sección "Contratos de API — GET /admin/trips/pending-approval"

---

## Definition of Done — Sprint 17

- [ ] Migración 038 ejecutada en dev sin errores (`knex migrate:latest`)
- [ ] Seed 11 ejecutado (`knex seed:run --specific=11_enable_approval_verticals.ts`)
- [ ] `trip-state-machine.test.ts`: 100% coverage (líneas y ramas)
- [ ] TypeScript: 0 errores (`npx tsc --noEmit`)
- [ ] Tests unitarios backend: todos los casos de TRIPS-017-002 y TRIPS-017-003 passing
- [ ] Smoke test E2E: `POST /trips` (custody) → PENDING_APPROVAL → approve → SEARCHING → ACCEPTED ✅
- [ ] Smoke test Playwright backoffice: cola de aprobaciones funcional ✅
- [ ] `GET /config` (custody): `features.requiresApproval: true` ✅
- [ ] `GET /config` (taxi): `features.requiresApproval` ausente o false ✅
- [ ] Mobile: ActiveTripScreen muestra estados PENDING_APPROVAL y APPROVED correctamente ✅
- [ ] ADR-047 documentado en `docs/13_decisions_log.md`

---

## Notas por agente

### backend
- En `trips.service.createTrip`: leer config desde Redis (`verticalService.getConfig()`) ya existente — no hacer query a BD
- El BullMQ job `trip.promote-approved` debe verificar `trip.status === 'APPROVED'` antes de transicionar (idempotencia)
- `findPendingApproval` debe calcular `wait_minutes` en SQL con `EXTRACT(EPOCH FROM (NOW() - created_at)) / 60`
- Patrón JSONB Knex para `features ||= '{"requiresApproval": true}'::jsonb`: usar `knex.raw("features || ?::jsonb", [JSON.stringify({requiresApproval: true})])`

### qa
- Los tests del state machine deben cubrir las transiciones inválidas (que lanzan `BusinessError`) además de las válidas
- Verificar regresión: todas las transiciones existentes de taxi siguen funcionando tras los cambios

### mobile
- Solo modificar el `switch(status)` en ActiveTripScreen — no crear pantalla nueva
- El hook de polling (`useActiveTrip`) ya existe — no hay cambio en la frecuencia de polling

### devops
- Antes de ejecutar migración 038 en staging/producción: requiere aprobación explícita (TRIPS-017-001 marcado como ⚠️ irreversible)
- `knex seed:run --specific=11_enable_approval_verticals.ts` — no correr `seed:run` global (sobreescribiría otros seeds)
