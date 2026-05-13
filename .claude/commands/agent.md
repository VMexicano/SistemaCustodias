Vas a invocar un **agente individual** del equipo para una tarea específica, fuera del pipeline completo.

**Argumentos recibidos:** $ARGUMENTS
**Formato esperado:** `{nombre-agente} {tarea}`

Ejemplos:
```
/agent architect revisar ADR-007 y confirmar que SELECT FOR UPDATE aplica en trips
/agent qa trips revisar cobertura actual e identificar gaps
/agent backend auth implementar POST /auth/refresh
/agent devops verificar que docker-compose levanta correctamente
/agent mobile implementar TripRequestModal con countdown de 30 segundos
/agent planner descomponer la tarea de pagos en subtareas para el Sprint 5
```

---

## Paso 1 — Parsear argumentos

Extrae del inicio de `$ARGUMENTS`:
- **Nombre del agente:** primer token (`architect`, `qa`, `backend`, `devops`, `mobile`, `planner`)
- **Tarea:** el resto del texto

Si el nombre del agente no es uno de los 6 válidos → responde: "Agente no reconocido. Agentes disponibles: architect | backend | qa | devops | mobile | planner"

---

## Paso 2 — Cargar contexto del agente

Lee el system prompt del agente: `agents/{nombre-agente}.md`

Identifica en la sección "Contrato de invocación":
- Qué archivos de contexto necesita (context_files)
- Qué espera en el input

Carga solo esos archivos — no más.

---

## Paso 3 — Cargar contexto del módulo (si aplica)

Si la tarea menciona un módulo específico (auth, trips, pricing, payments, drivers, tracking):
- Lee `context/snapshots/{módulo}.snapshot.md`
- Lee las reglas de negocio relevantes de `steering/business-rules.md`

---

## Paso 4 — Ejecutar como el agente

Actúa como el agente `{nombre}` siguiendo su system prompt completo en `agents/{nombre}.md`.

Ejecuta la tarea descrita aplicando:
- Su protocolo de trabajo
- Sus reglas no-negociables
- Su checklist si tiene uno

Al finalizar, emite el handoff JSON según el contrato de output del agente (sección "Output garantizado" en `agents/{nombre}.md`), incluyendo `self_check` obligatorio.

---

## Paso 5 — Reportar resultado

Muestra:
```
## Resultado — Agent: {nombre} | Tarea: {descripción corta}

**Status:** {completed | partial | failed | blocked}
**Self-check:** {tests_run: true/false | tests_passed: true/false}

### Lo que se hizo
{descripción de acciones tomadas}

### Archivos modificados/creados
{lista o "ninguno"}

### Notas para el siguiente paso
{handoff.notes}
```

Si el status es `failed` o `blocked`, muestra el diagnóstico completo y sugiere cómo resolver.

---

## Notas

- Este skill ejecuta UN solo agente, sin pipeline ni orchestrator
- El handoff producido puede usarse como `prior_handoff` si luego se invoca otro agente
- Para flujos completos de implementación usar `/team` en su lugar
- Si el agente detecta que necesita otro agente primero → informar al usuario, no continuar solo
