# Sprint 5 — Tasks: Custody Tracking GPS

**Sprint:** 5 — SistemaCustodias
**Fecha:** 2026-05-14

---

## Grafo de dependencias

```
TRACK-001 (backend)
    │
    └──► TRACK-QA-001 (qa) ←→ TRACK-001 (Generator loop, máx 3 iter)
```

---

## Grupo 1 — Sin dependencias (lanzar inmediatamente)

### TRACK-001 — Módulo custody-tracking completo

**Tipo:** FEATURE
**Agente:** backend
**Depende de:** ninguna
**Irreversible:** no

**Checklist SDD:**
- [x] schema_verified — location_readings: time, order_id, operator_id, vehicle_id, lat, lng, speed_kmh, accuracy_m, heading (M-047)
- [x] dependencies_verified — BullMQ 5 ya instalado, Socket.io 4 ya instalado
- [x] actor_resolution — JWT.sub = user_id; service hace lookup OperadoresRepository.findByUserId(user_id) para obtener operator_id
- [x] two_person_rule — no aplica directamente, pero se valida que operador esté asignado (custodio_id OR copiloto_id)

**Archivos a crear:**
```
apps/api/src/modules/custody-tracking/
  custody-tracking.types.ts       ← LocationReading, CreateLocationPayload, LocationHistoryQuery
  custody-tracking.repository.ts  ← insertReading(), getCurrentLocation(), getHistory()
  custody-tracking.service.ts     ← recordLocation(), getCurrentLocation(), getHistory()
  custody-tracking.controller.ts  ← recordLocation(), getCurrentLocation(), getHistory()
  custody-tracking.routes.ts      ← POST /tracking/location, GET /tracking/:orderId/current|history + Socket.io namespace
  geofence.utils.ts               ← haversineDistance(), distanceToPolyline(), isOutsideRoute()

apps/api/src/queues/
  geofence.queue.ts               ← BullMQ Queue 'geofence-check'

apps/api/src/workers/
  geofence-check.worker.ts        ← BullMQ Worker geofence verification + security_alerts INSERT
```

**Archivos a modificar:**
```
apps/api/src/shared/errors/business-error.ts  ← agregar ORDER_NOT_TRACKABLE, OPERATOR_NOT_ASSIGNED, NO_LOCATION_DATA
apps/api/src/app.ts                           ← wiring CustodyTrackingService + registro de routes + geofence worker
```

**Definition of Done:**
- [ ] TypeScript: 0 errores (`npx tsc --noEmit | head -3`)
- [ ] Tests del módulo pasan (`npx jest --testPathPattern=custody-tracking`)
- [ ] POST /tracking/location retorna 409 ORDER_NOT_TRACKABLE si orden no en EN_ROUTE_TO_PICKUP|IN_TRANSIT
- [ ] POST /tracking/location retorna 403 OPERATOR_NOT_ASSIGNED si operador no está en la orden
- [ ] Socket.io emite location:updated al room correcto
- [ ] Geofence queue encola job en cada lectura

---

## Grupo 2 — Espera TRACK-001

### TRACK-QA-001 — Tests unitarios módulo custody-tracking

**Tipo:** QA_ONLY
**Agente:** qa
**Depende de:** TRACK-001
**Irreversible:** no

**Archivos a crear:**
```
apps/api/src/modules/custody-tracking/__tests__/
  custody-tracking.service.test.ts
  geofence.utils.test.ts
```

**Archivos a modificar (si el agente backend no los creó):**
```
apps/api/src/modules/custody-tracking/__tests__/
  custody-tracking.service.test.ts   ← reescribir el existente para dominio custodia
```

**Cobertura requerida:**
| Módulo | Umbral |
|---|---|
| CustodyTrackingService | ≥ 90% |
| geofence.utils | 100% |

**Casos de test obligatorios:**
- `recordLocation`: orden no encontrada → ORDER_NOT_FOUND
- `recordLocation`: orden en DRAFT → ORDER_NOT_TRACKABLE
- `recordLocation`: operador no asignado → OPERATOR_NOT_ASSIGNED
- `recordLocation`: orden en EN_ROUTE_TO_PICKUP + custodio asignado → inserta en location_readings
- `recordLocation`: orden en IN_TRANSIT + copiloto asignado → inserta en location_readings
- `recordLocation`: después de insertar → emite location:updated en socket room
- `recordLocation`: después de insertar → encola job geofence-check
- `getCurrentLocation`: retorna lectura más reciente
- `getCurrentLocation`: sin lecturas → NO_LOCATION_DATA
- `getHistory`: retorna array con limit aplicado
- `haversineDistance`: distancia conocida entre dos puntos (Madrid-Barcelona ~506km)
- `isOutsideRoute`: punto dentro del umbral → false
- `isOutsideRoute`: punto fuera del umbral → true

**Definition of Done:**
- [ ] Todos los tests pasan (100% pass rate)
- [ ] Cobertura CustodyTrackingService ≥ 90%
- [ ] Cobertura geofence.utils = 100%
- [ ] TypeScript: 0 errores adicionales
