Vas a ejecutar el pipeline completo de team agents (4 fases) para la siguiente tarea:

**Tarea recibida:** $ARGUMENTS

Si no se proporcionaron argumentos, pregunta: "¿Qué tipo de tarea y descripción? (feature | qa | hotfix | migration) + descripción"

---

## Paso 0 — Clasificar la tarea

Lee el primer token de $ARGUMENTS para determinar el tipo:
- `feature`   → módulo nuevo de punta a punta
- `qa`        → solo completar cobertura de un módulo existente
- `hotfix`    → corrección urgente en producción
- `migration` → cambio de esquema de BD o datos

Si el tipo no está en la lista, inferirlo del contexto de la descripción.

---

## FASE 1 — Planeación

**Paso 1.1 — Preparar contexto**

Lee estos archivos en este orden:
1. `steering/product.md` — entender actores y fases
2. `docs/06_memory.md` — saber qué módulos ya están completos
3. `context/snapshots/{módulo}.snapshot.md` — estado actual del módulo (si aplica)
4. `agents/planner.md` — system prompt y checklist del planner
5. `agents/architect.md` — system prompt y responsabilidades del architect

**Paso 1.2 — Ejecutar planner**

Actúa como el agente `planner` según `agents/planner.md`:
- Descompón la tarea en tareas atómicas con task_id formato {MODULE}-{NNN}
- Para cada tarea, completa el checklist de completitud (ver agents/planner.md)
- Identifica dependencias entre tareas y qué puede correr en paralelo

**Paso 1.3 — Ejecutar architect (P2P con planner)**

Actúa ahora como `architect` según `agents/architect.md` y evalúa cada tarea del plan:
- Evalúa viabilidad técnica contra `steering/architecture.md`
- Genera el ADR necesario con contrato de API completo (endpoint + request + response + errors)
- Declara `irreversible_flags` por tarea si aplica
- Si una tarea es inviable técnicamente: regresa al rol de planner para ajustar el scope

Itera entre planner y architect hasta que **todas** las tareas pasen el checklist de completitud.

**Paso 1.4 — ⏸ PARAR — Presentar plan al usuario**

Muestra:
```
## Plan propuesto — {tipo}: {módulo}

### Tareas
| ID | Título | Agentes | Depende de | Irreversible |
|---|---|---|---|---|
| {task_id} | {título} | {agentes} | {deps} | sí/no |

### Grafo de dependencias
{diagrama ASCII}

### Tareas con operaciones irreversibles
{lista o "ninguna"}

### Orden de ejecución
- Paralelo: {task_ids que pueden correr simultáneamente}
- Secuencial: {task_ids que deben esperar}
```

Pregunta: **"¿Apruebas el plan? (sí / sí con ajustes: {comentario} / no)"**

Espera la respuesta antes de continuar.
- "sí" → continuar a Fase 2
- "sí con ajustes" → aplicar ajustes, volver al Paso 1.3
- "no" → detener y preguntar nuevo requerimiento

---

## FASE 2 — Ejecución

**Paso 2.1 — Construir grafo de tareas**

Lee `agents/handoff.md` para el esquema de handoffs.
Inicializa cada tarea del plan como `pending`.
Identifica el primer grupo de tareas sin dependencias.

**Paso 2.2 — Ejecutar agentes según el grafo**

Para cada tarea del grupo actual (sin dependencias pendientes):

Lee `agents/{agente}.md` y construye el input según la sección "Contrato de invocación".

Usa la herramienta `Agent` con el siguiente prompt para cada agente:

```
Eres el agente {nombre} del equipo UBER_BASE.
Lee tu system prompt completo en agents/{nombre}.md.
Tu tarea: {task_id} — {descripción}
ADR disponible: {contrato de API del architect}
Archivos de contexto a cargar: {lista del contrato de invocación}
Emite el handoff JSON completo al finalizar, incluyendo self_check obligatorio.
```

**Regla de paralelismo:** solo lanzar `backend` y `mobile` en paralelo si el ADR tiene contrato de API completo. Si no → lanzar backend primero, mobile cuando backend emita `unblocks`.

**Paso 2.3 — Evaluar cada handoff recibido**

Sigue el árbol de decisiones de `agents/orchestrator.md`:

```
¿El handoff tiene self_check? NO → rechazar, pedir corrección
¿self_check.tests_run es true? NO → rechazar (salvo planner/architect)

status:
  completed          → verificar irreversible_flags → siguiente agente
  partial            → iniciar bucle Generator (ver Paso 2.4)
  waiting_dependency → registrar bloqueo, continuar con otras tareas
  blocked            → ⏸ PARAR — informar al usuario
  failed             → reintentar máx 2 veces → ⏸ PARAR si sigue fallando
```

**Paso 2.4 — Bucle Generator QA ↔ Backend**

