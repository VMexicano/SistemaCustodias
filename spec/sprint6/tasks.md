# Sprint 6 — Tasks: Módulo Alerts

**Sprint:** 6 — SistemaCustodias
**Fecha:** 2026-05-14

---

## Grupo 1 — Sin dependencias

### ALERTS-001 — Backend módulo alerts completo

**Tipo:** FEATURE
**Agente:** backend
**Depende de:** ninguna
**Irreversible:** no

**Checklist SDD:**
- [x] schema_verified — security_alerts: id, order_id, operator_id, alert_type (CHECK constraint), severity (CHECK), location POINT, description, resolved_by, resolved_at, created_at (M-046)
- [x] dependencies_verified — BullMQ ya instalado, Knex ya instalado
- [x] actor_resolution — JWT.sub = user_id; service hace lookup operadores WHERE user_id = userId para obtener operator_id
- [x] two_person_rule — no aplica directamente en este módulo

**Archivos a crear:**
```
apps/api/src/modules/alerts/
  alerts.types.ts
  alerts.repository.ts
  alert-engine.ts
  alerts.controller.ts
  alerts.routes.ts
```

**Archivos a modificar:**
```
apps/api/src/shared/errors/business-error.ts   ← 5 nuevos códigos
apps/api/src/workers/geofence-check.worker.ts  ← refactorizar a usar AlertEngine
apps/api/src/app.ts                            ← wiring AlertEngine + routes
```

**Definition of Done:**
- [ ] TypeScript: 0 errores
- [ ] POST /alerts retorna 409 PANIC_ALERT_TOO_SOON si panic repetido < 30s
- [ ] POST /alerts tipo panic → orden cambia a INCIDENT
- [ ] PATCH /alerts/:id/resolve retorna 403 si alerta critical y no es supervisor
- [ ] geofence-check.worker.ts usa AlertEngine (no inserta directo)
- [ ] Tests del módulo pasan

---

## Grupo 2 — Espera ALERTS-001

### ALERTS-QA-001 — Tests AlertEngine ≥ 95% cobertura

**Tipo:** QA_ONLY
**Agente:** qa
**Depende de:** ALERTS-001
**Irreversible:** no

**Archivos a crear:**
```
apps/api/src/modules/alerts/__tests__/
  alert-engine.test.ts
```

**Cobertura requerida:**
| Módulo | Umbral |
|---|---|
| AlertEngine (alert-engine.ts) | ≥ 95% lines / ≥ 90% branches |

**Casos de test obligatorios:**

createAlert:
- orden no encontrada → ORDER_NOT_FOUND
- orden en DRAFT → ORDER_NOT_ACTIVE_FOR_ALERT
- operador no asignado → OPERATOR_NOT_ASSIGNED
- panic + primera vez → inserta alerta con severity='critical' + llama reportIncident
- panic + segunda vez < 30s → PANIC_ALERT_TOO_SOON
- panic + segunda vez > 30s → OK (nueva alerta)
- tamper → severity='high', NO llama reportIncident
- geofence_violation → severity='medium'
- custom → severity='low'

resolveAlert:
- alerta no encontrada → ALERT_NOT_FOUND
- alerta ya resuelta → ALERT_ALREADY_RESOLVED
- alerta critical + no supervisor → ONLY_SUPERVISOR_CAN_RESOLVE_CRITICAL
- alerta critical + supervisor → OK, registra resolved_by + resolved_at
- alerta medium + supervisor → OK

validateOrderForAlert:
- orden en EN_ROUTE_TO_PICKUP → OK
- orden en INCIDENT → OK (puede recibir más alertas)
- orden en COMPLETED → ORDER_NOT_ACTIVE_FOR_ALERT

**Definition of Done:**
- [ ] Todos los tests pasan
- [ ] AlertEngine ≥ 95% lines / ≥ 90% branches
- [ ] TypeScript 0 errores
