# Protocolo de Handoff — Team Agents

> Referencia canónica para los contratos de entrada/salida entre agentes.
> El orchestrator rechaza cualquier handoff que no cumpla el esquema base.

---

## Esquema base (todos los agentes)

```typescript
interface Handoff {
  // Identificación
  agent:     "planner" | "architect" | "backend" | "qa" | "mobile" | "devops";
  task_id:   string;        // formato: {MODULE}-{NNN}  ej: TRIPS-001
  task_type: "FEATURE" | "QA_ONLY" | "HOTFIX" | "MIGRATION";
  phase:     "planning" | "implementation" | "qa" | "deploy" | "retrospective";

  // Estado
  status: "completed"          // terminado, self_check pasado
        | "partial"            // terminado con gaps (cobertura insuficiente)
        | "failed"             // error irrecuperable
        | "blocked"            // dependencia externa no planeada
        | "waiting_dependency";// esperando artefacto de otro agente (planeado)

  // Self-check OBLIGATORIO — el orchestrator rechaza sin este campo
  self_check: {
    tests_run:    boolean;
    tests_passed: boolean;
    details:      string;   // descripción del resultado o del fallo
  };

  // Artefactos producidos
  artifacts: string[];      // rutas de archivos creados/modificados

  // Gestión de dependencias (opcionales — omitir si no aplican)
  waiting_for?: {
    agent:    string;
    artifact: string;       // qué artefacto específico espera
    task_id:  string;
  };
  unblocks?: string[];      // task_ids que se desbloquean con este handoff

  // Irreversibilidad (opcional)
  irreversible_flags?: string[];  // "pricing_snapshot" | "db_migration" | "schema_change"

  // Dependencia no planeada (opcional — activa human-in-the-loop inmediato)
  unplanned_dependency?: {
    requires: string;
    impact:   string;
  };

  // Routing y contexto
  next_agent: AgentName | "orchestrator" | null;
  notes:      string;       // OBLIGATORIO aunque sea vacío — canal de comunicación entre agentes
}
```

---

## Estados del campo `status`

| Estado | Descripción | Acción del orchestrator |
|---|---|---|
| `completed` | Tarea terminada, self_check pasado | Verifica irreversible_flags → despacha siguiente |
| `partial` | Terminada con gaps (ej: cobertura insuficiente) | Evalúa umbrales → bucle Generator si no los supera |
| `waiting_dependency` | Bloqueado esperando artefacto planeado | Registra bloqueo, notifica bloqueante, pausa |
| `blocked` | Bloqueado por dependencia NO planeada | Human-in-the-loop inmediato |
| `failed` | Error irrecuperable | Retry (máx 2) → human-in-the-loop |

---

## Handoffs por agente

### planner → orchestrator
```json
{
  "agent": "planner",
  "task_id": "SPRINT-1-PLAN",
  "task_type": "FEATURE",
  "phase": "planning",
  "status": "completed",
  "self_check": {
    "tests_run": false,
    "tests_passed": false,
    "details": "Planner no ejecuta tests. Checklist de completitud validado al 100%.",
    "checklist_complete": true,
    "all_tasks_checked": true
  },
  "artifacts": ["docs/sprint-1-plan.md"],
  "sprint_plan": {
    "tasks": [...],
    "dependency_graph": "AUTH-001 → TRIPS-001 → TRIPS-002",
    "parallel_groups": [["AUTH-001", "INFRA-001"]],
    "irreversible_tasks": ["TRIPS-003"]
  },
  "next_agent": "orchestrator",
  "notes": "Plan listo para revisión humana. 5 tareas, 1 con operación irreversible."
}
```

### architect → backend
```json
{
  "agent": "architect",
  "task_id": "TRIPS-001",
  "task_type": "FEATURE",
  "phase": "planning",
  "status": "completed",
  "self_check": {
    "tests_run": false,
    "tests_passed": false,
    "details": "Architect no ejecuta tests. ADR-008 generada y validada."
  },
  "artifacts": ["docs/13_decisions_log.md"],
  "adr_created": "ADR-008 — SELECT FOR UPDATE en transiciones de estado",
  "api_contract": {
    "endpoint": "PATCH /trips/:id/status",
    "request": { "status": "ACCEPTED", "driver_id": "uuid" },
    "response": { "id": "uuid", "status": "ACCEPTED", "updated_at": "iso8601" },
    "errors": ["409 INVALID_TRIP_TRANSITION", "404 TRIP_NOT_FOUND", "423 TRIP_LOCKED"]
  },
  "irreversible_flags": [],
  "next_agent": "backend",
  "notes": "Contrato de API completo. Backend y mobile pueden arrancar en paralelo."
}
```

