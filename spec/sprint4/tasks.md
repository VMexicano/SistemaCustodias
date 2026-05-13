# Sprint 4 — Ciclo de Viaje: Tasks

> **Fecha:** 2026-04-06
> **Estado:** Aprobado — listo para ejecutar con `/team`
> **Ref:** spec/sprint4/requirements.md · spec/sprint4/design.md

---

## Resumen de tareas

| ID | Título | Tipo | Agentes | Depende de | Irreversible | Estado |
|---|---|---|---|---|---|---|
| TRIP-001 | PricingEngine + POST /trips/estimate | FEATURE | backend, qa | — | — | 🔲 |
| TRIP-002 | TripStateMachine | FEATURE | backend, qa | — | — | 🔲 |
| TRIP-003 | REST endpoints ciclo de vida | FEATURE | backend, qa | TRIP-001, TRIP-002 | ✅ seed | 🔲 |
| TRIP-004 | WebSocket real-time | FEATURE | backend, qa | TRIP-003 | — | 🔲 |

---

## Grafo de dependencias

```
TRIP-001 (PricingEngine)  ──┐
                             ├──► TRIP-003 (REST) ──► TRIP-004 (WebSocket)
TRIP-002 (StateMachine)   ──┘
```

## Grupos de ejecución paralela

| Grupo | Tareas | Condición de inicio |
|---|---|---|
| **Grupo 1** | TRIP-001 ∥ TRIP-002 | Sin dependencias — arrancan simultáneamente |
| **Grupo 2** | TRIP-003 | TRIP-001 ✅ Y TRIP-002 ✅ |
| **Grupo 3** | TRIP-004 | TRIP-003 ✅ |

---

## TRIP-001 — PricingEngine + POST /trips/estimate

### Checklist del planner

```
✅ task_id:              TRIP-001
✅ title:                Implementar PricingEngine + endpoint de estimación
✅ description:          Motor de precios que aplica factores configurables en orden fijo
                         (fixed_amount → percentage → multiplier). Endpoint para estimar
                         precio antes de crear el viaje. Método recalculate() para mid-trip.
✅ scope_in:             PricingEngine class, estimate(), recalculate(), haversine inline,
                         POST /trips/estimate, min_fare, pricing_snapshot, trip_applied_factors
✅ scope_out:            Crear viaje, surge pricing dinámico, pagos, WebSocket
✅ agents:               backend, qa
✅ depends_on:           ninguna
✅ acceptance_business:  Estimado con desglose visible antes de confirmar el viaje
✅ acceptance_technical: pricing-engine.test.ts 100% lines + branches
✅ irreversible:         false
✅ sprint:               4
✅ task_type:            FEATURE
```

### Specs TDD — tests a escribir

**`tests/unit/pricing-engine.test.ts`** (100% coverage obligatorio)

```typescript
describe('PricingEngine', () => {
  describe('estimate()', () => {
    it('aplica factores en orden: fixed_amount → percentage → multiplier')
    it('respeta min_fare cuando el cálculo es menor')
    it('no aplica factores inactivos')
    it('aplica solo factores que cumplen condition_rules')
    it('calcula tax_amount correctamente (16% sobre subtotal)')
    it('retorna pricing_snapshot serializable con captured_at')
    it('registra impact_amount por cada factor aplicado')
    it('maneja caso sin factores activos (precio base únicamente)')
  })

  describe('recalculate()', () => {
    it('usa pricing_snapshot existente sin leer BD')
    it('recalcula distancia con nuevo destino')
    it('no modifica el pricing_snapshot original')
    it('respeta min_fare en el recálculo')
  })

  describe('calculateDistanceKm() — haversine', () => {
    it('CDMX → Aeropuerto: ~14km ±2%')
    it('misma coordenada: 0km')
    it('tolera distancias cortas < 1km')
  })

  describe('applyFactors()', () => {
    it('fixed_amount suma al subtotal base')
    it('percentage calcula sobre subtotal actualizado (post fixed_amount)')
    it('multiplier multiplica el resultado acumulado')
    it('stackable=false solo aplica el factor de mayor impacto del mismo tipo')
  })
})
```

**`tests/integration/pricing.integration.test.ts`**

```typescript
describe('POST /trips/estimate', () => {
  it('retorna estimado con factores activos de BD')
  it('retorna 404 si trip_type_id no existe')
  it('retorna 422 si origin === destination')
  it('retorna 422 si distancia > 200km')
  it('requiere JWT válido de pasajero')
})
```

### Referencias SDD

- spec/sprint4/design.md → sección PricingEngine (interfaces + clase)
- spec/sprint4/design.md → contrato API POST /trips/estimate
- context/project-index.md → tablas: `trip_types`, `pricing_factors`, `pricing_factor_rules`, `trip_applied_factors`
- ADR-023 (haversine + radio 5km)

