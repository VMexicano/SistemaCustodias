# CLAUDE.md — UBER_BASE

Plataforma tipo UBER · MVP Taxi México · Node.js 20 + TypeScript 5 + Fastify 4 + PostgreSQL + Redis + React Native

---

## Preferencias de idioma

| Contexto | Idioma |
|---|---|
| Conversaciones y documentación (`.md`) | **Español latino** |
| Código, comentarios, commits, logs | **Inglés** |

Regla: si lo lee una persona → español. Si lo procesa una máquina o es convención de industria → inglés.

---

## Al inicio de cada sesión

Ejecuta `/session-start` para identificar el tipo de tarea y cargar solo el contexto necesario.

Si ya sabes en qué módulo trabajar, ejecuta `/module {nombre}` directamente.

Para ver el estado del proyecto: `/status`

---

## Contexto — carga mínima obligatoria

El sistema de routing está en `context/router.md`.
Regla: cargar máximo **2 snapshots + 1 archivo de steering** por sesión.

**Siempre en contexto (automático):**
- `context/project-index.md` — **leer primero** — schema, módulos, reglas, ADRs, patrones en un archivo
- `context/session.md` — estado de la sesión actual

**Por tipo de tarea (ver router.md):**

| Tipo | Snapshot | Steering |
|---|---|---|
| [AUTH] | context/snapshots/auth.snapshot.md | coding-standards.md |
| [TRIPS] | context/snapshots/trips.snapshot.md | testing-standards.md |
| [PRICING] | context/snapshots/pricing.snapshot.md | testing-standards.md |
| [PAYMENTS] | context/snapshots/payments.snapshot.md | coding-standards.md |
| [DRIVERS] | context/snapshots/drivers.snapshot.md | coding-standards.md |
| [TRACKING] | context/snapshots/tracking.snapshot.md | architecture.md |
| [INFRA] | context/snapshots/infra.snapshot.md | architecture.md |
| [PLANNING] | — | docs/06_memory.md + docs/PLAN_TDD_SDD.md |

---

## Reglas de código (siempre)

```
✓ TypeScript strict — sin any
✓ routes → controller → service → repository
✓ Inyección de dependencias
✓ SELECT FOR UPDATE en transiciones de estado de viajes
✓ Efectos secundarios FUERA de transacciones (encolar en BullMQ)
✓ Soft delete (deleted_at) — NUNCA DELETE
✓ Audit log para cambios de entidades de negocio
✓ pricing_snapshot es inmutable — nunca escribirlo dos veces
```

## Cobertura de tests requerida

TripStateMachine: **100%** · PricingEngine: **100%** · PaymentService: **95%** · Global: **75%**

---

## Al finalizar cualquier tarea

```
1. pnpm --filter @ridebase/api agent:verify:quick
2. Actualizar context/snapshots/{module}.snapshot.md
3. Actualizar docs/06_memory.md
4. Commit: feat({module}): descripción
5. /session-end al cerrar
```

---

## Agentes disponibles (ver agents/)

`architect` · `backend` · `qa` · `mobile` · `devops`

Cada agente tiene su system prompt completo en `agents/{nombre}.md`.

---

## Ejecución de agentes — Regla de paralelismo (obligatoria)

**Todo sprint se ejecuta con agentes en paralelo por defecto.**

Al usar `/team`, el orchestrator SIEMPRE debe:

1. Identificar todos los grupos de tareas sin dependencias entre sí
2. Lanzar esos grupos simultáneamente con la herramienta `Agent` (múltiples calls en el mismo mensaje)
3. Esperar los handoffs de todos antes de avanzar al siguiente grupo

```
Grupo 1 (sin deps):   TASK-A ∥ TASK-B ∥ TASK-C  → lanzar simultáneamente
Grupo 2 (espera G1):  TASK-D ∥ TASK-E            → lanzar simultáneamente cuando G1 ✅
Grupo 3 (espera G2):  TASK-F                      → lanzar cuando G2 ✅
```

**Regla:** Si dos tareas no comparten archivos ni tienen dependencia lógica, van en paralelo. No lanzarlas secuencialmente salvo que exista una razón técnica explícita documentada.

**QA también corre en paralelo** — un agente qa por módulo, simultáneamente cuando sus backends terminan.

Esta regla aplica a todos los agentes: backend, qa, mobile, devops.

## Output compacto de agentes — Regla de tokens

**Los agentes solo retornan el JSON de handoff — sin texto adicional.**

Tests y verificaciones se corren en modo silencioso:
```bash
# ✅ Verificación compacta — correr SOLO el módulo en foco (nunca la suite completa salvo indicación explícita)
npx tsc --noEmit 2>&1 | head -5
npx jest --silent --passWithNoTests --testPathPattern="{module}" 2>&1 \
  | grep -E "^(Tests|Test Suites|PASS|FAIL):" | head -5

# ✅ Si falla → leer el output COMPLETO del test fallido (sin tail, sin head):
npx jest --forceExit --testPathPattern="{module}" 2>&1

# ✅ Cobertura compacta
npx jest --silent --coverage --coverageReporters=text 2>/dev/null \
  | grep -E "^\s*(PASS|FAIL|%|All files|{module})" | head -20
```

**Reglas de análisis — CRÍTICAS:**
- **Tests:** Por defecto correr solo el test del módulo en foco (`--testPathPattern={module}`). Correr la suite completa SOLO cuando el usuario lo pide explícitamente o el plan lo especifica.
- **Fallos en tests:** Leer el output COMPLETO del test (sin `tail`, sin `head`). El error real puede estar en cualquier línea, no solo al final.
- **Respuestas de API:** Al depurar comportamiento de un endpoint, siempre leer y analizar el body completo de la respuesta (status code + body + headers relevantes). No asumir el comportamiento por el status code solo.
- **Monitoreo de agentes en background:** `tail -5 {output_file}` solo para verificar si el agente terminó (buscar el JSON de handoff). Para análisis de errores en output de agentes, leer el output completo.
