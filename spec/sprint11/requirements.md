# Sprint 11 — Requisitos: Backoffice v2

## Objetivo

Convertir el panel de administración de una herramienta mínima a una interfaz completa e intuitiva.
Al terminar este sprint, el administrador puede gestionar viajes, conductores, usuarios, empresas,
configuraciones y verticales desde una UI profesional con sidebar, tablas paginadas y acciones inline.

---

## Scope

| Incluye | Excluye |
|---|---|
| Layout shell con sidebar colapsable | Rebuild APK mobile (Sprint 12) |
| Librería de componentes compartidos (Table, Modal, Badge, Pagination, SearchInput, ConfirmDialog) | Edición de feature flags de vertical desde UI (solo lectura en Sprint 11) |
| Página Viajes: lista + filtros + detalle modal | Creación de usuarios nuevos desde backoffice |
| Página Conductores: lista + aprobar/rechazar docs + suspender | Chat o mensajería con conductores |
| Página Usuarios/Pasajeros: lista + bloquear/desbloquear | Reportes o exportación CSV |
| Página Empresas: CRUD + gestión de usuarios vinculados + configuraciones | Internacionalización (i18n) |
| Página Verticales: vista de features por vertical | Gráficas avanzadas o BI |
| Mejora de ConfigPage existente: mismo contenido, nuevo layout | |
| Mejora de DashboardPage: mismo contenido, nuevo layout + quick links | |
| Actualización de smoke tests Playwright | |
| QA: regresión completa | |

---

## Actores

| Actor | Interés en el sprint |
|---|---|
| Administrador de plataforma | Gestionar toda la operación desde una sola interfaz intuitiva |
| Supervisor de conductores | Aprobar documentos y gestionar el estado de conductores |
| Gerente de cuentas B2B | Crear y gestionar empresas y sus usuarios |

---

## Requerimientos funcionales

### RF-1101 — Layout shell y navegación
**Como** administrador,
**quiero** una barra lateral fija con acceso rápido a todas las secciones,
**para** navegar entre módulos sin perder el contexto de donde estoy.

Criterios de aceptación:
- [ ] Sidebar visible en todas las páginas autenticadas con secciones: Dashboard · Viajes · Conductores · Usuarios · Empresas · Configuración · Verticales
- [ ] Sección activa visualmente resaltada en el sidebar
- [ ] Sidebar colapsable en pantallas pequeñas
- [ ] Header muestra nombre de la app (desde `VITE_APP_NAME`) e indicador del vertical activo
- [ ] Botón de logout en el header

### RF-1102 — Gestión de viajes
**Como** administrador,
**quiero** ver todos los viajes con filtros por estado, fecha y tipo,
**para** monitorear la operación en tiempo real y resolver incidencias.

Criterios de aceptación:
- [ ] Tabla paginada (20 por página) con columnas: ID, pasajero, conductor, tipo, estado, fecha, fare
- [ ] Filtros: estado (dropdown), fecha desde/hasta (date inputs), tipo de viaje
- [ ] Click en fila abre modal con detalle completo (origen, destino, ruta, metadata, historial de estados)
- [ ] Badge de color por estado (verde=COMPLETED, rojo=CANCELLED, amarillo=IN_PROGRESS, etc.)
- [ ] Filtros persisten en la URL como query params

### RF-1103 — Gestión de conductores
**Como** supervisor,
**quiero** aprobar o rechazar documentos de conductores y gestionar su estado,
**para** controlar quién puede operar en la plataforma.

Criterios de aceptación:
- [ ] Tabla paginada con columnas: nombre, teléfono, estado onboarding, estado online, documentos pendientes
- [ ] Badge de estado por documento (aprobado/pendiente/rechazado)
- [ ] Acción inline: aprobar documento (botón en fila)
- [ ] Acción inline: rechazar documento (botón + modal con campo de razón)
- [ ] Acción inline: suspender/reactivar conductor (con ConfirmDialog)
- [ ] Filtro por estado de onboarding

### RF-1104 — Gestión de usuarios/pasajeros
**Como** administrador,
**quiero** ver y gestionar los pasajeros registrados,
**para** atender reportes y tomar acciones sobre cuentas problemáticas.

Criterios de aceptación:
- [ ] Tabla paginada con columnas: nombre, teléfono, fecha registro, empresa (si aplica), estado
- [ ] Click en fila abre modal con detalle (info básica + últimos 5 viajes)
- [ ] Acción: bloquear/desbloquear cuenta (con ConfirmDialog)

### RF-1105 — Gestión de empresas
**Como** gerente de cuentas,
**quiero** crear empresas, vincularles usuarios y ver sus configuraciones,
**para** gestionar los clientes B2B de la plataforma.

Criterios de aceptación:
- [ ] Tabla de empresas paginada con columnas: nombre, slug, vertical, usuarios, estado
- [ ] Botón "Nueva empresa" → modal con form: nombre, slug, RFC, email, teléfono, vertical
- [ ] Click en empresa → página de detalle con 3 tabs: Información · Usuarios · Configuraciones
- [ ] Tab Usuarios: lista + form para vincular usuario por teléfono con selector de rol
- [ ] Tab Configuraciones: tabla de configs agrupadas por namespace; botón "Agregar config" → modal (namespace, key, value JSON)
- [ ] Desactivar empresa: botón en detalle con ConfirmDialog

### RF-1106 — Vista de verticales
**Como** administrador,
**quiero** ver qué verticales existen y qué features tienen habilitadas,
**para** entender la configuración actual de la plataforma.

Criterios de aceptación:
- [ ] Cards por vertical mostrando nombre, slug y features como chips (✅ habilitado / ⬜ deshabilitado)
- [ ] Indicador en sidebar/header del vertical activo según `VITE_VERTICAL_SLUG`
- [ ] `VITE_VERTICAL_SLUG=taxi` en `apps/web/.env`

---

## Requerimientos no funcionales

- Tiempo de carga inicial de cualquier página ≤2s en conexión local
- Todas las tablas con paginación del lado del servidor (no cargar todos los registros)
- TypeScript strict: 0 errores en el workspace web
- Smoke tests Playwright siguen pasando tras el rediseño
- No introducir dependencias de UI pesadas (no Material UI, no Ant Design) — Tailwind CSS puro

---

## Restricciones técnicas inamovibles

- Stack web: Vite 5 + React 19 + TanStack Router + TanStack Query + Tailwind CSS
- Componentes: escritos desde cero con Tailwind — no instalar component libraries externas
- API: consumir endpoints existentes del Sprint 10 + admin endpoints ya existentes
- Auth: mantener el sistema actual (localStorage token via `auth.ts`)
