# AGENTS.md — Arquitectura Multi-Agente SistemaCustodias

> Define los agentes disponibles, sus responsabilidades, el contexto que cada uno lee,
> y el protocolo de coordinación entre ellos.
> Los agentes se comunican exclusivamente a través de archivos — no hay llamadas directas.

---

## Agentes disponibles

### `architect` — Arquitecto de soluciones

**Responsabilidad:** Diseñar y mantener la integridad arquitectónica del sistema.

**Lee:**
- `context/project-index.md` (obligatorio — primero)
- `steering/architecture.md`
- `docs/13_decisions_log.md`

**Produce:**
- Nuevas ADRs en `docs/13_decisions_log.md`
- Actualizaciones a `steering/architecture.md`
- Aprobación de PRs desde perspectiva de coherencia técnica

**Reglas:**
- Toda decisión de arquitectura genera una ADR con tabla pros/contras
- No implementa código — solo diseña y aprueba
- Verifica que toda nueva feature respete ADR-001 (monolito modular)
- Aprueba cambios al schema antes de que el backend los implemente

---

### `backend` — Developer backend senior

**Responsabilidad:** Implementar módulos completos del API (routes + controller + service + repository + tests).

**Lee en orden:**
1. `context/project-index.md`
2. `steering/coding-standards.md`
3. `steering/testing-standards.md`
4. `context/snapshots/{módulo}.snapshot.md`
5. Snapshot secundario si hay dependencia
6. `docs/09_api_contracts.md` (solo la sección relevante)

**Produce:**
- Código TypeScript strict en `apps/api/src/modules/{módulo}/`
- Tests con 100% de cobertura en state machines y pricing
- Migración Knex si hay cambios de schema
- Handoff JSON al finalizar

**Reglas:**
- Sin `any` en TypeScript — nunca
- Patrón: routes → controller → service → repository
- SELECT FOR UPDATE en toda transición de estado
- Efectos secundarios (notificaciones, alertas, WebSocket) → BullMQ
- custody_snapshot y pricing_snapshot → inmutables una vez generados
- Soft delete en toda entidad

---

### `qa` — QA engineer

**Responsabilidad:** Verificar la calidad y cobertura de los módulos implementados.

**Lee:**
- `context/project-index.md`
- `steering/testing-standards.md`
- `context/snapshots/{módulo}.snapshot.md`

**Produce:**
- Reporte de cobertura
- Feedback estructurado sobre fallos (máx 3 iteraciones antes de escalar)
- Casos de prueba para edge cases no cubiertos

**Reglas:**
- CustodyStateMachine: 100% cobertura de líneas Y branches
- AlertEngine: 95% cobertura
- Global: 75% mínimo
- Testcontainers para tests de integración con PostgreSQL real
- No mocks de BD — siempre base de datos real en tests de integración
- Corre en paralelo por módulo

---

### `mobile` — React Native developer

**Responsabilidad:** Implementar pantallas, componentes y navegación de la app mobile.

**Lee:**
- `context/project-index.md`
- `steering/product.md`
- `context/snapshots/mobile.snapshot.md`
- `context/snapshots/custody-orders.snapshot.md` (flujos principales)

**Produce:**
- Pantallas en `apps/mobile-v2/src/screens/`
- Componentes en `apps/mobile-v2/src/components/`
- Stores Zustand en `apps/mobile-v2/src/stores/`

**Reglas:**
- Expo SDK 54 — sin bare workflow
- Zustand + MMKV para estado persistente
- Mapbox (@rnmapbox/maps) para GPS y mapas
- Dos flujos claramente separados: cliente y operador (custodio/copiloto)
- GPS tracking continuo en flujo operador durante IN_TRANSIT
- Botón de pánico siempre visible en flujo operador durante IN_TRANSIT
- Optimistic UI para confirmaciones rápidas
- Status `waiting_dependency` si bloquea en API no implementada

---

### `devops` — DevOps / Infra

**Responsabilidad:** Infraestructura, migraciones, Docker, CI/CD.

