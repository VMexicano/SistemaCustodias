# Sprint 6 — Tasks

## Resumen

| ID | Título | Tipo | Agente | Depende de | Estado |
|---|---|---|---|---|---|
| WEB-001 | Migrar apps/web/ a Vite 5 + React 19 | MIGRATION | devops | — | 🔲 |
| SCHED-001 | Scheduler service (cron + activación) | FEATURE | backend | — | 🔲 |
| ADMIN-001 | API admin: stats, trips, drivers, errors | FEATURE | backend | — | 🔲 |
| ADMIN-002 | API admin: configuración pricing/comisiones | FEATURE | backend | — | 🔲 |
| SCHED-002 | Endpoints REST viajes programados | FEATURE | backend, qa | SCHED-001 | 🔲 |
| ADMIN-003 | Dashboard admin (Vite + TanStack + Tailwind) | FEATURE | mobile | WEB-001, ADMIN-001, ADMIN-002 | 🔲 |
| QA-001 | Tests unitarios scheduler + admin API | QA_ONLY | qa | SCHED-002, ADMIN-001, ADMIN-002 | 🔲 |

---

## Grafo de dependencias

```
WEB-001   ─────────────────────────────────────────────────────────→ ADMIN-003
SCHED-001 ──→ SCHED-002 ──→ QA-001
ADMIN-001 ────────────────→ QA-001 ─── (paralelo) ─── ADMIN-003
ADMIN-002 ────────────────→ QA-001
```

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|---|---|---|
| G1 | WEB-001 ∥ SCHED-001 ∥ ADMIN-001 ∥ ADMIN-002 | Sin dependencias |
| G2 | SCHED-002 ∥ ADMIN-003 | G1 completo |
| G3 | QA-001 | SCHED-002 + ADMIN-001 + ADMIN-002 completos |

---

## Detalle de tareas

---

### WEB-001 — Migrar apps/web/ a Vite 5 + React 19

**Checklist SDD:**
- [ ] Eliminar Next.js 14 y dependencias (next, @types/react 18)
- [ ] Instalar: vite@5, @vitejs/plugin-react@4, react@19, react-dom@19, @types/react@19, @types/react-dom@19
- [ ] Instalar: @tanstack/react-router, @tanstack/react-query, tailwindcss
- [ ] Crear vite.config.ts (port 3002), index.html, src/main.tsx
- [ ] Actualizar tsconfig.json (eliminar Next.js types, agregar DOM)
- [ ] Actualizar apps/web/package.json scripts: dev → `vite`, build → `vite build`, type-check → `tsc --noEmit`
- [ ] Verificar que turbo pipeline `dev` y `build` siguen funcionando
- [ ] `pnpm type-check` pasa sin errores en apps/web/

**Specs TDD:** No aplica (cambio de tooling, sin lógica de negocio).

**DoD:** `pnpm dev` arranca la app en port 3002 mostrando placeholder sin errores de TS.

---

### SCHED-001 — Scheduler service

**Checklist SDD:**
- [ ] Instalar `node-cron` en apps/api/
- [ ] `SchedulerRepository`: `getDueTrips()` — trips SCHEDULED con scheduled_for <= NOW(); `getReminders()` — scheduled_trips con notif_Xh_sent=false y ventana de tiempo correcta; `markNotifSent(id, field)` con UPDATE
- [ ] `SchedulerService.tick()`: llama activateDueTrips() y sendReminders() en paralelo (Promise.all)
- [ ] `activateDueTrips()`: SELECT FOR UPDATE en scheduled_trips + trip; transiciona SCHEDULED → REQUESTED via TripsService; emite WebSocket via getIO()
- [ ] `sendReminders()`: para cada ventana (24h ± 30min, 1h ± 10min, 15m ± 5min) enqueue notification + mark sent
- [ ] TripStateMachine: agregar transiciones `SCHEDULED → REQUESTED (actor: system)` y `SCHEDULED → CANCELLED (actor: passenger)`
- [ ] Registrar scheduler en app.ts: `cron.schedule('* * * * *', () => schedulerService.tick())`
- [ ] Error handling: si tick() lanza, loguear en system_error_logs y continuar (no crashear el proceso)

