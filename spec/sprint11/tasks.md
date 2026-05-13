# Sprint 11 — Tasks: Backoffice v2

## Resumen

| ID | Título | Tipo | Agentes | Depende de | Irreversible |
|---|---|---|---|---|---|
| BACK-001 | Layout shell + componentes compartidos + rutas | FEATURE | mobile(web) | — | — |
| BACK-002 | Páginas Viajes, Conductores, Usuarios | FEATURE | mobile(web) | BACK-001 | — |
| BACK-003 | Páginas Empresas + Configuraciones | FEATURE | mobile(web) | BACK-001, Sprint10 API | — |
| BACK-004 | Página Verticales + mejoras Dashboard/Config | FEATURE | mobile(web) | BACK-001, Sprint10 API | — |
| SP11-QA-001 | QA: smoke tests Playwright + regresión web | QA_ONLY | qa | BACK-002, BACK-003, BACK-004 | — |

## Grafo de dependencias

```
BACK-001
    ├── BACK-002
    ├── BACK-003 (también necesita Sprint 10 API deployada o corriendo)
    └── BACK-004 (también necesita Sprint 10 API)
              ↓
         SP11-QA-001
```

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|---|---|---|
| G1 | BACK-001 | Sin dependencias (es puro frontend estructural) |
| G2 | BACK-002 ∥ BACK-003 ∥ BACK-004 | BACK-001 ✅ + Sprint 10 API corriendo |
| G3 | SP11-QA-001 | BACK-002 ✅ + BACK-003 ✅ + BACK-004 ✅ |

---

## Detalle de tareas

---

### BACK-001 — Layout shell + componentes compartidos + rutas

- **Tipo:** FEATURE
- **Sprint:** 11
- **Agentes:** mobile (web)
- **Depende de:** ninguna
- **Irreversible:** no

**Scope incluye:**
- `components/layout/AdminLayout.tsx`: wrapper con Sidebar + Header + `<Outlet />`
- `components/layout/Sidebar.tsx`: links a todas las secciones, ítem activo resaltado, colapsable
- `components/layout/Header.tsx`: `VITE_APP_NAME`, badge vertical activo (de `useVerticalConfig`), logout
- `components/ui/Table.tsx`: genérico con columnas, data, loading skeleton, onRowClick, emptyMessage
- `components/ui/Badge.tsx`: variantes green/red/yellow/blue/gray
- `components/ui/Modal.tsx`: portal, overlay, tamaños sm/md/lg, close on ESC
- `components/ui/Pagination.tsx`: prev/next + número de página + total
- `components/ui/SearchInput.tsx`: debounce 300ms por defecto
- `components/ui/ConfirmDialog.tsx`: título, mensaje, botón danger opcional
- `hooks/useVerticalConfig.ts`: TanStack Query → `GET /config`, staleTime 5min
- `main.tsx`: agregar 6 rutas nuevas (trips, drivers, users, companies, companies/:id, verticals), todas con requireAuth y AdminLayout
- Migrar `DashboardPage` y `ConfigPage` para usar `AdminLayout` (sin cambiar su lógica interna)
- `VITE_VERTICAL_SLUG=taxi` en `apps/web/.env`

**Scope excluye:** contenido de las páginas nuevas (BACK-002..004)

**Criterios de aceptación:**
- [ ] Sidebar visible en `/admin`, `/admin/config`, y las páginas nuevas (aunque vacías)
- [ ] Sección activa resaltada según la ruta actual
- [ ] Header muestra nombre de app y badge del vertical
- [ ] Logout funciona desde el header
- [ ] `DashboardPage` y `ConfigPage` funcionan igual que antes visualmente (solo envueltos en AdminLayout)
- [ ] Smoke test `login admin y ver dashboard` sigue pasando
- [ ] TypeScript: 0 errores

**TDD — no aplica (componentes UI puro, verificación visual)**
Smoke test existente de Playwright cubre el flujo login→dashboard.

---

### BACK-002 — Páginas Viajes, Conductores, Usuarios

- **Tipo:** FEATURE
- **Sprint:** 11
- **Agentes:** mobile (web)
- **Depende de:** BACK-001

**Scope incluye:**

