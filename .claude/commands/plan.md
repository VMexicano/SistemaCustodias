Vas a ejecutar **solo la Fase 1 del pipeline** (Planeación) para la siguiente tarea. No implementas nada — solo produces un plan aprobado listo para ejecutar con `/team`.

**Tarea recibida:** $ARGUMENTS

Si no se proporcionaron argumentos, pregunta: "¿Qué quieres planear? (tipo + descripción)"

---

## Paso 1 — Preparar contexto

Lee en este orden:
1. `steering/product.md` — actores, flujos y fases del roadmap
2. `docs/06_memory.md` — módulos ya completos (para no duplicar trabajo)
3. `agents/planner.md` — checklist de completitud por tarea
4. `agents/architect.md` — evaluación técnica y generación de ADRs

---

## Paso 2 — Actuar como planner

Siguiendo `agents/planner.md`:
- Descompón la tarea en tareas atómicas con `task_id` formato `{MODULE}-{NNN}`
- Para cada tarea completa el checklist completo (scope_in, scope_out, agents, depends_on, acceptance_business, acceptance_technical, irreversible, sprint, task_type)
- Define qué puede correr en paralelo y qué debe ser secuencial

---

## Paso 3 — Actuar como architect (P2P con planner)

Siguiendo `agents/architect.md`:
- Evalúa viabilidad técnica de cada tarea contra `steering/architecture.md`
- Genera ADR para cada tarea nueva con contrato de API completo:
  - Endpoint + método
  - Request schema (con tipos TypeScript)
  - Response schema (con tipos TypeScript)
  - Casos de error (código HTTP + código de error interno)
- Declara `irreversible_flags` si la tarea incluye: pricing_snapshot, migraciones de BD, cambios de esquema
- Si una tarea es inviable → regresa al rol planner para ajustar scope

Itera entre planner y architect hasta que todas las tareas pasen el checklist.

---

## Paso 4 — Presentar el plan

```
## Plan propuesto — {tipo}: {módulo}
**Sprint:** {N}
**Total de tareas:** {N}

### Tareas

| ID | Título | Tipo | Agentes | Depende de | Irreversible |
|---|---|---|---|---|---|
| {task_id} | {título} | FEATURE/QA_ONLY/... | backend, qa | {deps o —} | ✅/— |

### Grafo de dependencias
{diagrama ASCII}
{task_id_A} → {task_id_B} → {task_id_C}
{task_id_D} (paralelo con A)

### Grupos de ejecución paralela
- **Grupo 1 (sin dependencias):** {task_ids}
- **Grupo 2 (esperan grupo 1):** {task_ids}

### Tareas con operaciones irreversibles ⚠️
{lista con descripción de la operación, o "ninguna"}

### Decisiones técnicas tomadas
{lista de ADRs generadas o "ninguna nueva"}
```

---

## Paso 5 — ⏸ PARAR — Aprobación del plan

Pregunta: **"¿Apruebas este plan? (sí / sí con ajustes: {comentario} / no)"**

- **"sí"** → Continúa al Paso 6
- **"sí con ajustes"** → Aplica los ajustes y vuelve al Paso 3
- **"no"** → Descarta el plan y pregunta qué cambiar del requerimiento

---

## Paso 6 — Generar documentación SDD/TDD (ADR-014)

Una vez aprobado el plan, crea los tres documentos en `spec/sprint{N}/`:

### `spec/sprint{N}/requirements.md`
Debe incluir:
- Objetivo del sprint (1 párrafo)
- Tabla de scope incluye / excluye
- Actores y stakeholders con su interés en el sprint
- Un requerimiento funcional `RF-{NNN}` por entregable principal, con formato:
  - **Como** [actor], **quiero** [qué], **para** [para qué]
  - Criterios de aceptación como checklist binario `[ ]`
- Requerimientos no funcionales relevantes al sprint
- Restricciones técnicas inamovibles aplicables
- Decisiones pendientes que NO bloquean este sprint (para sprints futuros)

### `spec/sprint{N}/design.md`
Debe incluir:
- Diagrama ASCII de la arquitectura del sistema al finalizar el sprint
- Estructura de directorios de los módulos nuevos
- Diseño detallado de cada componente clave (interfaces TypeScript, patrones, contratos)
- Contrato completo de cada endpoint nuevo (método, path, request schema, response schema, errores)
- ADRs aplicables al sprint (las ya existentes + las nuevas generadas en el Paso 3)
- Variables de entorno nuevas requeridas (si aplica)

### `spec/sprint{N}/tasks.md`
Debe incluir:
- Tabla resumen de todas las tareas con estado `🔲`
- Grafo de dependencias en ASCII
- Grupos de ejecución paralela con condición de inicio
- Por cada tarea: checklist completo del planner + specs TDD (tests a escribir) + referencias SDD
- Definition of Done del sprint completo
- Notas específicas por agente (backend, devops, qa, mobile)

Una vez creados los tres archivos, indica:
> "✅ Documentación SDD/TDD generada en `spec/sprint{N}/`. Usa `/team {descripción}` para ejecutar las fases 2, 3 y 4."

---

## Notas

- Este skill no implementa código — su output es un plan + documentación verificados por el humano
- Los docs en `spec/sprint{N}/` son el contrato de referencia para los agentes de ejecución (ADR-014)
- Si el módulo no tiene snapshot, crear uno vacío en `context/snapshots/{módulo}.snapshot.md`
- Si el plan cambia tras ajustes, actualizar los tres documentos antes de indicar que está listo
