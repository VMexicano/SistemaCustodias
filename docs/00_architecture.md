# Arquitectura — SistemaCustodias

Referencia técnica completa del sistema. Para el LLM: usar `context/project-index.md` en sesiones (más compacto). Este documento es la versión extendida para diseño y onboarding.

---

## Visión del sistema

SistemaCustodias es una plataforma de gestión de servicios de custodia de valores. Permite solicitar, aprobar, asignar y monitorear el transporte seguro de efectivo, paquetería de alto valor, documentos confidenciales y escolta de personas VIP.

**Diferenciadores clave vs. plataformas de movilidad:**
1. **Aprobación obligatoria** — Toda orden pasa por un supervisor antes de ejecutarse
2. **Regla dos-personas** — Siempre custodio + copiloto asignados y confirmados
3. **Cadena de custodia digital** — Firma digital en pickup y delivery, audit log inmutable
4. **Tipos escalables** — Nuevos tipos de custodia sin cambios de código
5. **Alertas de seguridad** — Botón de pánico, geofencing, tamper detection

---

## Stack técnico

```
┌──────────────────────────────────────────────────────────────┐
│                         Clientes                             │
│    App Mobile (Expo 54)          Web Admin (Vite 5)          │
│    • Flujo cliente               • Dashboard despachador     │
│    • Flujo operador              • Aprobaciones supervisor   │
└───────────────────┬──────────────────────┬───────────────────┘
                    │ HTTPS / WSS          │ HTTPS / WSS
┌───────────────────▼──────────────────────▼───────────────────┐
│                 API (Fastify 4 / Node.js 20 / TypeScript 5)  │
│  Módulos: auth · clients · operadores · custody-orders       │
│           value-declaration · routing · tracking · alerts    │
│           notifications · payments · scheduler · compliance  │
│           admin                                              │
└──────┬────────────┬─────────────────┬────────────────────────┘
       │            │                 │
┌──────▼──┐  ┌──────▼──────┐  ┌──────▼────────────────────────┐
│PostgreSQL│  │  Redis 7    │  │    BullMQ Workers             │
│15 +      │  │  • OTP      │  │  • notifications-worker       │
│TimescaleDB  │  • JWT RT   │  │  • tracking-worker            │
│(GPS)    │  │  • Pub-Sub  │  │  • compliance-worker          │
│         │  │  • Circuit  │  │  • payments-worker            │
└─────────┘  └─────────────┘  └───────────────────────────────┘
```

---

## Actores y permisos

| Actor | Puede crear órdenes | Puede aprobar | Puede asignar | Puede ejecutar (campo) | Puede ver todo |
|---|---|---|---|---|---|
| `client` | ✅ | ❌ | ❌ | ❌ | Solo las suyas |
| `custodio` | ❌ | ❌ | ❌ | ✅ | Solo las asignadas |
| `copiloto` | ❌ | ❌ | ❌ | ✅ (confirmar + alertas) | Solo las asignadas |
| `dispatcher` | ✅ | ❌ | ✅ | ❌ | ✅ |
| `supervisor` | ✅ | ✅ | ✅ | ❌ | ✅ |

---

## Ciclo de vida de una orden

```
                                      ┌─────────┐
                          ┌──────────►│CANCELLED│
                          │           └─────────┘
                    ┌─────┴──────────────────────────────────────┐
              ──►  │ DRAFT                                        │
                    └─────┬──────────────────────────────────────┘
                          │ submit (client/dispatcher)
                    ┌─────▼──────────────────────────────────────┐
              ──►  │ PENDING_APPROVAL                             │◄── supervisor
                    └─────┬─────────────────────┬────────────────┘
                          │ approve             │ reject
                    ┌─────▼───────┐     ┌──────▼───────┐
                    │  APPROVED   │     │   REJECTED   │
                    └─────┬───────┘     └──────────────┘
                          │ assign (dispatcher: custodio + copiloto)
                    ┌─────▼───────┐
                    │  ASSIGNED   │
                    └─────┬───────┘
                          │ confirm-crew (AMBOS: custodio + copiloto)
                    ┌─────▼──────────┐
                    │ CREW_CONFIRMED │
                    └─────┬──────────┘
                          │ depart
                    ┌─────▼──────────────┐
                    │ EN_ROUTE_TO_PICKUP │
                    └─────┬──────────────┘
                          │ arrive-pickup
                    ┌─────▼──────────┐
                    │   AT_PICKUP    │
                    └─────┬──────────┘
                          │ pickup + firma del cliente
                          │ genera custody_snapshot (INMUTABLE)
                    ┌─────▼──────────┐    ┌──────────┐
                    │  IN_TRANSIT    │───►│ INCIDENT │
                    └─────┬──────────┘    └────┬─────┘
                          │ arrive-delivery     │ resolve
                    ┌─────▼──────────┐         │
                    │  AT_DELIVERY   │◄─────────┘
                    └─────┬──────────┘
                          │ deliver + firma del receptor
                    ┌─────▼──────────┐
                    │   DELIVERED    │
                    └─────┬──────────┘
                          │ complete (dispatcher/supervisor)
                    ┌─────▼──────────┐
                    │   COMPLETED    │ ← genera reporte de cadena de custodia
                    └────────────────┘
```

