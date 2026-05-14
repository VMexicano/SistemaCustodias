# Session — Estado de la Sesión Actual

> Este archivo se resetea al inicio de cada sesión con /session-start
> y se actualiza al finalizar con /session-end.
> Es el único archivo que siempre se carga en contexto.

---

## Estado actual

**Sprint:** 1 en curso — Schema BD ✅ Auth extendido ✅ TenantMiddleware ✅
**Fecha último cierre:** 2026-05-14
**Tipo de tarea próxima:** [ORDERS] / [CLIENTS] — Sprint 2

---

## Logros de esta sesión (2026-05-13 → 2026-05-14)

### INFRA-000 — Entorno Docker ✅
- [x] `docker-compose.yml` renombrado `ridebase_*` → `custodias_*`
- [x] `apps/api/.env` creado con credenciales correctas para dominio custodia
- [x] 6 contenedores corriendo: `custodias_postgres` (5432), `custodias_redis` (6379), `custodias_bull_board` (3001), `custodias_grafana` (3000), `custodias_prometheus` (9090), `custodias_jaeger` (16686)

### INFRA-001 — Migraciones M-39→M-51 ✅
- [x] 13 migraciones creadas y aplicadas (51 totales en BD)
- [x] `custody_types`, `clients`, `custody_vehicles`, `operators`
- [x] `custody_orders` (17 estados CHECK + constraint crew_different)
- [x] `value_declarations`, `order_transitions` (INSERT-ONLY), `security_alerts`
- [x] `location_readings` — hypertable TimescaleDB ✅
- [x] `pricing_rules`, `custody_payments`
- [x] `companies.tenant_id` ALTER
- [x] `user_roles` CHECK con 8 roles válidos

### INFRA-002 — Seed custody_types ✅
- [x] 4 tipos con JSON Schema completo: `cash_transport`, `high_value_package`, `confidential_docs`, `vip_escort`
- [x] Seed idempotente (ON CONFLICT DO NOTHING)

### AUTH-001 — JWT extendido ✅
- [x] `JWTService`: `tenant_id?: string` en `AccessTokenPayload` y `VerifiedToken`
- [x] `authenticate.ts`: `JWTPayload` con `tenant_id?`
- [x] `AuthService.register()`: acepta `role: UserRole` (5 roles custodia + 3 legacy)
- [x] `AuthService.verifyPhone/refresh()`: resuelven `tenant_id` desde `company_users`
- [x] `UserRole` type exportado: `client | custodio | copiloto | dispatcher | supervisor | passenger | driver | admin`

### AUTH-002 — TenantMiddleware ✅
- [x] `tenant.middleware.ts`: `tenantGuard` preHandler protege `/custody`, `/orders`, `/clients`, `/operators`
- [x] Error `TENANT_REQUIRED` (403) agregado al catálogo `business-error.ts`

### Tests y calidad ✅
- [x] 36/36 tests unitarios pasando (auth.service + tenant.middleware)
- [x] TypeScript 0 errores
- [x] 6 tests nuevos para roles de custodia + tenant_id en JWT

---

## Decisiones técnicas tomadas esta sesión

| Decisión | Resultado |
|---|---|
| Naming tabla vehicles | `custody_vehicles` (no `vehicles`) — evita colisión con M-008 ride-hailing |
| tenant_id en JWT | Opcional (`?`) — null si usuario sin empresa asignada |
| TenantMiddleware scope | Solo valida presencia; cross-tenant validation en S9 con RLS |
| M-50 companies | Self-referential `tenant_id` para jerarquía futura; nullable en MVP |
| Docker naming | `custodias_*` en todos los contenedores/volúmenes/red |

---

## Próxima sesión — Sprint 2

**Objetivo:** Módulos `clients` + `operadores` — CRUD + disponibilidad de operadores

**Cargar en contexto:**
- `context/project-index.md` (siempre)
- `context/snapshots/clients.snapshot.md`
- `context/snapshots/operadores.snapshot.md`
- `steering/coding-standards.md`

**Tareas planificadas:**
```
NUEVO   src/modules/clients/        (routes + controller + service + repository)
NUEVO   src/modules/operadores/     (routes + controller + service + repository)
NUEVO   src/modules/vehicles/       (CRUD simple)
NUEVO   src/__tests__/clients/
NUEVO   src/__tests__/operadores/
```

---

## Ambiente actual

- Docker: ✅ 6 servicios corriendo
- BD: ✅ 51 migraciones aplicadas + 12 seeds
- TypeScript: ✅ 0 errores
- Tests: ✅ 36/36 unitarios (auth + middleware)
- Commit: ⬜ Pendiente (usuario interrumpió git add para documentar primero)

---

## Archivos clave creados/modificados esta sesión

| Archivo | Propósito |
|---|---|
| `docker-compose.yml` | Renombrado a custodias_* |
| `apps/api/.env` | Credenciales de desarrollo |
| `migrations/20260513_039_*` a `_051_*` | 13 migraciones dominio custodia |
| `seeds/12_custody_types.ts` | 4 tipos con JSON Schema |
| `src/modules/auth/auth.service.ts` | Register con role, tenant_id en tokens |
| `src/modules/auth/jwt.service.ts` | tenant_id en payload |
| `src/shared/middleware/authenticate.ts` | tenant_id en JWTPayload |
| `src/shared/middleware/tenant.middleware.ts` | Nuevo: TenantMiddleware |
| `src/shared/errors/business-error.ts` | TENANT_REQUIRED agregado |
| `src/__tests__/auth/auth.service.test.ts` | 8 tests nuevos |
| `src/__tests__/middleware/tenant.middleware.test.ts` | Nuevo: 8 tests |
| `context/snapshots/infra.snapshot.md` | Actualizado con Docker info |
