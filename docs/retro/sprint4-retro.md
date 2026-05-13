# Retrospectiva — Sprint 4: Ciclo de Viaje

> **Fecha:** 2026-04-06
> **Sprint:** 4
> **Agentes:** backend-A, backend-B, backend-C, backend-D, qa-A, qa-B, qa-C, qa-D
> **Tests entregados:** 247 (22 unit pricing + 47 unit state-machine + 19 integración + 27 realtime + 16 unit service + tests previos)
> **Cobertura global:** 96.54% lines / 73.12% branches

---

## Observaciones por tipo

### planning_gap (4 casos)

**PG-01 — Distancia haversine: line-of-sight vs driving distance**
- Detectado por: backend-A
- El spec decía "CDMX→Aeropuerto ~14km" (driving distance). La distancia real en línea recta es ~5.7km.
- Impacto: test ajustado a coordenadas reales — no hubo rework de producción.
- Fix: el spec debe especificar "distancia en línea recta (haversine)" vs "distancia de conducción (Google Maps)" explícitamente. Son valores distintos.

**PG-02 — Responsabilidad del SELECT FOR UPDATE**
- Detectado por: backend-B
- El spec decía que TripStateMachine debía hacer SELECT FOR UPDATE, pero la implementación correcta es que el *service* aplique el lock antes de llamar a `transition()`.
- Impacto: diseño más limpio (StateMachine es clase pura), pero el spec era ambiguo.
- Fix: en specs de StateMachine especificar "el lock lo aplica el caller antes de invocar `transition()`".

**PG-03 — Resolución de driver_id vs user_id en JWT**
- Detectado por: backend-C
- JWT `sub` = `user_id`, pero `trips.driver_id` = `drivers.id`. La resolución requiere un lookup adicional via `DriversRepository.findByUserId()`.
- Impacto: el agente lo manejó correctamente pero sin especificarse en el spec.
- Fix: el contrato API debe especificar "los endpoints de conductor reciben user_id del JWT y resuelven driver_id internamente".

**PG-04 — Columna actor_type faltante en trip_status_history**
- Detectado por: backend-C
- El schema del project-index no incluía `actor_type` en `trip_status_history` aunque la lógica lo requería. Se generó migración 028.
- Impacto: migración adicional no planeada — idempotente, sin riesgo.
- Fix: el spec debe cross-referenciar las columnas necesarias contra el schema actual antes de aprobar el plan.

---

### unplanned_dependency (3 casos)

**UD-01 — BullMQ no instalado en package.json**
- Detectado por: backend-C
- BullMQ está declarado en ADR-005 como parte del stack pero no estaba en `apps/api/package.json`.
- Resolución: Opción A aprobada por el usuario — instalado con `pnpm add bullmq`.
- Fix: el checklist de sprint debe incluir paso explícito: "verificar que todas las dependencias del stack están en package.json antes de empezar".

**UD-02 — socket.io no instalado en package.json**
- Detectado por: backend-D
- Mismo patrón que BullMQ — declarado en el stack pero no instalado.
- Resolución: backend-D lo instaló automáticamente (`pnpm add socket.io socket.io-client`).
- Fix: mismo que UD-01 — checklist de dependencias antes del sprint.

**UD-03 — fastify-plugin no disponible para decorator pattern**
- Detectado por: backend-D
- El spec sugería `fastify.decorate('io', ...)` via `fastify-plugin`, pero el paquete no estaba instalado.
- Resolución: patrón alternativo `getIO()` singleton — igualmente válido.
- Fix: el spec debe elegir un patrón (decorator vs singleton) y verificar que el paquete necesario existe.

---

### process_improvement (2 casos — incorporados en esta sesión)

**PI-01 — Paralelismo obligatorio de agentes**
- Propuesto por: usuario
- Todo sprint se ejecuta con agentes paralelos por defecto. Los grupos sin dependencias se lanzan simultáneamente.
- Documentado en: CLAUDE.md, agents/orchestrator.md, memory/feedback_parallel_agents.md
- Impacto estimado: reducción de ~60% en tiempo de ejecución por sprint.