---

## Principios de implementación

### 1. Transacciones solo para estado

```
db.transaction() → solo tablas de estado (custody_orders, order_transitions)
DESPUÉS del commit → BullMQ para notificaciones, alertas, WebSocket
```

### 2. Módulos autocontenidos

```
Cada módulo: routes → controller → service → repository → types
Los services pueden llamar a otros services
Los repositories NUNCA importan de otro módulo
```

### 3. Snapshots inmutables

```
pricing_snapshot → se escribe en APPROVED, nunca después
custody_snapshot → se escribe en IN_TRANSIT, nunca después
order_transitions → solo INSERT, nunca UPDATE
```

### 4. Extensibilidad por datos

```
Nuevo tipo de custodia → INSERT en custody_types
Nuevo canal de notificación → INSERT en configuración
Nuevo rol → cambio de ENUM (migración, pero sin código nuevo)
```

---

## Estructura del monorepo

```
SistemaCustodias/
├── apps/
│   ├── api/              Backend Fastify
│   │   ├── src/modules/  13 módulos
│   │   ├── migrations/   Knex migrations
│   │   └── seeds/        Seeds idempotentes
│   ├── mobile-v2/        Expo SDK 54 (flujo cliente + operador)
│   └── web/              Vite 5 + React 19 (dashboard admin)
├── packages/
│   └── shared-types/     TypeScript types compartidos
├── context/              Sistema de memoria para LLMs
│   ├── project-index.md  Fuente de verdad (siempre cargar)
│   ├── session.md        Estado de la sesión
│   ├── router.md         Routing de contexto
│   ├── STRATEGY.md       Estrategia de memoria
│   ├── snapshots/        Un snapshot por módulo
│   ├── high-value-memory/ Memorias durables entre sprints
│   └── conversation-log.md Historial de sesiones
├── steering/             Guías de estilo (coding, testing, architecture, product)
├── docs/                 Documentación extendida
│   └── 13_decisions_log.md ADRs completas
├── agents/               System prompts de los 6 agentes
├── .claude/
│   ├── commands/         7 comandos de sesión (/session-start, /plan, etc.)
│   └── skills/           10 skills de desarrollo
├── CLAUDE.md             Configuración del proyecto para LLMs
└── AGENTS.md             Definición del equipo de agentes
```

---

## Decisiones de arquitectura vigentes

Ver registro completo en `docs/13_decisions_log.md`.

| ADR | Decisión |
|---|---|
| ADR-001 | Monolito modular (no microservicios) |
| ADR-002 | TimescaleDB para GPS (extensión de PostgreSQL) |
| ADR-003 | BullMQ para efectos secundarios (fuera de transacción) |
| ADR-004 | Tipos de custodia vía JSONB schema |
| ADR-005 | Aprobación obligatoria (regulatorio — no configurable) |
| ADR-006 | Regla dos-personas (custodio + copiloto siempre) |
| ADR-007 | Snapshots inmutables (pricing + custody) |
| ADR-008 | Soft delete universal |
| ADR-009 | JWT RS256 + refresh token en Redis |
| ADR-010 | Una app mobile, dos flujos por role |

---

## Métricas de calidad

| Métrica | Umbral |
|---|---|
| CustodyStateMachine cobertura | 100% líneas + branches |
| AlertEngine cobertura | 95% líneas |
| PricingEngine cobertura | 100% líneas + branches |
| Global cobertura | 75% mínimo |
| TypeScript errors | 0 en `tsc --noEmit` |
| Migraciones | Toda migración tiene `up()` y `down()` |
