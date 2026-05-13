# Snapshot — Admin

**Estado:** ✅ Sprint 17 completo (2026-05-07) — AprobacionesPage + flujo PENDING_APPROVAL + endpoint paginado
**Última actualización:** 2026-05-07

## Módulos implementados

### AdminService (`apps/api/src/modules/admin/`)
- `admin.middleware.ts` — adminOnly (verifica rol 'admin' en JWT)
- `admin.repository.ts` — getStats, getTrips, getDrivers, getErrors, resolveError, getUsers, searchUserByPhone, updateDriverStatus
- `admin.service.ts` — delegación a repository + BusinessErrors
- `admin.controller.ts` — handlers REST
- `admin.routes.ts` — GET /admin/stats|trips|drivers|errors|users|users/search, PATCH /admin/errors/:id/resolve, PATCH /admin/drivers/:id/status

### AdminConfigService
- `admin-config.repository.ts` — getFactors/updateFactor, getCommissions/updateCommission, getTripTypes/updateTripType
- `admin-config.service.ts` — validaciones + audit log
- `admin-config.controller.ts` — handlers REST
- `admin-config.routes.ts` — GET/PATCH /admin/pricing/factors|commissions|trip-types

## Endpoints

| Método | Path | Auth | Descripción |
|---|---|---|---|
| GET | /admin/stats | admin | Métricas operacionales |
| GET | /admin/trips | admin | Lista paginada de viajes |
| GET | /admin/drivers | admin | Lista paginada de conductores |
| PATCH | /admin/drivers/:id/status | admin | Suspender/activar conductor |
| GET | /admin/users | admin | Lista paginada de usuarios |
| GET | /admin/users/search?phone= | admin | Buscar usuario por teléfono |
| GET | /admin/errors | admin | Errores operacionales |
| PATCH | /admin/errors/:id/resolve | admin | Resolver error |
| GET | /admin/pricing/factors | admin | Listar pricing factors |
| PATCH | /admin/pricing/factors/:id | admin | Actualizar factor |
| GET | /admin/commissions | admin | Listar comisiones |
| PATCH | /admin/commissions/:id | admin | Actualizar comisión |
| GET | /admin/trip-types | admin | Listar tipos de viaje |
| PATCH | /admin/trip-types/:id | admin | Actualizar tarifas |
| GET | /admin/trips/pending-approval | admin | Lista paginada de viajes PENDING_APPROVAL |

## Dashboard Web (`apps/web/`) — Sprint 11 Backoffice v2

### Layout
- `AdminLayout.tsx` — layout shell con Sidebar + Header (TanStack Router Outlet)
- `Sidebar.tsx` — collapsible, 7 nav items, pathname activo con `useRouterState()`
- `Header.tsx` — badge de vertical (useVerticalConfig) + logout

### UI Primitives (`src/components/ui/`)
- `Badge.tsx` — 5 variantes (green|red|yellow|blue|gray)
- `Table<T>` — columnas tipadas, loading skeleton, onRowClick
- `Modal.tsx` — ReactDOM.createPortal + ESC listener + tamaños sm/md/lg
- `Pagination.tsx` — Prev/Next + total count
- `SearchInput.tsx` — debounce 300ms
- `ConfirmDialog.tsx` — wraps Modal, prop `danger` para botón rojo

### Hooks
- `useVerticalConfig.ts` — TanStack Query, staleTime 5 min, GET /config

### Páginas
- `/admin` → DashboardPage (sin header standalone)
- `/admin/trips` → TripsPage (paginación + filtro status + modal detalle + metadata JSON)
  - **Sprint 15:** tab bar condicional (Detalle | Temperatura | Custodia)
  - Tab Temperatura: LineChart Recharts + 4 summary cards (min/max/avg/out_of_range) + reference lines setpoints
  - Tab Custodia: timeline vertical con evento tipo + sequence + photo link
  - Queries lazy con `enabled: !!selectedTrip` — solo cargan al abrir modal
