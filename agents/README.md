# Arquitectura de Skills y Agentes — UBER_BASE

> Guía de referencia: cuándo usar cada skill, qué agente invoca, y cómo se relacionan.
> Patrón: Sequential + Generator (QA↔Backend) + Parallel (Backend+Mobile)

---

## Mapa general

```
Usuario
  │
  ├── /session-start          → orienta la sesión, carga contexto mínimo
  ├── /session-end            → cierra sesión, actualiza snapshots y memoria
  ├── /status                 → estado global del proyecto
  ├── /module {nombre}        → carga contexto de un módulo específico
  ├── /agent {agente} {tarea} → invoca un agente individual ad-hoc
  ├── /plan {tipo} {desc}     → solo Fase 1 (planeación sin ejecutar)
  │
  └── /team {tipo} {desc}     ← pipeline completo 4 fases
        │
        └── Orchestrator (agents/orchestrator.md)
              │
              ├── [Fase 1 — Planeación]
              │     ├── Agent: planner    (agents/planner.md)    ←── NUEVO
              │     └── Agent: architect  (agents/architect.md)  ←── P2P con planner
              │
              ├── [Fase 2 — Ejecución]  ←── paralelo cuando ADR completo
              │     ├── Agent: backend   (agents/backend.md)
              │     ├── Agent: mobile    (agents/mobile.md)
              │     └── Agent: qa        (agents/qa.md)  ←── bucle Generator con backend
              │
              ├── [Fase 3 — Entrega]
              │     └── Agent: devops    (agents/devops.md)
              │
              └── [Fase 4 — Retrospectiva]
                    └── Todos los agentes emiten observaciones
```

---

## Skills disponibles en `.claude/commands/`

| Skill | Argumentos | Cuándo usar | Lo que hace |
|---|---|---|---|
| `/session-start` | — | Al inicio de cada sesión | Lee router.md, pregunta módulo y objetivo, actualiza session.md |
| `/session-end` | — | Al cerrar la sesión | Actualiza snapshots, memory y conversation-log |
| `/status` | — | Ver estado del proyecto | Tabla de módulos + sprint actual + próxima tarea |
| `/module` | `{nombre}` | Trabajar en un módulo concreto | Carga snapshot + steering + contratos del módulo |
| `/plan` | `{tipo} {descripción}` | Planear sin implementar | Solo Fase 1: planner + architect P2P → plan aprobado por humano |
| `/team` | `{tipo} {descripción}` | Implementación autónoma completa | Pipeline 4 fases con human-in-the-loop en 5 puntos |
| `/agent` | `{agente} {tarea}` | Invocar un agente ad-hoc | Un solo agente, fuera del pipeline completo |

### Cuándo usar cada skill

```
¿Solo quieres ver el estado?
  → /status

¿Vas a trabajar tú directamente con ayuda de Claude?
  → /session-start  →  /module {nombre}

¿Quieres planear un sprint sin comprometerte a ejecutarlo?
  → /plan {tipo} {descripción}

¿Quieres que los agentes ejecuten una tarea completa de forma autónoma?
  → /team {tipo} {descripción}
  Tipos: feature | qa | hotfix | migration

¿Necesitas un agente específico para algo puntual?
  → /agent {nombre-agente} {tarea}
  Agentes: architect | backend | qa | devops | mobile | planner

¿Terminaste?
  → /session-end
```

### Relación entre `/plan` y `/team`

`/plan` produce un plan aprobado guardado en `docs/sprint-N-plan.md`.
`/team` puede usar ese plan como Fase 1 ya completada y saltar a Fase 2.
Si usas `/team` sin haber planeado, ejecuta la planeación internamente.

---

## Agentes disponibles en `agents/`

