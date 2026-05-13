# Context Router — SistemaCustodias

> Define exactamente qué cargar según el tipo de tarea.
> Objetivo: máximo 2 snapshots + 1 archivo de steering por sesión.
> NUNCA cargar todos los docs al mismo tiempo.

---

## Regla de carga

```
Siempre:
  context/project-index.md    (identidad del proyecto)
  context/session.md          (estado actual)

Luego, según el tipo de tarea detectado, cargar:
  1 snapshot del módulo principal
  1 snapshot secundario si hay dependencia directa
  1 archivo de steering
```

---

## Tabla de routing por tipo de tarea

| Tipo | Cuándo usarlo | Snapshot principal | Snapshot secundario | Steering |
|---|---|---|---|---|
| `[AUTH]` | Login, OTP, JWT, roles, sesiones | `snapshots/auth.snapshot.md` | — | `steering/coding-standards.md` |
| `[CLIENTS]` | Alta de clientes, empresas, crédito | `snapshots/clients.snapshot.md` | `snapshots/auth.snapshot.md` | `steering/coding-standards.md` |
| `[OPERADORES]` | Custodios, copilotos, vehículos, disponibilidad | `snapshots/operadores.snapshot.md` | `snapshots/auth.snapshot.md` | `steering/coding-standards.md` |
| `[ORDERS]` | State machine de órdenes, aprobación, asignación | `snapshots/custody-orders.snapshot.md` | `snapshots/operadores.snapshot.md` | `steering/testing-standards.md` |
| `[VALUE_DECL]` | Declaración de valores, tipos de custodia | `snapshots/value-declaration.snapshot.md` | `snapshots/custody-orders.snapshot.md` | `steering/coding-standards.md` |
| `[ROUTING]` | Rutas seguras, geocerca, restricciones de ruta | `snapshots/routing.snapshot.md` | `snapshots/tracking.snapshot.md` | `steering/architecture.md` |
| `[TRACKING]` | GPS tiempo real, WebSocket, TimescaleDB | `snapshots/tracking.snapshot.md` | `snapshots/alerts.snapshot.md` | `steering/architecture.md` |
| `[ALERTS]` | Botón de pánico, tamper, geofence, incidentes | `snapshots/alerts.snapshot.md` | `snapshots/tracking.snapshot.md` | `steering/testing-standards.md` |
| `[NOTIFICATIONS]` | FCM push, SMS, circuit breaker | `snapshots/notifications.snapshot.md` | — | `steering/coding-standards.md` |
| `[PAYMENTS]` | Stripe, facturación, reembolsos | `snapshots/payments.snapshot.md` | `snapshots/custody-orders.snapshot.md` | `steering/coding-standards.md` |
| `[SCHEDULER]` | Órdenes programadas, ventanas de despacho | `snapshots/scheduler.snapshot.md` | `snapshots/custody-orders.snapshot.md` | `steering/coding-standards.md` |
| `[COMPLIANCE]` | Cadena de custodia, firmas, regulatorio | `snapshots/compliance.snapshot.md` | `snapshots/custody-orders.snapshot.md` | `steering/coding-standards.md` |
| `[ADMIN]` | Dashboard despachador/supervisor, config | `snapshots/admin.snapshot.md` | — | `steering/product.md` |
| `[MOBILE]` | App (flujo cliente + flujo operador) | `snapshots/mobile.snapshot.md` | `snapshots/custody-orders.snapshot.md` | `steering/product.md` |
| `[INFRA]` | Docker, migraciones, seeds, CI/CD | `snapshots/infra.snapshot.md` | — | `steering/architecture.md` |
| `[ARCHITECTURE]` | Decisiones técnicas, ADRs, diseño de sistema | — | — | `steering/architecture.md` + `docs/13_decisions_log.md` |
| `[TESTING]` | Estrategia de tests, cobertura, fixtures | — | — | `steering/testing-standards.md` + `docs/PLAN_TDD_SDD.md` |
| `[PLANNING]` | Planeación de sprints, nuevas features | — | — | `docs/06_memory.md` + `docs/PLAN_TDD_SDD.md` |
| `[REVIEW]` | Code review, PR review | — | snapshot del módulo revisado | `steering/coding-standards.md` |

---

## Heurísticas para detectar el tipo de tarea

```
Menciona "login", "token", "OTP", "autenticación", "sesión"     → [AUTH]
Menciona "cliente", "empresa", "RFC", "crédito"                  → [CLIENTS]
Menciona "custodio", "copiloto", "operador", "vehículo"          → [OPERADORES]
Menciona "orden", "custodia", "aprobación", "asignación"         → [ORDERS]
Menciona "declaración", "valor declarado", "tipo de custodia"    → [VALUE_DECL]
Menciona "ruta", "geocerca", "distancia", "restricción"          → [ROUTING]
Menciona "GPS", "ubicación", "tracking", "tiempo real"           → [TRACKING]
Menciona "alerta", "pánico", "incidente", "tamper"               → [ALERTS]
Menciona "push", "notificación", "SMS", "FCM"                    → [NOTIFICATIONS]
Menciona "pago", "Stripe", "factura", "cobro"                    → [PAYMENTS]
Menciona "programado", "scheduler", "ventana de tiempo"          → [SCHEDULER]
Menciona "cadena de custodia", "firma", "cumplimiento"           → [COMPLIANCE]
Menciona "dashboard", "despachador", "supervisor", "admin"       → [ADMIN]
Menciona "app mobile", "pantalla", "flujo cliente/operador"      → [MOBILE]
Menciona "Docker", "migración", "seed", "CI/CD", "Railway"       → [INFRA]
Menciona "ADR", "arquitectura", "decisión técnica"               → [ARCHITECTURE]
Menciona "test", "cobertura", "fixture", "factory"               → [TESTING]
Menciona "sprint", "planear", "nueva feature", "roadmap"         → [PLANNING]
```

---

## Ejemplo de carga para [ORDERS]

```
Sesión: trabajo en la state machine de la orden de custodia

Cargar:
  ✅ context/project-index.md           (siempre)
  ✅ context/session.md                  (siempre)
  ✅ context/snapshots/custody-orders.snapshot.md   (principal)
  ✅ context/snapshots/operadores.snapshot.md       (secundario — asignación de equipo)
  ✅ steering/testing-standards.md                  (testing crítico en state machine)

No cargar:
  ❌ docs/00_arquitectura_base_v1.md   (demasiado grande)
  ❌ otros snapshots no relacionados
  ❌ múltiples archivos de steering
```
