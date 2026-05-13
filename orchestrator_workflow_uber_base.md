# Workflow del Orchestrator — UBER_BASE

> Arquitectura multiagentica para plataforma de movilidad tipo UBER (MVP México)
> Patrón: Sequential + Generator + Parallel

---

## Índice

1. [Agentes del sistema](#agentes-del-sistema)
2. [Esquema de handoff](#esquema-de-handoff)
3. [Fase 1 — Planeación](#fase-1--planeación)
4. [Fase 2 — Ejecución](#fase-2--ejecución)
5. [Fase 3 — Entrega](#fase-3--entrega)
6. [Fase 4 — Retrospectiva](#fase-4--retrospectiva)
7. [Árbol de decisiones del orchestrator](#árbol-de-decisiones-del-orchestrator)
8. [Protocolo de manejo de fallos](#protocolo-de-manejo-de-fallos)
9. [Extensibilidad](#extensibilidad)

---

## Agentes del sistema

| Agente | Rol | Patrón de comunicación |
|---|---|---|
| `orchestrator` | Coordina el pipeline completo, toma decisiones por umbral o escala al humano | Central |
| `planner` | Descompone requerimientos en lenguaje natural en tareas con scope de negocio | P2P con architect |
| `architect` | Evalúa viabilidad técnica, genera ADRs, declara dependencias e irreversibilidades | P2P con planner |
| `backend` | Implementa routes → controller → service → repo + tests base | Secuencial / paralelo con mobile |
| `mobile` | Implementa pantallas React Native contra contrato del ADR | Paralelo con backend |
| `qa` | Evalúa cobertura de tests contra umbrales definidos | Bucle Generator con backend |
| `devops` | Ejecuta migraciones, CI/CD, health checks post-deploy | Secuencial al final |

---

## Esquema de handoff

Todo agente emite este JSON al terminar su tarea. El orchestrator toma decisiones basándose en `status`, `coverage` e `irreversible_flags`. El campo `self_check` es **obligatorio** — el orchestrator rechaza handoffs sin él.

```json
{
  "agent": "backend",
  "task_id": "TRIPS-001",
  "task_type": "FEATURE | QA_ONLY | HOTFIX | MIGRATION",
  "phase": "implementation | qa | deploy",
  "status": "completed | failed | blocked | waiting_dependency | partial",

  "waiting_for": {
    "agent": "backend",
    "artifact": "POST /trips endpoint",
    "task_id": "TRIPS-001"
  },

  "unblocks": ["mobile/TRIPS-002"],

  "artifacts": ["src/trips/...", "tests/trips/..."],

  "coverage": {
    "TripStateMachine": 97,
    "PricingEngine": 100,
    "PaymentService": 95,
    "global": 71
  },

  "self_check": {
    "tests_run": true,
    "tests_passed": false,
    "details": "3 tests fallan en edge case de cancelación durante MATCHING"
  },

  "irreversible_flags": ["pricing_snapshot"],

  "unplanned_dependency": {
    "requires": "payments/refund endpoint",
    "impact": "Trips no puede completar el flujo de cancelación sin esto"
  },

  "notes": "SELECT FOR UPDATE implementado en todas las transiciones de estado",
  "next_agent": "qa"
}
```

**Campos opcionales:** `waiting_for`, `unblocks`, `irreversible_flags`, `unplanned_dependency` — se omiten cuando no aplican.

### Estados del campo `status`

| Estado | Descripción | Acción del orchestrator |
|---|---|---|
| `completed` | Tarea terminada y self_check pasado | Verifica irreversible_flags, despacha al siguiente agente |
| `partial` | Tarea terminada pero con gaps (ej: cobertura insuficiente) | Evalúa umbrales, inicia bucle Generator si no los supera |
| `waiting_dependency` | Bloqueado esperando artefacto de otro agente | Notifica al agente bloqueante, pausa hasta recibir `unblocks` |
| `blocked` | Bloqueado por dependencia no planeada | Human-in-the-loop inmediato |
| `failed` | Error irrecuperable | Evalúa si es reintentable; si no, human-in-the-loop |

---

## Fase 1 — Planeación

> Human-in-the-loop **siempre obligatorio** al final de esta fase. El output del planner es el contrato sobre el que trabajan todos los agentes posteriores.

### Paso 1 — Recepción del requerimiento

El `orchestrator` recibe el prompt en lenguaje natural y clasifica el tipo de tarea:

- `FEATURE` — módulo nuevo de punta a punta
- `QA_ONLY` — solo completar cobertura de un módulo existente
- `HOTFIX` — corrección urgente en producción
- `MIGRATION` — cambio de esquema de BD o datos

Inicializa el contexto del sprint e invoca a `planner` y `architect`.

### Paso 2 — Planeación colaborativa P2P

`planner` y `architect` se comunican directamente sin que el `orchestrator` intermedie cada mensaje.

**Responsabilidades de `planner`:**
- Definir el scope de negocio (qué incluye y qué NO incluye explícitamente)
- Priorizar tareas y asignar sprints
- Definir criterios de aceptación de negocio por tarea

**Responsabilidades de `architect`:**
- Evaluar viabilidad técnica de cada tarea
- Identificar dependencias entre tareas (planeadas)
- Generar ADRs con contratos de API completos (tipos + ejemplos de request/response + casos de error)
- Declarar `irreversible_flags` en cada tarea que los requiera

### Criterio de terminación del bucle P2P

La conversación entre `planner` y `architect` termina cuando **todas** las tareas del output cumplen este checklist:

```
□ Título y descripción en lenguaje natural
□ Scope definido — qué incluye y qué NO incluye explícitamente
□ Agente(s) asignado(s)
□ Dependencias declaradas (otras tareas o artefactos externos)
□ Criterio de aceptación de negocio
□ Criterio de aceptación técnico (verificable por qa)
□ Clasificación de irreversibilidad (sí/no + qué operación)
□ Sprint asignado
```

### Paso 3 — Revisión humana (siempre obligatoria)

El `orchestrator` presenta al humano:

- Lista completa de tareas con su checklist validado
- Sprints y orden de ejecución
- Grafo de dependencias entre tareas
- Tareas con `irreversible_flags` identificadas explícitamente

**Decisiones posibles:**

| Decisión | Acción del orchestrator |
|---|---|
| Aprobado | Emite tareas al pipeline de ejecución, notifica a cada agente asignado |
| Aprobado con ajustes | Regresa a `planner` y `architect` con los comentarios, reinicia el checklist |
| Rechazado | Descarta el plan, solicita nuevo requerimiento al humano |

---

## Fase 2 — Ejecución

### Paso 4 — Construcción del grafo de tareas

El `orchestrator` construye el grafo de dependencias a partir del plan aprobado. Identifica qué tareas pueden arrancar en paralelo (sin dependencias pendientes) y cuáles deben esperar. Inicializa el estado de cada tarea como `pending`.

### Paso 5 — Despacho de tareas sin dependencias

El `orchestrator` lanza en paralelo todas las tareas cuyas dependencias están satisfechas. Notifica a cada agente con:

- Su tarea específica
- El ADR con el contrato de API completo
- Los artefactos disponibles de tareas precedentes

> **Precondición crítica para la fase paralela:** el `orchestrator` no lanza `backend` y `mobile` en paralelo hasta que el ADR incluya un contrato de API completo. Un contrato incompleto produce rework mayor en la integración.

### Paso 6 — Gestión de dependencias en ejecución

Cuando el `orchestrator` recibe un handoff con `waiting_dependency`:

1. Registra el bloqueo en el estado global
2. Notifica al agente bloqueante que debe incluir `unblocks` en su handoff
3. Pausa la tarea bloqueada
4. Al recibir el handoff del bloqueante con `unblocks`, reactiva automáticamente la tarea pausada

**Dependencia no planeada (`unplanned_dependency` presente en handoff):**

El `orchestrator` pausa todo el pipeline y presenta al humano:
- Qué agente la detectó
- Qué requiere
- Impacto estimado en el sprint

El humano decide: resolver en este sprint / descope / crear nueva tarea.

### Paso 7 — Validación de handoffs

El `orchestrator` rechaza cualquier handoff que:
- Sea JSON incompleto (campos obligatorios ausentes)
- No incluya `self_check`
- Tenga `self_check.tests_run: false`

El agente debe completar su self-check antes de que el `orchestrator` acepte el handoff.

### Bucle Generator-Evaluador — QA ↔ Backend

**Umbrales de cobertura (criterio de aprobación del Evaluador):**

| Módulo | Umbral |
|---|---|
| TripStateMachine | 100% |
| PricingEngine | 100% |
| PaymentService | 95% |
| Global | 75% |

**Flujo del bucle:**

```
qa evalúa cobertura
  │
  ├── supera umbrales → aprobado → continúa a checkpoint de irreversibilidad
  │
  └── no supera umbrales → feedback estructurado a backend
        (lista de casos no cubiertos por función/branch, con prioridad)
        │
        backend genera nueva iteración
        │
        orchestrator incrementa contador (máx. 3)
        │
        iteración 3 sin aprobación → human-in-the-loop
        (reporte: qué no pudo cubrirse + posible causa = deuda técnica)
```

> Más de 3 iteraciones sin convergencia generalmente señala un problema de diseño en el código de producción (difícil de testear), no un problema de los tests.

### Paso 8 — Monitoreo continuo de progreso

Cada agente emite status periódico (no solo al terminar). El `orchestrator`:

- Detecta agentes sin progreso por más de N minutos
- Solicita status update al agente
- Si no hay respuesta: marca como bloqueado → human-in-the-loop

El estado global del pipeline es visible al humano en todo momento.

### Paso 9 — Checkpoint de irreversibilidad

Si el handoff de `qa` contiene `irreversible_flags` (`pricing_snapshot`, migraciones de BD, cambios de esquema), el `orchestrator` **pausa antes de invocar a `devops`** y presenta al humano:

- La operación irreversible específica
- El artefacto que la generó
- El impacto de no poder revertirla

El humano aprueba explícitamente antes de continuar.

---

## Fase 3 — Entrega

### Paso 10 — Deploy e infraestructura

`devops` ejecuta migraciones, actualiza variables de entorno, dispara CI/CD. Verifica health checks post-deploy. Emite handoff con artefactos de deploy y resultado de verificación.

### Paso 11 — Verificación de criterios de aceptación

El `orchestrator` verifica que la tarea cumple los criterios de aceptación técnico y de negocio definidos en planeación. Si algún criterio no se cumple, regresa a la fase de ejecución con el gap identificado.

### Paso 12 — Presentación al humano

El `orchestrator` produce un reporte de entrega:

- Tareas completadas con sus artefactos
- Cobertura final por módulo
- Deploy confirmado (o gaps si los hay)
- Operaciones irreversibles ejecutadas

El humano da el visto bueno o solicita correcciones.

---

## Fase 4 — Retrospectiva

### Paso 13 — Recolección de observaciones

Todos los agentes emiten su reporte de retrospectiva al finalizar el sprint. Estructura por observación:

```json
{
  "agent": "backend",
  "task_id": "TRIPS-001",
  "observations": [
    {
      "type": "planning_gap | scope_creep | unplanned_dependency | checklist_improvement",
      "description": "El ADR no especificó el comportamiento cuando el conductor cancela durante MATCHING",
      "impact": "Requirió 2 iteraciones adicionales con qa",
      "suggestion": "Agregar al checklist: todos los estados de cancelación deben estar explícitos en el ADR"
    }
  ]
}
```

**Tipos de observación:**

| Tipo | Descripción |
|---|---|
| `planning_gap` | Algo que debió definirse en planeación y no se definió |
| `scope_creep` | La tarea creció durante ejecución respecto al scope aprobado |
| `unplanned_dependency` | Dependencia no detectada en planeación |
| `checklist_improvement` | Sugerencia para mejorar el checklist de completitud |

### Paso 14 — Consolidación y almacenamiento

El `orchestrator`:

1. Agrupa observaciones por tipo
2. Identifica patrones repetidos entre agentes
3. Genera un diff del checklist de planeación con las mejoras sugeridas
4. Almacena el reporte como contexto para `planner` y `architect` en el siguiente sprint

### Paso 15 — Revisión humana del aprendizaje

El `orchestrator` presenta el reporte consolidado al humano. El humano decide qué mejoras al proceso se adoptan. Las aprobadas se incorporan al contexto de `planner` y `architect` para el siguiente sprint — cerrando el ciclo de aprendizaje.

---

## Árbol de decisiones del orchestrator

### Al recibir cualquier handoff

```
¿El JSON es válido y completo?
  NO → rechazar, solicitar handoff correcto al agente

¿Incluye self_check con tests_run: true?
  NO → rechazar, el agente debe ejecutar sus pruebas primero

¿Cuál es el status?
  │
  ├── completed
  │     ¿Tiene irreversible_flags?
  │       NO → despachar al siguiente agente
  │       SÍ → pausa + human-in-the-loop
  │
  ├── partial
  │     ¿La coverage supera umbrales?
  │       SÍ → aceptar y continuar
  │       NO → iniciar bucle Generator (feedback a backend)
  │
  ├── waiting_dependency
  │     ¿Es dependencia planeada?
  │       SÍ → registrar bloqueo, notificar bloqueante, pausar
  │       NO → pausa + human-in-the-loop con impacto
  │
  ├── blocked
  │     → human-in-the-loop inmediato
  │
  └── failed
        ¿Es reintentable?
          SÍ → retry con contexto del error (máx. 2 intentos)
          NO → human-in-the-loop
```

### Control del bucle Generator QA ↔ Backend

```
iter 1 o 2, falla   → feedback estructurado a backend, incrementar contador
iter 1 a 3, aprueba → salir del bucle, continuar a checkpoint de irreversibilidad
iter 3, falla       → human-in-the-loop con reporte de deuda técnica
```

### Circuit breaker por timeout

```
Agente sin status update por N minutos
  → orchestrator solicita status update

Sin respuesta al status update
  → marcar como bloqueado + human-in-the-loop con contexto de la tarea
```

---

## Protocolo de manejo de fallos

| Situación | Tipo de intervención | Acción |
|---|---|---|
| Aprobación del plan de planeación | Human-in-the-loop siempre | Presentar plan completo con checklist |
| Dependencia no planeada detectada | Human-in-the-loop siempre | Presentar impacto + opciones (resolver / descope / nueva tarea) |
| Operación irreversible antes de devops | Human-in-the-loop siempre | Presentar detalle de la operación para aprobación explícita |
| Entrega final del sprint | Human-in-the-loop siempre | Reporte de entrega con artefactos y cobertura |
| Aprobación de mejoras en retrospectiva | Human-in-the-loop siempre | Diff del checklist con mejoras sugeridas |
| QA no converge en 3 iteraciones | Human-in-the-loop siempre | Reporte de qué no pudo cubrirse y posible causa |
| Handoff inválido (sin self_check) | Decisión automática | Rechazar y solicitar corrección al agente |
| Dependencia planeada (waiting_dependency) | Decisión automática | Pausar + notificar bloqueante + reanudar con unblocks |
| Cobertura insuficiente (iter 1-2) | Decisión automática | Feedback estructurado a backend, incrementar contador |
| Agente sin progreso N minutos | Decisión automática | Solicitar status update; si no responde → human-in-the-loop |
| Tarea fallida reintentable | Decisión automática | Retry con contexto del error (máx. 2 intentos) |

---

## Extensibilidad

Para agregar un agente nuevo al sistema (ej: `ml-engineer` en la fase de ML matching):

1. El `architect` lo declara en el ADR de la tarea correspondiente como agente asignado
2. El `planner` lo incluye en el plan del sprint con su scope definido
3. El `orchestrator` lo reconoce por su nombre en el campo `agent` del handoff y lo inserta en el grafo de dependencias en el punto correcto
4. El nuevo agente implementa el mismo esquema de handoff — no se modifica ningún agente existente

El patrón no cambia entre fases del roadmap (MVP → ML matching → multi-vertical). Solo se extiende el grafo de tareas con nuevos agentes o nuevas ramas paralelas.

---

*Documento generado como parte del diseño de arquitectura multiagentica de UBER_BASE.*
*Patrón base: Sequential + Generator (QA↔Backend) + Parallel (Backend+Mobile)*
