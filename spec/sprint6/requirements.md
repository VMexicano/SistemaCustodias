# Sprint 6 — Requirements

**Objetivo:** Implementar el scheduler de viajes programados, los endpoints de administración (estadísticas, configuración, errores operacionales) y el dashboard web admin en Vite 5 + React 19.

---

## Scope

| Incluye | Excluye |
|---|---|
| Scheduler cron (activación + recordatorios) | Reagendamiento de viajes |
| Estado SCHEDULED en TripStateMachine | Cancelación automática por inactividad |
| POST/GET/DELETE /trips/schedule | Viajes programados de conductores |
| API admin: stats, trips, drivers, errors | Export CSV, logs de auditoría |
| API admin: pricing factors, comisiones, trip-types | Crear/eliminar factors o commission_rules |
| Dashboard Next.js → Vite 5 + React 19 | WebSocket en panel (polling 30s) |
| Login admin + dashboard + config page | Gráficas históricas, dark mode |
| Tests unitarios scheduler + admin API | Playwright E2E (Sprint 7) |

---

## Actores

| Actor | Interés en Sprint 6 |
|---|---|
| Pasajero | Programar viajes con anticipación |
| Conductor | Recibir viajes programados en tiempo real |
| Administrador | Monitorear operación + ajustar pricing en caliente |

---

## Requerimientos funcionales

### RF-601 — Viajes programados (Scheduler)

**Como** pasajero, **quiero** programar un viaje para una fecha/hora futura, **para** que el sistema busque conductor automáticamente cuando llegue ese momento.

Criterios de aceptación:
- [ ] POST /trips/schedule crea un trip en estado SCHEDULED y un registro en scheduled_trips
- [ ] El scheduler detecta el viaje dentro del minuto siguiente a scheduled_for y lo transiciona a SEARCHING
- [ ] El pasajero recibe notificación 24h, 1h y 15min antes del viaje
- [ ] No se activa el mismo viaje dos veces (idempotencia via SELECT FOR UPDATE)
- [ ] GET /trips/scheduled retorna solo viajes del pasajero autenticado en estado SCHEDULED
- [ ] DELETE /trips/scheduled/:id cancela el viaje (SCHEDULED → CANCELLED)

### RF-602 — Panel admin: monitoreo

**Como** administrador, **quiero** ver el estado operacional en tiempo real, **para** detectar problemas sin acceder a la base de datos directamente.

Criterios de aceptación:
- [ ] GET /admin/stats retorna activeTrips, onlineDrivers, todayRevenueMXN, pendingErrors
- [ ] GET /admin/trips?status=&page= retorna lista paginada (20 items/página) con filtro por status
- [ ] GET /admin/drivers?status=&page= retorna lista paginada con filtro por status
- [ ] GET /admin/errors?resolved=false retorna errores operacionales pendientes
- [ ] PATCH /admin/errors/:id/resolve marca el error como resuelto con timestamp
- [ ] Todos los endpoints requieren rol 'admin' en JWT — retornan 403 si no

### RF-603 — Panel admin: configuración

**Como** administrador, **quiero** ajustar pricing factors, comisiones y tarifas sin deploys, **para** responder a condiciones del mercado en tiempo real.

Criterios de aceptación:
- [ ] PATCH /admin/pricing/factors/:id puede activar/desactivar un factor (campo active)
- [ ] PATCH /admin/pricing/factors/:id puede modificar el value del factor
- [ ] PATCH /admin/commissions/:id actualiza platform_fee_pct; el cambio aplica a nuevos viajes
- [ ] PATCH /admin/trip-types/:id actualiza base_fare, cost_per_km, cost_per_min, min_fare
- [ ] Todos los cambios quedan registrados en audit_logs

### RF-604 — Dashboard web admin

**Como** administrador, **quiero** acceder a un panel web con login y visualización de stats, **para** operar sin acceso directo a la API.

Criterios de aceptación:
- [ ] /admin/login permite autenticarse con phone + OTP (flujo existente) y guarda JWT en cookie
- [ ] /admin muestra stats (refresh cada 30s) + tabla de viajes recientes + errores pendientes
- [ ] /admin/config muestra y permite editar pricing factors, comisiones y trip types
- [ ] Rutas /admin/* redirigen a /admin/login si no hay cookie JWT válida
- [ ] La app corre en puerto 3002 con `pnpm dev` (turbo pipeline sin cambios)

---

## Requerimientos no funcionales

- El scheduler no debe bloquear el event loop — usar queries asíncronas con `await`
- Activaciones del scheduler: máx 1 viaje/minuto impacto por defecto (el cron es fire-and-forget)
- El panel admin no requiere SSR — SPA pura es suficiente (sin SEO)
- JWT del admin tiene el mismo formato que el JWT de la API existente

---

## Restricciones técnicas inamovibles

- `trips.status` es VARCHAR(30) — SCHEDULED se agrega como string, sin migración DDL
- TripStateMachine: nueva transición SCHEDULED → REQUESTED, lock via SELECT FOR UPDATE en service caller
- BullMQ: opciones de retry en `queue.add()`, no en WorkerOptions (BullMQ 5)
- Vite 5 en apps/web/ — Turborepo pipeline se mantiene sin cambios (dev/build/type-check)
- node-cron para el scheduler (ADR-029) — no BullMQ repeatable jobs

---

## Decisiones pendientes (no bloquean Sprint 6)

- ¿Notificaciones push al conductor para viajes programados usarán FCM o solo in-app? (Sprint 7)
- ¿Panel admin tendrá autenticación separada o reutiliza el mismo OTP flow? → reutiliza (decidido)