**Specs TDD:**
```
scheduler.service.test.ts
  activateDueTrips()
    ✓ no hace nada si no hay viajes due
    ✓ activa un viaje due → REQUESTED
    ✓ no activa el mismo viaje dos veces (mock forUpdate)
    ✓ emite WebSocket trip_status_changed al activar
  sendReminders()
    ✓ envía notif 24h cuando está en ventana y no enviada
    ✓ envía notif 1h cuando está en ventana y no enviada
    ✓ envía notif 15m cuando está en ventana y no enviada
    ✓ no envía si ya fue enviada (notif_Xh_sent=true)
  TripStateMachine
    ✓ SCHEDULED → REQUESTED es transición válida (actor: system)
    ✓ SCHEDULED → CANCELLED es transición válida (actor: passenger)
    ✓ SCHEDULED → ACCEPTED lanza InvalidTransition
```

**DoD:** 90%+ coverage en scheduler.service. Sin efectos en pruebas del resto de módulos.

---

### ADMIN-001 — API admin: monitoreo

**Checklist SDD:**
- [ ] `AdminRepository`: `getStats()` — COUNT queries en trips (status IN active), drivers (online=true), payments (charged_at::date = today), system_error_logs (resolved_at IS NULL)
- [ ] `AdminRepository`: `getTrips(filters)` — paginado, join con users para nombres
- [ ] `AdminRepository`: `getDrivers(filters)` — paginado, join con users
- [ ] `AdminRepository`: `getErrors(resolved)` — system_error_logs filtrado
- [ ] `AdminRepository`: `resolveError(id)` — UPDATE resolved_at = NOW()
- [ ] `AdminService`: delega a repository, lanza `ADMIN_ERROR_NOT_FOUND` / `ADMIN_ERROR_ALREADY_RESOLVED`
- [ ] `adminOnly` middleware en `admin.middleware.ts`
- [ ] Rutas con `preHandler: [authenticate, adminOnly]`
- [ ] Audit log en resolveError()

**Specs TDD:**
```
admin.service.test.ts (monitoreo)
  getStats()
    ✓ retorna conteos correctos con mocks de repository
  getTrips()
    ✓ retorna primera página
    ✓ filtra por status correctamente
  resolveError()
    ✓ marca resolved_at
    ✓ lanza ADMIN_ERROR_NOT_FOUND si no existe
    ✓ lanza ADMIN_ERROR_ALREADY_RESOLVED si ya está resuelto
  adminOnly middleware
    ✓ pasa si roles includes 'admin'
    ✓ retorna 403 si no tiene rol admin
```

**DoD:** Todos los endpoints retornan 403 sin token admin. Stats query no bloquea el event loop.

---

### ADMIN-002 — API admin: configuración

**Checklist SDD:**
- [ ] `AdminRepository`: `getFactors()`, `updateFactor(id, data)`, `getCommissions()`, `updateCommission(id, data)`, `getTripTypes()`, `updateTripType(id, data)`
- [ ] `AdminService`: valida rangos (platformFeePct 0-100, valores de tarifa > 0), lanza errores de negocio apropiados
- [ ] Audit log en cada PATCH (old_value / new_value en JSONB)
- [ ] Rutas con `preHandler: [authenticate, adminOnly]`

**Specs TDD:**
```
admin.service.test.ts (configuración)
  updateFactor()
    ✓ activa un factor inactivo
    ✓ actualiza value
    ✓ lanza FACTOR_NOT_FOUND si no existe
  updateCommission()
    ✓ actualiza platform_fee_pct
    ✓ lanza INVALID_FEE_PCT si < 0 o > 100
    ✓ lanza COMMISSION_NOT_FOUND si no existe
  updateTripType()
    ✓ actualiza base_fare
    ✓ lanza TRIP_TYPE_NOT_FOUND si no existe
```

**DoD:** Cambios en pricing_factors se reflejan en el siguiente POST /trips/estimate (PricingEngine lee de BD en cada request).

---

### SCHED-002 — Endpoints REST viajes programados

**Checklist SDD:**
- [ ] `ScheduledTripsRepository`: `create(tripId, scheduledFor)`, `findByPassenger(passengerId)`, `findById(id)`, `delete(id)`
- [ ] `ScheduledTripsService`:
  - `schedule(passengerId, body)`: valida scheduledFor >= NOW+30min, verifica no hay viaje activo (R-TRIP-001), crea trip en SCHEDULED + scheduled_trips record, calcula estimatedFare via PricingEngine
  - `getScheduled(passengerId)`: lista viajes SCHEDULED del pasajero
  - `cancel(passengerId, tripId)`: valida ownership, transiciona SCHEDULED → CANCELLED