Si `qa` retorna `partial`:
1. Mostrar el feedback estructurado (gaps con location y priority)
2. Reenviar a `backend` con el feedback como contexto
3. Incrementar contador de iteración
4. Si iteración = 3 y sigue `partial` → **⏸ PARAR** y reportar al usuario:
   - Módulos con cobertura insuficiente
   - Gaps que no pudieron cubrirse
   - Posible causa: deuda técnica en diseño del código

**Paso 2.5 — ⏸ PARAR si hay `unplanned_dependency`**

Mostrar al usuario:
- Qué agente lo detectó
- Qué requiere
- Impacto estimado

Preguntar: "¿Cómo procedemos? (resolver ahora / descope / nueva tarea)"
Esperar respuesta antes de continuar.

**Paso 2.6 — ⏸ PARAR antes de devops si hay `irreversible_flags`**

Mostrar:
- La operación irreversible específica
- El artefacto que la generó
- Por qué no se puede revertir

Preguntar: **"¿Apruebas ejecutar esta operación irreversible? (sí / no)"**
Solo continuar con "sí" explícito.

---

## FASE 3 — Entrega

**Paso 3.1 — Ejecutar devops**

Solo si el usuario aprobó los irreversibles (o no había ninguno).

Usa `Agent` con el system prompt de `agents/devops.md` y el handoff de qa como contexto.

**Paso 3.2 — Verificar criterios de aceptación**

Compara los artefactos entregados contra los criterios de aceptación del plan (técnico y de negocio). Si alguno no se cumple → regresar al agente responsable con el gap.

**Paso 3.3 — ⏸ PARAR — Reporte de entrega al usuario**

```
## Entrega — {tipo}: {módulo}

### Estado: ✅ COMPLETADO | ❌ FALLIDO | ⚠️ BLOQUEADO

### Agentes ejecutados
| Agente | Estado | Notas |
|---|---|---|

### Cobertura final
| Módulo | Cobertura | Umbral | ✅/❌ |
|---|---|---|---|

### Operaciones irreversibles ejecutadas
{lista o "ninguna"}

### Archivos entregados
{lista de artifacts}

### Criterios de aceptación
- [negocio] {criterio}: ✅/❌
- [técnico] {criterio}: ✅/❌
```

Preguntar: **"¿Das el visto bueno a esta entrega? (sí / solicitar corrección: {descripción})"**

---

## FASE 4 — Retrospectiva

**Paso 4.1 — Recolectar observaciones**

Para cada agente que participó, pide (como ese agente) su reporte de retrospectiva en el formato de `agents/orchestrator.md` (tipo: planning_gap | scope_creep | unplanned_dependency | checklist_improvement).

**Paso 4.2 — Consolidar**

Agrupa por tipo, identifica patrones repetidos, genera sugerencias de mejora al checklist de planeación.

**Paso 4.3 — ⏸ PARAR — Reporte de aprendizaje**

```
## Retrospectiva — Sprint {N}

### Observaciones por tipo
**planning_gap:** {N casos}
**scope_creep:** {N casos}
**unplanned_dependency:** {N casos}

### Mejoras sugeridas al checklist de planeación
- {diff de cambios propuestos}

### Patrones detectados
- {patrón repetido si lo hay}
```

Preguntar: **"¿Qué mejoras al proceso apruebas incorporar?"**

**Paso 4.4 — Escribir los aprendizajes (SIEMPRE obligatorio — no esperar confirmación adicional)**

Una vez el humano aprueba (total o parcialmente), ejecutar sin excepción los siguientes 6 pasos:

1. **`agents/planner.md`** — agregar cada learning nuevo a la sección "Reglas aprendidas en retrospectivas" con prefijo `[Sprint N]`
2. **`docs/13_decisions_log.md`** — agregar entrada ADR por cada decisión técnica nueva que no esté documentada
3. **`context/project-index.md`** — actualizar tabla de módulos, schema de BD si hubo migraciones, tabla de ADRs, y fecha de última actualización
4. **`context/snapshots/{módulo}.snapshot.md`** — marcar estado final con cobertura real obtenida
5. **`docs/06_memory.md`** — marcar sprint como completo con checklist de entregables
6. **`context/session.md`** — actualizar próximo paso

**Regla:** El pipeline NO se cierra hasta que los 6 artefactos estén actualizados y se haya hecho commit. Si el humano aprobó parcialmente, documentar solo las mejoras aprobadas y anotar las rechazadas como "descartadas en retrospectiva Sprint N".

---

## Al finalizar todo el pipeline

Los 6 artefactos del Paso 4.4 deben estar actualizados antes de cerrar:
- `agents/planner.md` — learnings con prefijo [Sprint N]
- `docs/13_decisions_log.md` — ADRs nuevos
- `context/project-index.md` — módulos, schema, ADRs, fecha
- `context/snapshots/{módulo}.snapshot.md` — estado y cobertura final
- `docs/06_memory.md` — sprint marcado completo
- `context/session.md` — próximo paso
