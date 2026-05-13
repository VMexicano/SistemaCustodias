# Estrategia de Memoria y Contexto para LLMs
> Este documento define QUÉ va dónde, CUÁNDO leer qué, y CÓMO mantener el sistema fresco.
> Leer antes de diseñar cualquier nueva forma de persistir información en este proyecto.

---

## El problema que resuelve este sistema

Un LLM tiene contexto efímero: cada sesión empieza desde cero. Sin un sistema de memoria bien diseñado:
- El agente repite preguntas ya resueltas
- Toma decisiones contradictorias a sesiones anteriores
- Necesita leer todo el código para entender el estado del proyecto
- Pierde decisiones de arquitectura críticas entre sesiones

**Solución:** Un sistema de 5 capas de memoria, cada una con un propósito distinto y reglas de carga claras.

---

## Las 5 capas de memoria

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA 1: Identidad del proyecto (siempre en contexto)       │
│  CLAUDE.md + context/project-index.md                       │
│  Qué: reglas del proyecto, actores, tipos, ADRs clave       │
│  Cuándo leer: siempre — carga automática                     │
│  Tamaño: < 8KB combinado                                    │
├─────────────────────────────────────────────────────────────┤
│  CAPA 2: Estado de la sesión actual                         │
│  context/session.md                                         │
│  Qué: sprint activo, qué hice, qué sigue, ambiente         │
│  Cuándo leer: siempre — carga automática                    │
│  Cuándo escribir: /session-start y /session-end              │
│  Tamaño: < 2KB                                              │
├─────────────────────────────────────────────────────────────┤
│  CAPA 3: Contexto del módulo activo (just-in-time)         │
│  context/snapshots/{módulo}.snapshot.md                     │
│  Qué: endpoints, schema, reglas, dependencias del módulo    │
│  Cuándo leer: según context/router.md — máx 2 por sesión   │
│  Cuándo escribir: al final de cada sesión que toque módulo  │
│  Tamaño: < 300 líneas por snapshot                          │
├─────────────────────────────────────────────────────────────┤
│  CAPA 4: Steering (guías de estilo y restricciones)        │
│  steering/{coding-standards,testing,architecture,product}.md│
│  Qué: cómo escribir código, cómo hacer tests, restricciones │
│  Cuándo leer: 1 archivo por sesión según router.md          │
│  Cuándo escribir: solo cuando hay una nueva decisión durable│
│  Tamaño: < 200 líneas por archivo                           │
├─────────────────────────────────────────────────────────────┤
│  CAPA 5: Memoria de alto valor (lecciones inter-sprint)    │
│  context/high-value-memory/*.md                             │
│  Qué: decisiones no-obvias, bugs recurrentes, contratos     │
│  Cuándo leer: /session-start siempre revisa README          │
│  Cuándo escribir: solo cuando algo sorprendería a un agente │
│  Tamaño: < 50 líneas por archivo (concisión obligatoria)    │
└─────────────────────────────────────────────────────────────┘
```

---

## Taxonomía: ¿Dónde va cada tipo de información?

| Tipo de información | Dónde va | Por qué NO en otro lugar |
|---|---|---|
| Reglas del proyecto, actores, tipos de custodia | `CLAUDE.md` | Carga siempre — es la identidad del proyecto |
| Schema de BD, módulos, ADRs clave, patrones | `context/project-index.md` | Carga siempre — fuente de verdad técnica |
| Estado del sprint, qué hice hoy, qué sigue | `context/session.md` | Se resetea cada sesión — no contamina memoria durable |
| Endpoints, reglas de un módulo, state machine | `context/snapshots/` | Carga just-in-time — evita saturar el contexto |
| Cómo escribir código (patrones obligatorios) | `steering/coding-standards.md` | Carga 1 vez por sesión de código |
| Estrategia de tests, thresholds | `steering/testing-standards.md` | Carga 1 vez por sesión de tests |
| Restricciones de arquitectura | `steering/architecture.md` | Carga cuando hay decisiones de sistema |
| Visión del producto, UX principles | `steering/product.md` | Carga para diseño y mobile |
| Decisión que sorprendería a un agente futuro | `context/high-value-memory/` | Memoria durable entre sprints |
| Bug que volvió a aparecer + solución | `context/high-value-memory/recurring-issues.md` | Evita repetir errores |
| Cómo dos módulos se comunican (no obvio del código) | `context/high-value-memory/integration-contracts.md` | Contrato explícito |
| Registro histórico de sesiones | `context/conversation-log.md` | Solo para retomar contexto — no se analiza activamente |
| ADR completo con pros/contras | `docs/13_decisions_log.md` | Archivo completo de referencia — rara vez se carga |

---

## Reglas de la Capa 5: High-Value Memory

### ¿Qué SUBE a high-value-memory?

```
✅ Una decisión que un agente nuevo tomaría diferente si no la conoce
✅ Un bug que apareció por segunda vez
✅ Un patrón de integración que no es obvio del código
✅ Un comando CLI que se descubrió necesario y no está en docs
✅ Una restricción de negocio que PARECE inconsistente pero tiene razón
```

### ¿Qué NO va en high-value-memory?

```
❌ Estado actual del sprint (→ session.md)
❌ Código o implementaciones (→ el código mismo)
❌ ADR completa (→ docs/13_decisions_log.md)
❌ Especificaciones de módulo (→ snapshots/)
❌ Reglas de código (→ steering/coding-standards.md)
❌ Algo que ya está en project-index.md
```

### Formato de entradas (obligatorio)

```markdown
## {Categoría}: {Título corto}
**Contexto:** {Cuándo/dónde aplica — 1 línea}
**Decisión:** {Qué se decidió o qué pasó — 1-2 líneas}
**Por qué:** {La razón no-obvia — 1 línea}
**Aplicar cuando:** {Cuándo un agente debe recordar esto — 1 línea}
```

### Límite de tamaño

Cada archivo de high-value-memory tiene máximo **50 líneas activas**.
Si un archivo supera las 50 líneas → es una señal de que algo debería estar en otro lugar.

---

## Flujo de lectura al inicio de sesión (`/session-start`)

```
1. SIEMPRE cargar (automático):
   context/project-index.md     → identidad del proyecto
   context/session.md            → estado actual

2. Revisar high-value-memory/README.md → índice de memorias activas

3. Detectar tipo de tarea → consultar context/router.md

4. Cargar según router:
   MAX 2 snapshots del módulo relevante
   MAX 1 archivo de steering

5. Si hay un issue recurrente relevante → cargar ese archivo de HVM
   (solo el archivo específico, no todos)

TOTAL de tokens de contexto de sistema: objetivo < 15KB, hard limit 30KB
```

---

## Flujo de escritura al final de sesión (`/session-end`)

```
1. Actualizar context/session.md:
   - Qué se hizo
   - Qué sigue
   - Estado del ambiente

2. Por cada módulo tocado → actualizar su snapshot:
   context/snapshots/{módulo}.snapshot.md
   Cambios: nuevos endpoints, cambios de schema, reglas descubiertas

3. Si se descubrió algo que sorprendería a un agente → escribir en HVM:
   ¿Es un bug recurrente? → recurring-issues.md
   ¿Es un contrato de integración? → integration-contracts.md
   ¿Es una decisión arquitectónica? → architecture-decisions.md
   ¿Es un comando validado? → workflows-and-commands.md

4. Si hay nueva ADR → añadir a docs/13_decisions_log.md

5. Agregar entrada a context/conversation-log.md

6. Actualizar docs/06_memory.md con estado del sprint
```

---

## Gestión de la frescura de snapshots

Un snapshot se vuelve **obsoleto** cuando:
- Se agrega un endpoint nuevo al módulo y no se documenta
- Cambia el schema de BD del módulo
- Se descubre una nueva regla de negocio
- Pasan más de 2 sprints sin actualizarlo

**Señal de alerta:** Si un agente pregunta algo que debería estar en el snapshot, el snapshot está obsoleto.

**Regla de actualización:**
```
Al final de CADA sesión donde se toque un módulo → actualizar su snapshot.
No acumular actualizaciones. Un snapshot desactualizado es peor que uno que no existe.
```

---

## Gestión del budget de tokens

### Presupuesto por tipo de sesión

| Tipo de sesión | Carga típica | Budget |
|---|---|---|
| `[ORDERS]` | project-index + session + custody-orders snapshot + operadores snapshot + testing-standards | ~20KB |
| `[TRACKING]` | project-index + session + tracking snapshot + alerts snapshot + architecture | ~18KB |
| `[PLANNING]` | project-index + session + 06_memory.md + PLAN_TDD_SDD | ~25KB |
| `[REVIEW]` | project-index + session + snapshot del módulo + coding-standards | ~15KB |

### Cuándo romper el límite

Si para completar la tarea se necesita más de 2 snapshots:
1. Terminar la tarea en sub-tareas por módulo
2. O usar un agente especializado con su propio contexto (Agent tool)

---

## Estrategia de compresión

Cuando un snapshot crece más de 300 líneas:
1. Mover detalles de implementación al código mismo (comentarios, tipos)
2. Mover contratos de integración a `high-value-memory/integration-contracts.md`
3. Mover ADRs a `docs/13_decisions_log.md`
4. Mantener en el snapshot solo: endpoints, estados, reglas críticas, dependencias

---

## Anti-patrones (nunca hacer)

```
❌ Cargar todos los snapshots al inicio — satura el contexto
❌ Poner estado temporal en high-value-memory — eso es para session.md
❌ Duplicar información entre project-index y snapshots
❌ Snapshots de más de 300 líneas
❌ High-value-memory sin fecha o sin "aplicar cuando"
❌ Usar conversación larga como sustituto de session.md
❌ Olvidar actualizar el snapshot al terminar
```
