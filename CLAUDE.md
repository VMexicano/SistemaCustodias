# CLAUDE.md — SistemaCustodias

Plataforma de custodia de valores · Node.js 20 + TypeScript 5 + Fastify 4 + PostgreSQL 15 + Redis 7 + React Native (Expo)

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
| [CLIENTS] | context/snapshots/clients.snapshot.md | coding-standards.md |
| [OPERADORES] | context/snapshots/operadores.snapshot.md | coding-standards.md |
| [ORDERS] | context/snapshots/custody-orders.snapshot.md | testing-standards.md |
| [VALUE_DECL] | context/snapshots/value-declaration.snapshot.md | coding-standards.md |
| [TRACKING] | context/snapshots/tracking.snapshot.md | architecture.md |
| [ALERTS] | context/snapshots/alerts.snapshot.md | testing-standards.md |
| [PAYMENTS] | context/snapshots/payments.snapshot.md | coding-standards.md |
| [COMPLIANCE] | context/snapshots/compliance.snapshot.md | coding-standards.md |
| [NOTIFICATIONS] | context/snapshots/notifications.snapshot.md | coding-standards.md |
| [SCHEDULER] | context/snapshots/scheduler.snapshot.md | coding-standards.md |
| [ADMIN] | context/snapshots/admin.snapshot.md | steering/product.md |
| [INFRA] | context/snapshots/infra.snapshot.md | architecture.md |
| [MOBILE] | context/snapshots/mobile.snapshot.md | steering/product.md |
| [PLANNING] | — | docs/06_memory.md + docs/PLAN_TDD_SDD.md |

---

## Actores del sistema

| Actor | Rol | Plataforma |
|---|---|---|
| `client` | Solicita y hace seguimiento de la custodia | Mobile (flujo cliente) + Web |
| `custodio` | Ejecuta el transporte de valores — conductor de la unidad | Mobile (flujo operador) |
| `copiloto` | Acompañante de seguridad en la unidad | Mobile (flujo operador) |
| `dispatcher` | Crea, asigna y coordina órdenes | Web |
| `supervisor` | Aprueba órdenes y gestiona incidentes | Web |

---

## Tipos de custodia (escalables vía JSONB `custody_config`)

| Slug | Descripción |
|---|---|
| `cash_transport` | Efectivo, cheques, valores monetarios |
| `high_value_package` | Joyería, electrónicos, mercancía costosa |
| `confidential_docs` | Documentos legales, notariales, corporativos |
| `vip_escort` | Escolta y protección de personas |

Cada tipo define sus propios campos de `value_declaration` en la tabla `custody_types`.
Agregar un nuevo tipo **no requiere cambios de código** — solo un registro en la BD.

---

## Reglas de código (siempre)

```
✓ TypeScript strict — sin any
✓ routes → controller → service → repository
✓ Inyección de dependencias
✓ SELECT FOR UPDATE en transiciones de estado de órdenes
✓ Efectos secundarios FUERA de transacciones (encolar en BullMQ)
✓ Soft delete (deleted_at) — NUNCA DELETE
✓ Audit log en toda transición de estado (actor, timestamp, GPS, motivo)
✓ custody_snapshot es inmutable — nunca reescribir después de APPROVED
✓ Toda orden requiere aprobación de supervisor (no opcional)
✓ Regla dos-personas: toda orden asigna custodio + copiloto (mínimo)
✓ Chain of custody: cada transición registra firma digital o confirmación biométrica
```

---

## Cobertura de tests requerida

CustodyStateMachine: **100%** · PricingEngine: **100%** · AlertEngine: **95%** · Global: **75%**

---

## Al finalizar cualquier tarea

```
1. pnpm --filter @custodias/api agent:verify:quick
2. Actualizar context/snapshots/{module}.snapshot.md
3. Actualizar docs/06_memory.md
4. Commit: feat({module}): descripción
5. /session-end al cerrar
```

---

## Agentes disponibles (ver agents/)

`architect` · `backend` · `qa` · `mobile` · `devops` · `compliance`

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

**QA también corre en paralelo** — un agente qa por módulo, simultáneamente cuando sus backends terminan.

---

## Output compacto de agentes — Regla de tokens

**Los agentes solo retornan el JSON de handoff — sin texto adicional.**

Tests y verificaciones se corren en modo silencioso:
```bash
# ✅ Verificación compacta — correr SOLO el módulo en foco
npx tsc --noEmit 2>&1 | head -5
npx jest --silent --passWithNoTests --testPathPattern="{module}" 2>&1 \
  | grep -E "^(Tests|Test Suites|PASS|FAIL):" | head -5

# ✅ Si falla → leer el output COMPLETO del test fallido:
npx jest --forceExit --testPathPattern="{module}" 2>&1
```