### backend → qa
```json
{
  "agent": "backend",
  "task_id": "TRIPS-001",
  "task_type": "FEATURE",
  "phase": "implementation",
  "status": "completed",
  "self_check": {
    "tests_run": true,
    "tests_passed": true,
    "details": "npm run agent:verify:quick PASS — 0 errores, 0 warnings"
  },
  "artifacts": [
    "src/modules/trips/routes.ts",
    "src/modules/trips/controller.ts",
    "src/modules/trips/service.ts",
    "src/modules/trips/repository.ts",
    "src/modules/trips/__tests__/trips.service.test.ts"
  ],
  "unblocks": ["mobile/TRIPS-002"],
  "irreversible_flags": ["pricing_snapshot"],
  "next_agent": "qa",
  "notes": "pricing_snapshot se escribe una sola vez en COMPLETED. Edge case de cancelación durante MATCHING sin cobertura — lo dejo para QA."
}
```

### qa → backend (cobertura insuficiente)
```json
{
  "agent": "qa",
  "task_id": "TRIPS-001",
  "task_type": "FEATURE",
  "phase": "qa",
  "status": "partial",
  "self_check": {
    "tests_run": true,
    "tests_passed": false,
    "details": "TripStateMachine: 87% lines, 79% branches. Umbrales no alcanzados."
  },
  "artifacts": [],
  "coverage": {
    "TripStateMachine": 87,
    "PricingEngine": 100,
    "PaymentService": 95,
    "global": 71
  },
  "feedback": {
    "iteration": 1,
    "max_iterations": 3,
    "gaps": [
      {
        "priority": "high",
        "location": "src/modules/trips/service.ts:145-162",
        "description": "Lógica de cancelación cuando status es MATCHING — branch no cubierto",
        "suggested_test": "it('should throw INVALID_TRIP_TRANSITION when cancelling during MATCHING')"
      },
      {
        "priority": "medium",
        "location": "src/modules/trips/service.ts:89",
        "description": "driver_not_found en TripService.accept() — branch false no cubierto"
      }
    ]
  },
  "next_agent": "backend",
  "notes": "2 iteraciones restantes antes de escalar al humano. Los gaps son de lógica faltante en service.ts, no de tests."
}
```

### qa → orchestrator (aprobado)
```json
{
  "agent": "qa",
  "task_id": "TRIPS-001",
  "task_type": "FEATURE",
  "phase": "qa",
  "status": "completed",
  "self_check": {
    "tests_run": true,
    "tests_passed": true,
    "details": "Todos los umbrales superados. npm run test:coverage PASS."
  },
  "artifacts": [
    "src/modules/trips/__tests__/trips.service.test.ts",
    "src/modules/trips/__tests__/trips.integration.test.ts"
  ],
  "coverage": {
    "TripStateMachine": 100,
    "PricingEngine": 100,
    "PaymentService": 95,
    "global": 78
  },
  "irreversible_flags": ["pricing_snapshot"],
  "next_agent": "orchestrator",
  "notes": "Módulo aprobado. pricing_snapshot presente — requiere aprobación antes de devops."
}
```

### devops → orchestrator
```json
{
  "agent": "devops",
  "task_id": "TRIPS-001",
  "task_type": "FEATURE",
  "phase": "deploy",
  "status": "completed",
  "self_check": {
    "tests_run": true,
    "tests_passed": true,
    "details": "Health check /health retorna 200. CI PASS. Migraciones aplicadas."
  },
  "artifacts": [
    "docker-compose.yml",
    "apps/api/Dockerfile",
    ".github/workflows/ci.yml",
    "migrations/20260404_add_trips_table.ts"
  ],
  "irreversible_flags": ["db_migration"],
  "next_agent": null,
  "notes": "Agregar STRIPE_SECRET_KEY a Railway environment variables — pendiente manual."
}
```

### mobile (waiting_dependency)
```json
{
  "agent": "mobile",
  "task_id": "TRIPS-002",
  "task_type": "FEATURE",
  "phase": "implementation",
  "status": "waiting_dependency",
  "self_check": {
    "tests_run": false,
    "tests_passed": false,
    "details": "No se puede ejecutar — endpoint requerido aún no disponible."
  },
  "artifacts": [],
  "waiting_for": {
    "agent": "backend",
    "artifact": "POST /trips endpoint",
    "task_id": "TRIPS-001"
  },
  "next_agent": "orchestrator",
  "notes": "ActiveTripScreen bloqueada hasta que backend entregue POST /trips. El resto de pantallas pueden avanzar."
}
```

---

## Reglas del protocolo

```
1. self_check es OBLIGATORIO — el orchestrator rechaza sin él.

2. self_check.tests_run debe ser true en agentes que ejecutan código
   (backend, qa, devops). Planner y architect pueden tener tests_run: false
   con justificación en details.

3. notes es OBLIGATORIO — mínimo una oración. Es el canal de contexto
   entre agentes para información que no cabe en campos estructurados.

4. irreversible_flags debe listarse en qa y devops cuando aplica.
   El orchestrator pausa el pipeline y espera aprobación humana.

5. unplanned_dependency activa human-in-the-loop inmediato — no usar
   para dependencias que podrían haberse planeado.

6. El campo prior_handoff en el input del siguiente agente debe ser
   el handoff completo — no un resumen.
```