- [ ] Rutas POST/GET/DELETE con authenticate
- [ ] actor_resolution: JWT.sub = user_id → lookup en passengers para passenger_id

**Specs TDD:**
```
scheduled-trips.service.test.ts
  schedule()
    ✓ crea trip SCHEDULED + scheduled_trips record
    ✓ lanza SCHEDULED_TOO_SOON si scheduledFor < NOW+30min
    ✓ lanza PASSENGER_HAS_ACTIVE_TRIP si pasajero tiene viaje activo
  getScheduled()
    ✓ retorna solo viajes del pasajero autenticado
  cancel()
    ✓ transiciona SCHEDULED → CANCELLED
    ✓ lanza TRIP_NOT_FOUND si no existe
    ✓ lanza FORBIDDEN si no es del pasajero
    ✓ lanza TRIP_NOT_SCHEDULED si ya fue activado
```

**DoD:** POST /trips/schedule retorna 201 con scheduledFor confirmado. DELETE retorna 204.

---

### ADMIN-003 — Dashboard admin (Vite + React 19)

**Checklist SDD:**
- [ ] `lib/api.ts`: fetch wrapper con base URL desde `VITE_API_URL`, incluye Authorization header desde auth store
- [ ] `lib/auth.ts`: token en módulo variable (memoria), `isAuthenticated()`, `setToken()`, `clearToken()`
- [ ] TanStack Router: rutas `/`, `/login`, `/config` con guard — redirect a /login si no autenticado
- [ ] `LoginPage`: form phone + OTP (2 pasos: POST /auth/login → POST /auth/verify-phone), guarda token
- [ ] `DashboardPage`: useQuery stats (refetch 30s), tabla viajes (paginada), tabla errores con botón "Resolver"
- [ ] `ConfigPage`: formulario pricing factors (toggle active + input value), comisiones (input pct), trip types (inputs tarifa)
- [ ] Tailwind: layout básico sin component library (no shadcn, no MUI en Sprint 6)

**Specs TDD:** No aplica (UI — validación visual en browser). TypeScript strict debe pasar (`pnpm type-check`).

**DoD:** Login funciona contra API local. Dashboard muestra datos reales. Config actualiza y muestra confirmación.

---

### QA-001 — Tests unitarios

**Checklist:**
- [ ] Ejecutar `pnpm test --coverage` post implementación de SCHED-001, SCHED-002, ADMIN-001, ADMIN-002
- [ ] Verificar umbrales:
  - SchedulerService: ≥ 90% líneas, ≥ 85% branches
  - AdminService: ≥ 80% líneas, ≥ 75% branches
  - Global: ≥ 75% líneas, ≥ 70% branches
- [ ] Si algún umbral falla → feedback estructurado al backend con gaps específicos (archivo + línea)
- [ ] Verificar que tests de Sprint 4 (TripStateMachine) siguen al 100% tras agregar transiciones SCHEDULED

**DoD del Sprint completo:**
- [ ] WEB-001: `pnpm dev` arranca web en 3002 sin errores TS
- [ ] SCHED-001: scheduler activa viajes y envía recordatorios correctamente
- [ ] SCHED-002: 3 endpoints funcionando con autenticación
- [ ] ADMIN-001: 5 endpoints con middleware adminOnly
- [ ] ADMIN-002: 6 endpoints con audit log
- [ ] ADMIN-003: login + dashboard + config funcionales en browser
- [ ] QA-001: umbrales de cobertura cumplidos
- [ ] `pnpm run agent:verify:quick` pasa sin errores
- [ ] Commit: `feat(scheduler+admin): Sprint 6 complete`

---

## Notas por agente

**backend:** Verificar que SCHEDULED se agrega correctamente al grafo de la TripStateMachine antes de implementar SCHED-002. El actor 'system' es nuevo — agregarlo a los tipos de actor válidos.

**devops (WEB-001):** Solo cambio de tooling. No tocar apps/api/, turbo.json ni pnpm-workspace.yaml. Verificar que `turbo build` sigue funcionando después.

**mobile (ADMIN-003):** La API del scheduler usa el mismo JWT del pasajero. El admin usa el mismo JWT de la API. No crear sistemas de auth separados. Usar `VITE_API_URL` con valor default `http://localhost:3333`.

**qa:** Priorizar tests del scheduler (lógica de cron idempotente es la parte más crítica). Los tests de admin service pueden ser más simples (CRUD con mocks de repository).