---

## TRIP-002 — TripStateMachine

### Checklist del planner

```
✅ task_id:              TRIP-002
✅ title:                Implementar TripStateMachine
✅ description:          Máquina de estados que maneja todas las transiciones del ciclo
                         de vida de un viaje. Valida actor, transición y aplica política
                         de cancelación. Usa SELECT FOR UPDATE en todas las transiciones.
✅ scope_in:             TripStateMachine class, 11 transiciones, validación de actor,
                         trip_status_history, política cancelación MVP
✅ scope_out:            Endpoints HTTP, notificaciones, pagos, WebSocket events
✅ agents:               backend, qa
✅ depends_on:           ninguna
✅ acceptance_business:  No es posible saltar estados ni actuar fuera de rol
✅ acceptance_technical: trip-state-machine.test.ts 100% lines + branches
✅ irreversible:         false
✅ sprint:               4
✅ task_type:            FEATURE
```

### Specs TDD — tests a escribir

**`tests/unit/trip-state-machine.test.ts`** (100% coverage obligatorio)

```typescript
describe('TripStateMachine', () => {
  describe('canTransition()', () => {
    // Transiciones válidas
    it('sistema: REQUESTED → SEARCHING')
    it('sistema: SEARCHING → CANCELLED (timeout)')
    it('driver:  SEARCHING → ACCEPTED')
    it('driver:  ACCEPTED → DRIVER_EN_ROUTE')
    it('driver:  ACCEPTED → CANCELLED')
    it('passenger: ACCEPTED → CANCELLED')
    it('driver:  DRIVER_EN_ROUTE → DRIVER_ARRIVED')
    it('driver:  DRIVER_EN_ROUTE → CANCELLED')
    it('passenger: DRIVER_EN_ROUTE → CANCELLED')
    it('driver:  DRIVER_ARRIVED → IN_PROGRESS')
    it('driver:  DRIVER_ARRIVED → CANCELLED (no_show)')
    it('driver:  IN_PROGRESS → COMPLETED')

    // Transiciones inválidas
    it('lanza INVALID_TRIP_TRANSITION: REQUESTED → COMPLETED')
    it('lanza INVALID_TRIP_TRANSITION: COMPLETED → cualquier estado')
    it('lanza INVALID_TRIP_TRANSITION: CANCELLED → cualquier estado')
    it('lanza INVALID_TRIP_TRANSITION: IN_PROGRESS → ACCEPTED')

    // Actor no autorizado
    it('lanza NOT_AUTHORIZED_FOR_TRANSITION: passenger intenta DRIVER_EN_ROUTE → DRIVER_ARRIVED')
    it('lanza NOT_AUTHORIZED_FOR_TRANSITION: driver intenta cancelar como passenger')
  })

  describe('getCancellationFee()', () => {
    it('passenger cancela < 120s de ACCEPTED: fee = 0')
    it('passenger cancela ≥ 120s de ACCEPTED: fee = 50 MXN')
    it('driver cancela: fee = 0 siempre')
    it('sistema cancela (timeout): fee = 0')
  })

  describe('transition()', () => {
    it('escribe en trip_status_history con from/to/actor/notes')
    it('usa SELECT FOR UPDATE (verifica trx.forUpdate en el spy)')
    it('retorna historyEntry con timestamps correctos')
    it('concurrencia: dos transiciones simultáneas → solo una gana (test con Promise.all)')
  })
})
```

### Referencias SDD

- spec/sprint4/design.md → diagrama de estados completo + tabla de transiciones
- spec/sprint4/design.md → interfaz TripStateMachine
- context/project-index.md → tablas: `trips`, `trip_status_history`
- ADR-025 (TripStateMachine + SELECT FOR UPDATE)
- ADR-026 (política de cancelación MVP)

---

## TRIP-003 — REST endpoints del ciclo de vida

### Checklist del planner

```
✅ task_id:              TRIP-003
✅ title:                Implementar REST endpoints del ciclo de vida de viajes
✅ description:          7 endpoints que orquestan PricingEngine y TripStateMachine.
                         Incluye BullMQ job para timeout de SEARCHING y seed de commission_rules.
✅ scope_in:             POST /trips, PATCH /trips/:id/accept, PATCH /trips/:id/status,
                         PATCH /trips/:id/cancel, PATCH /trips/:id/destination,
                         GET /trips/:id, GET /trips/active, GET /trips,
                         BullMQ job searching-timeout, seed commission_rules
✅ scope_out:            Pagos, notificaciones push, WebSocket (TRIP-004), matching avanzado
✅ agents:               backend, qa
✅ depends_on:           TRIP-001, TRIP-002
✅ acceptance_business:  Flujo completo funcional pasajero→conductor→completado
✅ acceptance_technical: trips.integration.test.ts E2E; test de concurrencia R-TRIP-001/002
✅ irreversible:         true — seed commission_rules (ON CONFLICT DO NOTHING — idempotente)
✅ sprint:               4
✅ task_type:            FEATURE
```