- `/admin/drivers` → DriversPage (tabla + suspend via PATCH /admin/drivers/:id/status + ConfirmDialog)
- `/admin/users` → UsersPage (tabla con company_name + modal detalle)
- `/admin/companies` → CompaniesPage (tabla vertical badge + nueva empresa modal auto-slug)
- `/admin/companies/$id` → CompanyDetailPage (3 tabs: info / users / configs)
  - Users tab: buscar por phone GET /admin/users/search + vincular POST /admin/companies/:id/users
  - Configs tab: GET/PUT/DELETE /config/entity/company/:id/:ns/:key
- `/admin/verticals` → VerticalesPage (cards con feature chips ✓/○)
  - **Sprint 15:** botón "Editar" por tarjeta → modal con name/description + toggles features + select pricingModel
  - PATCH /admin/verticals/:id + queryClient.invalidateQueries + error inline sin cerrar modal
- `/admin/aprobaciones` → AprobacionesPage (**Sprint 17**)
  - Tabla de viajes PENDING_APPROVAL con empresa, pasajero, valor declarado
  - Botones Aprobar / Rechazar (con modal de razón) → POST /trips/:id/approve|reject
  - `usePendingApprovals` hook (TanStack Query staleTime 30s)
- `/admin/config` → ConfigPage (sin header standalone)

### Routing
- TanStack Router v1 pathless layout route: `id: 'admin-layout'` sin `path`
- 8 rutas hijas de admin-layout incluyendo `/admin/companies/$id`

## Cobertura de tests
- admin.service.ts: 100% líneas / 100% branches
- admin-config.service.ts: 100% líneas / 100% branches
- Tests: admin.service.test.ts (10), admin-config.service.test.ts (16)

## Sidebar (Sprint 17)
- Badge numérico en "Aprobaciones" con count de viajes PENDING_APPROVAL
- `usePendingApprovals` actualiza el badge automáticamente (staleTime 30s)

## Playwright E2E — Sprint 15
- `vertical-editor.spec.ts` → 2 tests: editar features + validación nombre vacío
- `trip-detail-vertical.spec.ts` → 2 tests: tab Custodia + tab Temperatura
- `playwright.config.ts` → proyectos: vertical-editor + trip-detail-vertical

## Dependencias web (apps/web/package.json)
- recharts: ^2.15.4 (instalado Sprint 15)

## Errores de negocio agregados
- ADMIN_ERROR_NOT_FOUND: 404
- ADMIN_ERROR_ALREADY_RESOLVED: 409
- FACTOR_NOT_FOUND: 404
- COMMISSION_NOT_FOUND: 404
- TRIP_TYPE_NOT_FOUND: 404
- INVALID_FEE_PCT: 400

## Hotfixes 2026-04-23

### GET /admin/trips — respuesta estructurada + coordenadas numéricas

**Problema original:** la respuesta de `GET /admin/trips` devolvía los campos de origen/destino como texto plano y las coordenadas como `string` (comportamiento por defecto de PostgreSQL con campos `numeric`).

**Cambios en `admin.repository.ts`:**
- `AdminTripRow` ahora incluye `origin: { lat, lng, address }` y `destinations: Array<{ sequence, lat, lng, address }>`
- El `.map()` de `getTrips()` coerciona todos los campos numéricos con `Number()` antes de armar los objetos estructurados
- `fare_amount` también se coerciona a número si no es null

**Cambios en `apps/web/src/pages/DashboardPage.tsx`:**
- `formatCoord` acepta `string | number | null | undefined` y usa `Number()` internamente (previene `toFixed is not a function`)
- `mapTrip` coerciona `originLat`, `originLng` y los `lat`/`lng` de cada `destination` con `Number()`

**Causa raíz:** PostgreSQL/Knex devuelve columnas `numeric` como `string` en JavaScript. El frontend llamaba `.toFixed(6)` sobre esos strings → `TypeError: value.toFixed is not a function`.