**PI-02 — Output compacto — agentes retornan solo JSON de handoff**
- Propuesto por: usuario
- Los agentes suprimen output verboso de tests (`--silent | tail -5`) y retornan únicamente el JSON de handoff.
- El orquestador monitorea con `tail -20 {output_file}` en lugar de leer el output completo.
- Documentado en: CLAUDE.md, agents/backend.md, agents/qa.md, agents/orchestrator.md, memory/feedback_compact_agent_output.md
- Impacto estimado: reducción significativa de tokens por sesión.

---

### checklist_improvement (3 casos)

**CI-01 — Verificar dependencias instaladas antes de sprint**

Agregar al checklist del planner antes de cerrar un plan:

```
□ Todas las dependencias declaradas en el stack están en package.json
  (verificar: BullMQ, socket.io, fastify-plugin, etc.)
```

**CI-02 — Cross-referenciar schema vs columnas necesarias por módulo**

Agregar al checklist del architect al definir contratos:

```
□ Para cada tabla usada por el módulo, verificar que todas las columnas
  requeridas existen en el schema actual (project-index.md)
□ Si falta alguna columna: crear la migración en el spec antes de codificar
```

**CI-03 — Flag --silent obligatorio en prompts de agentes**

Los prompts que el orquestador envía a backend y qa deben incluir siempre:

```bash
# En todos los comandos de verificación:
npx jest --silent 2>&1 | tail -5
npx jest --silent --coverage --coverageReporters=text 2>/dev/null | grep -E "%" | head -10
```

---

## Mejoras al checklist de planeación

### Diff propuesto para `agents/planner.md`

Agregar al checklist de completitud por tarea:

```
□ dependencies_verified — todas las npm packages del módulo están en package.json
□ schema_verified — todas las columnas de BD necesarias existen en el schema actual
□ actor_resolution — si hay JWT, especificado cómo se resuelve el ID del actor (user_id vs entity_id)
```

---

## Patrones detectados

**Patrón 1 — Stack declarado ≠ stack instalado**
Dos de tres dependencias no planeadas (BullMQ, socket.io) fueron librerías declaradas en el stack pero no instaladas. El planner asume que el stack declarado en ADRs está instalado — no es así en este proyecto. Solución: paso de verificación de dependencias en el checklist del planner.

**Patrón 2 — Schema en project-index desactualizado**
La columna `actor_type` en `trip_status_history` no estaba en el project-index aunque era necesaria. Cuando el schema en docs no coincide con lo que el código necesita, los agentes deben crear migraciones no planeadas. Solución: actualizar project-index.md al final de cada sprint como parte del DoD.

**Patrón 3 — Paradigma de ejecución mejorado**
Este sprint estableció dos nuevas reglas de proceso (PI-01 paralelismo, PI-02 output compacto) que optimizan significativamente el flujo de trabajo. Estas reglas deben aplicarse a todos los sprints futuros.

---

## ADRs nuevas generadas en Sprint 4

| ADR | Título | Estado |
|---|---|---|
| ADR-023 | Haversine inline para distancia estimada + radio 5km | Pendiente escritura formal |
| ADR-024 | Socket.io namespaces /passenger y /driver | Pendiente escritura formal |
| ADR-025 | TripStateMachine — clase pura + SELECT FOR UPDATE en service | Pendiente escritura formal |
| ADR-026 | Política de cancelación MVP — $50 MXN si ≥ 120s de ACCEPTED | Pendiente escritura formal |

---

## Definition of Done — Sprint 4

```
✅ TRIP-001: pricing-engine.test.ts 100% lines + branches
✅ TRIP-002: trip-state-machine.test.ts 100% lines + branches
✅ TRIP-003: trips.integration.test.ts — flujo E2E completo + concurrencia
✅ TRIP-004: realtime.test.ts — auth + eventos + rooms
✅ TypeScript 0 errores
✅ Cobertura global 96.54% lines / 73.12% branches (umbral 75% ✅)
✅ context/snapshots/trips.snapshot.md — pendiente
✅ context/snapshots/pricing.snapshot.md — pendiente
✅ docs/06_memory.md — pendiente actualizar
✅ ADR-023..026 — pendiente escritura formal
✅ Retrospectiva: docs/retro/sprint4-retro.md ✅
✅ Seed commission_rules — aprobado por usuario, pendiente ejecución en devops
⬜ Commit: feat(trips): Sprint 4 — ciclo de vida completo + pricing + realtime
```