| Agente | Archivo | Responsabilidad | Fase | Invocado por |
|---|---|---|---|---|
| **orchestrator** | `orchestrator.md` | Coordina las 4 fases del pipeline | Todas | `/team` skill |
| **planner** | `planner.md` | Descompone requerimientos en tareas con scope y criterios de aceptación | Fase 1 | orchestrator (P2P con architect) |
| **architect** | `architect.md` | Viabilidad técnica, ADRs con contratos de API completos, `irreversible_flags` | Fase 1 | orchestrator (P2P con planner) |
| **backend** | `backend.md` | Implementación API (routes→controller→service→repo + tests base) | Fase 2 | orchestrator |
| **mobile** | `mobile.md` | Pantallas React Native — puede correr en paralelo con backend | Fase 2 | orchestrator |
| **qa** | `qa.md` | Cobertura de tests. Bucle Generator con backend (máx 3 iter) | Fase 2 | orchestrator |
| **devops** | `devops.md` | Docker, CI/CD, migraciones, health checks post-deploy | Fase 3 | orchestrator |

---

## Pipelines del orquestador

| Pipeline | Agentes en secuencia | Condición de éxito |
|---|---|---|
| **FEATURE** | planner + architect (P2P) → backend ∥ mobile → qa → devops | `qa.coverage.thresholds_met` y aprobación humana |
| **QA-ONLY** | qa → (bucle generator con backend si necesario) | `qa.status === "completed"` |
| **HOTFIX** | architect → backend → qa | `qa.status === "completed"` sin necesidad de devops |
| **MIGRATION** | planner + architect → devops (con aprobación humana de irreversibles) | `devops.status === "completed"` |

---

## Puntos de parada obligatorios (human-in-the-loop)

| Punto | Fase | Cuándo |
|---|---|---|
| Aprobación del plan | Fase 1 | **Siempre** — antes de ejecutar |
| Dependencia no planeada | Fase 2 | Si algún agente reporta `unplanned_dependency` |
| Operación irreversible | Fase 2→3 | Si `irreversible_flags` en handoff antes de devops |
| Entrega final | Fase 3 | **Siempre** — reporte con artefactos y cobertura |
| Aprobación de mejoras | Fase 4 | **Siempre** — diff del checklist |

---

## Esquema de handoff

Todo agente emite un handoff JSON al terminar. Ver esquema completo y ejemplos en `agents/handoff.md`.

**Campos obligatorios en todo handoff:**
`agent` · `task_id` · `task_type` · `phase` · `status` · `self_check` · `artifacts` · `next_agent` · `notes`

**Campos opcionales:** `waiting_for` · `unblocks` · `irreversible_flags` · `unplanned_dependency` · `coverage` · `feedback`

---

## Flujo de handoff entre agentes

```
planner ──────────────────────────────────────────────────────┐
              ↕ P2P                                            ↓
architect ─────────────────────────────────────────────→ backend ──→ qa ──→ devops
                                                          ↕               ↑
                                                        mobile             │
                                                          └────────────────┘
                                                                    ↑
                                                    qa → backend (NEEDS_WORK, máx 3 iter)
```

---

## Contexto que cada agente necesita

| Agente | Contexto mínimo |
|---|---|
| planner | steering/product.md + docs/06_memory.md |
| architect | steering/architecture.md + docs/13_decisions_log.md |
| backend | steering/business-rules.md + coding-standards.md + snapshot del módulo |
| qa | steering/testing-standards.md + docs/PLAN_TDD_SDD.md + snapshot |
| devops | steering/architecture.md + infra.snapshot.md + docs/12_environment_setup.md |
| mobile | docs/02_design.md + steering/architecture.md + docs/09_api_contracts.md |

---

## Cuándo NO usar `/team`

```
✗ Exploración o preguntas técnicas → hablar directamente con Claude
✗ Fixes de una línea → no necesitas un pipeline completo
✗ Cambios destructivos (DROP TABLE, force push) → siempre consultar al usuario
✗ Cuando el scope no está claro → usar /session-start primero
```

---

## Añadir un agente nuevo

1. Crear `agents/{nombre}.md` con system prompt, protocolo, reglas y **Contrato de invocación** (obligatorio)
2. Declararlo en `agents/orchestrator.md` en la fase y pipeline correspondiente
3. Agregar su contexto mínimo a `context/router.md`
4. Actualizarlo en esta tabla