### Specs TDD — tests a escribir

**`tests/integration/trips.integration.test.ts`**

```typescript
describe('Trips — flujo completo', () => {
  describe('POST /trips/estimate', () => {
    // Cubierto en TRIP-001
  })

  describe('POST /trips', () => {
    it('crea viaje en REQUESTED, transiciona a SEARCHING automáticamente')
    it('retorna 409 si pasajero ya tiene viaje activo (R-TRIP-001)')
    it('retorna 404 si trip_type_id no existe')
    it('retorna 422 si origin === destination')
    it('requiere JWT de pasajero')
  })

  describe('PATCH /trips/:id/accept', () => {
    it('driver acepta: viaje pasa a ACCEPTED')
    it('retorna 409 si driver ya tiene viaje activo (R-TRIP-002)')
    it('retorna 409 si viaje no está en SEARCHING')
    it('retorna 403 si driver no está approved')
    it('concurrencia: dos drivers aceptan simultáneamente → solo uno gana')
  })

  describe('PATCH /trips/:id/status', () => {
    it('driver avanza: ACCEPTED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED')
    it('COMPLETED calcula final_fare con actual_distance_km y actual_duration_min')
    it('retorna 409 INVALID_TRIP_TRANSITION en secuencia inválida')
    it('retorna 403 si actor no tiene permiso')
  })

  describe('PATCH /trips/:id/cancel', () => {
    it('passenger cancela en ACCEPTED < 120s: fee = 0')
    it('passenger cancela en ACCEPTED ≥ 120s: fee = 50 MXN')
    it('passenger cancela en DRIVER_EN_ROUTE ≥ 120s: fee = 50 MXN')
    it('driver cancela en ACCEPTED: fee = 0, sin impacto al pasajero')
    it('driver cancela en DRIVER_ARRIVED (no_show): fee = 0')
    it('retorna 409 si viaje ya está en estado final')
  })

  describe('PATCH /trips/:id/destination', () => {
    it('passenger cambia destino en IN_PROGRESS: recalcula fare')
    it('pricing_snapshot no se modifica tras el cambio')
    it('retorna 409 si viaje no está IN_PROGRESS')
    it('retorna 403 si no es el pasajero del viaje')
    it('delta_km refleja la diferencia vs destino original')
  })

  describe('GET /trips/:id', () => {
    it('retorna detalle completo con status_history')
    it('retorna 403 si no es actor del viaje')
    it('retorna 404 si no existe')
  })

  describe('GET /trips/active', () => {
    it('retorna el viaje activo del pasajero')
    it('retorna null si no hay viaje activo')
  })

  describe('GET /trips (historial)', () => {
    it('retorna solo viajes del pasajero autenticado')
    it('pagina correctamente con page y limit')
    it('no incluye viajes de otros pasajeros')
  })

  describe('BullMQ — searching-timeout', () => {
    it('cancela viaje en SEARCHING tras 300s si no fue aceptado')
    it('no cancela si ya fue aceptado antes del timeout')
  })
})
```

### Notas de implementación

```
- trips.service.ts orquesta PricingEngine (TRIP-001) y TripStateMachine (TRIP-002)
- El job searching-timeout se encola en BullMQ al crear el viaje (FUERA de la trx)
- pricing_snapshot se escribe en trips al crear el viaje (no al completar)
- final_fare se calcula al completar con actual_distance_km + actual_duration_min
- commission_rules seed: INSERT ... ON CONFLICT (region_id) DO NOTHING
- PATCH /trips/:id/destination llama a PricingEngine.recalculate() con snapshot existente
```

### Referencias SDD

- spec/sprint4/design.md → todos los contratos API de TRIP-003
- spec/sprint4/design.md → estructura de directorios
- context/project-index.md → R-TRIP-001, R-TRIP-002, R-TRIP-003, R-TRIP-004
- ADR-005 (BullMQ), ADR-009 (pricing_snapshot inmutable), ADR-026 (cancelación)

---

## TRIP-004 — WebSocket real-time

### Checklist del planner