**TripsPage (`/admin/trips`):**
- Tabla paginada: ID (8 chars), pasajero, conductor, tipo, estado (Badge), fecha, fare MXN
- Filtros: estado (select), tipo de viaje (select), fecha desde/hasta (date inputs)
- Filtros sincronizados con URL query params (`?status=COMPLETED&page=2`)
- Click en fila → Modal con: coords origen/destino, metadata JSON (coloreado si no vacío), historial de estados como timeline
- Datos desde `GET /admin/trips?page=&limit=&status=&trip_type_id=`

**DriversPage (`/admin/drivers`):**
- Tabla paginada: nombre, teléfono, estado onboarding (Badge), online (Sí/No), docs pendientes (count)
- Filtro: estado de onboarding
- Acción "Ver docs" → Modal con lista de documentos del conductor + botones Aprobar / Rechazar (con campo de razón en Rechazar)
- Acción "Suspender" → ConfirmDialog → `PATCH /admin/drivers/:id/status` (si el endpoint no existe, crear stub que retorna 200)
- Datos desde `GET /admin/drivers?page=&limit=&status=`

**UsersPage (`/admin/users`):**
- Tabla paginada: nombre, teléfono, fecha registro, empresa vinculada (si existe), estado (Badge activo/bloqueado)
- Click en fila → Modal: info básica + últimos 5 viajes como mini-tabla
- Acción "Bloquear/Desbloquear" → ConfirmDialog (stub si el endpoint aún no existe)
- Datos desde `GET /admin/users?page=&limit=` (si no existe el endpoint, crear stub en API o usar GET /admin/trips filtrando por pasajero)

**Scope excluye:** editar datos de usuarios/conductores, historial completo de viajes del usuario

**Criterios de aceptación:**
- [ ] TripsPage: tabla carga datos reales desde API, paginación funciona, filtro por estado filtra
- [ ] TripsPage: click en fila abre modal con detalle
- [ ] DriversPage: tabla carga datos reales, modal de documentos abre
- [ ] DriversPage: aprobar documento llama API y actualiza la UI sin reload completo
- [ ] UsersPage: tabla carga datos (puede ser básica si el endpoint no existe aún)
- [ ] TypeScript: 0 errores

**Nota sobre endpoints faltantes:**
Si `GET /admin/users` o `PATCH /admin/drivers/:id/status` no existen en el backend, el agente debe crearlos como parte de esta tarea (extensión mínima del módulo admin existente).

---

### BACK-003 — Páginas Empresas + Configuraciones

- **Tipo:** FEATURE
- **Sprint:** 11
- **Agentes:** mobile (web)
- **Depende de:** BACK-001 + Sprint 10 API (COMP-002)

**Scope incluye:**

**CompaniesPage (`/admin/companies`):**
- Tabla paginada: nombre, slug, vertical (Badge), usuarios (count), estado (Badge activo/inactivo)
- Filtro: vertical (select)
- Botón "Nueva empresa" → Modal con form: nombre*, slug* (auto-generado desde nombre), RFC, email, teléfono, selector de vertical
- Click en fila → navegar a `/admin/companies/:id`

**CompanyDetailPage (`/admin/companies/:id`):**
- Breadcrumb: Empresas / [Nombre empresa]
- 3 tabs: Información · Usuarios · Configuraciones

- **Tab Información:** campos de la empresa + botón Editar (modal) + botón Desactivar (ConfirmDialog)
- **Tab Usuarios:** tabla (nombre, teléfono, rol, fecha vinculación) + botón "Vincular usuario" (modal: buscar por teléfono → `GET /users?phone=` + selector rol) + botón Quitar (ConfirmDialog)
- **Tab Configuraciones:** tabla agrupada por namespace (namespace como header de sección, key/value como filas) + botón "Agregar config" (modal: namespace, key, value como textarea JSON) + botones Editar y Borrar por fila

**Scope excluye:** crear usuarios nuevos desde aquí, validar sintaxis JSON en el value (el campo acepta texto libre — el error 422 de la API informa al usuario)