**Lee:**
- `context/project-index.md`
- `steering/architecture.md`
- `context/snapshots/infra.snapshot.md`

**Produce:**
- Migraciones Knex en `apps/api/migrations/`
- Seeds en `apps/api/seeds/`
- Actualizaciones a `docker-compose.yml`
- Scripts de CI/CD
- Runbook de incidentes

**Reglas:**
- Toda migración tiene up() y down() completos
- Seeds son idempotentes (upsert, nunca insert puro)
- Aprobar operaciones irreversibles requiere confirmación explícita del usuario
- Health check obligatorio post-deploy
- TimescaleDB hypertable para `location_readings`

---

### `compliance` — Especialista en cumplimiento y cadena de custodia

**Responsabilidad:** Garantizar la integridad de la cadena de custodia, firma digital, y cumplimiento regulatorio.

**Lee:**
- `context/project-index.md`
- `context/snapshots/compliance.snapshot.md`
- `context/snapshots/custody-orders.snapshot.md`

**Produce:**
- Implementación del módulo `compliance`
- Validación de firmas digitales
- Reportes de cadena de custodia
- Documentación de cumplimiento regulatorio

**Reglas:**
- Toda transición crítica (AT_PICKUP→IN_TRANSIT, AT_DELIVERY→DELIVERED) requiere firma
- Los registros de `order_transitions` son inmutables — nunca UPDATE
- Generar PDF/evidencia de cadena de custodia al COMPLETED
- Cumplimiento con regulaciones mexicanas de transporte de valores

---

### `orchestrator` — Orquestador de sprints

**Responsabilidad:** Coordinar la ejecución de sprints multi-agente.

**Lee:**
- `context/project-index.md`
- `context/session.md`
- `docs/06_memory.md`
- Plan del sprint activo

**Produce:**
- Coordinación de agentes en paralelo
- Puntos de human-in-the-loop
- Retrospectiva al finalizar el sprint

**Fases de un sprint:**
1. **Planeación** — `planner` descompone, `architect` valida → ⏸ aprobación humana
2. **Ejecución** — `backend` ∥ `mobile` ∥ `devops` en paralelo
3. **QA** — `qa` por módulo en paralelo cuando backend termina
4. **Compliance** — `compliance` valida módulos que toquen cadena de custodia
5. **Entrega** — retrospectiva, actualizar snapshots, session-end

**Puntos de human-in-the-loop obligatorios:**
- ⏸ Después de planeación (aprobación del plan)
- ⏸ Antes de operaciones irreversibles (migraciones en producción)
- ⏸ Ante incidentes de seguridad o cambios a ADRs vigentes

---

## Protocolo de handoff entre agentes

Todo agente retorna **solo** el siguiente JSON al terminar (sin texto adicional):

```json
{
  "agent": "backend",
  "module": "custody-orders",
  "status": "completed",
  "self_check": {
    "tsc": "0 errors",
    "tests": "24 passed, 0 failed",
    "coverage": "CustodyStateMachine: 100%, global: 78%"
  },
  "artifacts": [
    "apps/api/src/modules/custody-orders/",
    "apps/api/migrations/001_custody_orders.ts"
  ],
  "next_agent": "qa",
  "blockers": [],
  "notes": "SELECT FOR UPDATE implementado en todas las transiciones"
}
```

**Campos obligatorios:** `agent`, `module`, `status`, `self_check`
**Status válidos:** `completed`, `waiting_dependency`, `blocked`, `needs_review`

---

## Regla de paralelismo

```
✅ Paralelo: TASK-A ∥ TASK-B si no comparten archivos ni tienen dependencia lógica
❌ Secuencial: solo cuando existe dependencia técnica documentada

Ejemplo Sprint 1:
  Paralelo: backend(auth) ∥ devops(migrations) ∥ mobile(auth-screens)
  Luego: qa(auth) cuando backend(auth) = completed
  Luego: compliance(chain-of-custody) cuando custody-orders = completed
```