```
✅ task_id:              TRIP-004
✅ title:                Implementar WebSocket real-time con Socket.io
✅ description:          Capa de notificaciones en tiempo real para pasajero y conductor.
                         Dos namespaces con auth JWT. Eventos de estado, ubicación y cambio de destino.
✅ scope_in:             Namespace /passenger, namespace /driver, auth JWT handshake,
                         eventos trip:status_changed, driver:location, trip:requested,
                         trip:cancelled, trip:destination_changed, location:update,
                         room naming trip:{trip_id}
✅ scope_out:            Tracking GPS en TimescaleDB, ETA dinámica, push notifications fallback
✅ agents:               backend, qa
✅ depends_on:           TRIP-003
✅ acceptance_business:  Pasajero y conductor reciben eventos en tiempo real sin polling
✅ acceptance_technical: Tests con socket.io-client; cada transición emite evento correcto
✅ irreversible:         false
✅ sprint:               4
✅ task_type:            FEATURE
```

### Specs TDD — tests a escribir

**`tests/unit/realtime.test.ts`**

```typescript
describe('Realtime — WebSocket', () => {
  describe('Auth JWT en handshake', () => {
    it('rechaza conexión sin JWT')
    it('rechaza conexión con JWT expirado')
    it('acepta conexión con JWT válido de pasajero en /passenger')
    it('acepta conexión con JWT válido de driver en /driver')
    it('driver no puede conectarse a /passenger namespace')
  })

  describe('Namespace /passenger', () => {
    it('recibe trip:status_changed cuando el viaje transiciona de estado')
    it('recibe driver:location cuando el driver emite location:update')
    it('recibe trip:destination_changed cuando el pasajero cambia destino')
    it('no recibe eventos de viajes de otros pasajeros')
  })

  describe('Namespace /driver', () => {
    it('recibe trip:requested cuando hay una solicitud en su radio')
    it('recibe trip:cancelled cuando el pasajero cancela')
    it('recibe trip:destination_changed cuando el pasajero cambia destino mid-trip')
    it('location:update persiste coordenada en Redis (HSET driver:{id}:location)')
  })

  describe('Room management', () => {
    it('pasajero y driver del mismo viaje están en room trip:{trip_id}')
    it('driver abandona el room al cancelar o completar')
    it('pasajero abandona el room al completar')
  })
})
```

### Notas de implementación

```
- realtime.plugin.ts registra Socket.io como plugin de Fastify
- TripStateMachine emite eventos WebSocket FUERA de la transacción (en trips.service.ts)
- El emit de trip:requested debe incluir expires_at = now + 300s
- location:update del driver → HSET driver:{id}:location + emit a room del viaje activo
- Socket.io usa el mismo JWT_SECRET que el auth module
```

### Referencias SDD

- spec/sprint4/design.md → contrato completo de eventos WebSocket
- spec/sprint4/design.md → room naming y namespaces
- ADR-024 (Socket.io namespaces)

---

## Definition of Done — Sprint 4

```
✅ TRIP-001: pricing-engine.test.ts 100% lines + branches
✅ TRIP-002: trip-state-machine.test.ts 100% lines + branches
✅ TRIP-003: trips.integration.test.ts — flujo E2E completo + concurrencia
✅ TRIP-004: realtime.test.ts — todos los eventos y auth
✅ npm run agent:verify:quick pasa (lint + type-check + test)
✅ Cobertura global módulo trips ≥ 75%
✅ context/snapshots/trips.snapshot.md actualizado
✅ context/snapshots/pricing.snapshot.md actualizado
✅ docs/06_memory.md actualizado
✅ ADR-023, ADR-024, ADR-025, ADR-026 escritas en docs/13_decisions_log.md
✅ Retrospectiva documentada en docs/retro/sprint4-retro.md
✅ Commit: feat(trips): Sprint 4 — ciclo de vida completo + pricing + realtime
```

---

## Notas por agente

### Backend
- Implementar en orden: PricingEngine → StateMachine → Services → Routes → Realtime
- `pricing_snapshot` se escribe una sola vez al crear el viaje — no en el estimate
- Todos los efectos secundarios (BullMQ, WebSocket emits) van FUERA de las transacciones Knex
- `SELECT FOR UPDATE` es obligatorio en `TripStateMachine.transition()`

### QA
- Usar Testcontainers para PostgreSQL y Redis en tests de integración
- El test de concurrencia en `PATCH /trips/:id/accept` debe usar `Promise.all` con dos requests simultáneos
- Mockear Socket.io con `socket.io-client` en memoria (sin levantar servidor real en unit tests)
- PricingEngine y StateMachine son clases puras — no requieren Testcontainers para unit tests

### DevOps
- No hay nuevas variables de entorno en este sprint
- Verificar que el seed `06_commission_rules` corre en CI sin errores (idempotente)
- BullMQ job `searching-timeout` debe aparecer en Bull Board (ya configurado en Sprint 1)