**Criterios de aceptación:**
- [ ] CompaniesPage: tabla carga empresas reales, filtro por vertical funciona
- [ ] CompaniesPage: form "Nueva empresa" crea empresa y recarga tabla
- [ ] CompanyDetailPage: los 3 tabs funcionan con datos reales
- [ ] Tab Usuarios: vincular usuario por teléfono funciona end-to-end
- [ ] Tab Configuraciones: agregar una config → aparece en la tabla
- [ ] Tab Configuraciones: borrar una config → desaparece con ConfirmDialog
- [ ] TypeScript: 0 errores

---

### BACK-004 — Página Verticales + mejoras Dashboard + ConfigPage

- **Tipo:** FEATURE
- **Sprint:** 11
- **Agentes:** mobile (web)
- **Depende de:** BACK-001 + Sprint 10 API (VERT-003)

**Scope incluye:**

**VerticalesPage (`/admin/verticals`):**
- Cards por vertical (3 en fila): nombre, slug, features como chips (✅ activado / ⬜ desactivado)
- Badge "Activo" en el vertical que corresponde a `VITE_VERTICAL_SLUG`
- Sin edición desde UI en Sprint 11

**DashboardPage (mejoras):**
- Mantiene stats + viajes recientes + programados + errores
- Agregar quick links a las secciones (ej: "Ver todos los viajes →", "Ver conductores →")
- Indicador de vertical activo junto al título

**ConfigPage (mejoras):**
- Mantiene toda la funcionalidad actual
- Adaptado al nuevo AdminLayout (sidebar, header)
- Agregar sección colapsable "Vertical activo" que muestra nombre + slug del vertical actual

**Scope excluye:** edición de feature flags de vertical desde UI

**Criterios de aceptación:**
- [ ] VerticalesPage: cards de los 3 verticals con sus features correctas
- [ ] El vertical activo tiene badge "Activo" correcto según `VITE_VERTICAL_SLUG`
- [ ] DashboardPage: quick links funcionan (navegan a las páginas correspondientes)
- [ ] ConfigPage: sección "Vertical activo" muestra nombre correcto desde `GET /config`
- [ ] Smoke test `login admin y ver dashboard` sigue pasando tras cambios
- [ ] TypeScript: 0 errores

---

### SP11-QA-001 — QA: smoke tests + regresión web

- **Tipo:** QA_ONLY
- **Sprint:** 11
- **Agentes:** qa
- **Depende de:** BACK-002, BACK-003, BACK-004

**Scope incluye:**
- Actualizar smoke test `admin-web.spec.ts`: agregar test de navegación sidebar (dashboard → viajes → conductores → empresas)
- Nuevo smoke test `companies.spec.ts`: login → crear empresa → vincular usuario → ver configuraciones
- Verificar que los 14 smoke tests de API (auth + estimate) siguen pasando
- TypeScript check: `npx tsc --noEmit -p apps/web/tsconfig.json` → 0 errores

**Criterios de aceptación:**
- [ ] Todos los smoke tests Playwright pasan
- [ ] Navegación entre secciones en el backoffice verificada por Playwright
- [ ] TypeScript web: 0 errores
- [ ] No hay regresiones en los smoke tests de API

---

## Definition of Done — Sprint 11

- [ ] AdminLayout con sidebar funcional en todas las páginas admin
- [ ] 6 páginas nuevas implementadas con datos reales desde API
- [ ] CompanyDetailPage con los 3 tabs funcionales
- [ ] Smoke tests Playwright pasan (incluye pruebas de navegación nuevas)
- [ ] TypeScript: 0 errores en `apps/web`
- [ ] `VITE_VERTICAL_SLUG` en `.env` y documentado
- [ ] Snapshot actualizado: `context/snapshots/admin.snapshot.md`

## Notas por agente

**Mobile (web):**
- BACK-001 debe terminarse completamente antes de que arranquen BACK-002/003/004
- Para el auto-gen de slug desde nombre: `name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')`
- El Modal debe usar `ReactDOM.createPortal` para evitar problemas de z-index con el sidebar
- TanStack Query: usar `invalidateQueries` tras mutations (no `refetch` manual)
- Los filtros de TripsPage en URL: usar `useSearch()` de TanStack Router

**QA:**
- Para el smoke test de companies, crear la empresa en `beforeAll` y limpiarla en `afterAll` si es posible
- Si la empresa demo del seed ya existe, el test puede usarla directamente
