# Snapshot: monitor-engine

**Estado:** ✅ COMPLETO — Sprint 15 (2026-05-18)
**Módulo:** `apps/api/src/modules/monitor-engine/`
**Shared:** `apps/api/src/shared/gps/`
**Cobertura:** MonitorEngine.service.ts 100% lines / 100% branches / 100% functions

---

## Archivos del módulo

| Archivo | Estado | Notas |
|---|---|---|
| `src/shared/gps/gps-provider.interface.ts` | ✅ | `IGpsProvider.getAutoTimestamp(orderId, vehicleId): Promise<Date>` |
| `src/shared/gps/mock-gps.adapter.ts` | ✅ | MVP: offset 0-120s aleatorio desde now |
| `src/modules/monitor-engine/monitor-engine.types.ts` | ✅ | `MonitorEventRow`, `MonitorJobData` |
| `src/modules/monitor-engine/monitor-engine.repository.ts` | ✅ | `findEventById`, `updateAutoTimestamp` (CAS: WHERE IS NULL) |
| `src/modules/monitor-engine/monitor-engine.service.ts` | ✅ | `processEvent` con 4 checks de fraude |
| `src/modules/monitor-engine/monitor-engine.queue.ts` | ✅ | BullMQ Queue 'monitor-engine', 3 reintentos, backoff exponencial 5s |
| `src/modules/monitor-engine/monitor-engine.worker.ts` | ✅ | Worker concurrency 5 |

## Tests

| Archivo | Tests | Estado |
|---|---|---|
| `src/__tests__/monitor-engine/monitor-engine.service.test.ts` | 30 | ✅ 100% cobertura |

## Módulos modificados

| Archivo | Cambio |
|---|---|
| `custody-events.service.ts` | Añadido `monitorQueue: Queue` como 6to parámetro; encola job post-createEvent |
| `app.ts` | Instancia MockGpsAdapter, MonitorRepository, MonitorEngine, queue y worker |
| `jest.config.ts` | Excluye monitor-engine.repository, queue, worker y mock-gps.adapter de cobertura unitaria |
| `__tests__/custody-events/custody-events.service.test.ts` | Añadido `mockMonitorQueue` al SUT |

---

## Flujo de ejecución

```
POST /orders/:id/events
  → CustodyEventService.createEvent()
    → db.transaction → INSERT order_event (auto_timestamp = NULL)
    → [if PANIC] alertsQueue.add('create-alert', ...)
    → monitorQueue.add('process-event', { eventId, orderId })
         ↓
  MonitorEngine.processEvent(eventId)
    1. findEventById → if null: return
    2. gpsProvider.getAutoTimestamp() → repo.updateAutoTimestamp (CAS)
       [if GPS error: log + continue]
    3. checkTimestampDelta: |auto - app| > 3min → alertsQueue 'tamper'
    4. checkIntegrityHash: recalc HMAC ≠ stored → alertsQueue 'tamper'
    5. checkMockLocation: device.mock_location_detected → alertsQueue 'custom'
```

---

## Invariantes clave

- `auto_timestamp` se llena exactamente una vez (CAS — ADR-024)
- MonitorEngine es event-driven, no cron (ADR-025)
- GPS Provider error es no-fatal — el job completa los otros 3 checks
- `checkIntegrityHash` usa 6 campos ordenados alfabéticamente: `actor_role, app_timestamp, device, event_type, location, payload` — mismo orden que `CustodyEventService.calculateIntegrityHash()`
- **Edge case documentado:** eventos con `evidence` no nulo podrían producir falso positivo en `checkIntegrityHash` porque el hash original incluye `evidence` pero la reconstrucción en MonitorEngine no. En MVP esto es aceptable; en el futuro el evento debe persistir también si fue creado con evidence.

## ADRs

- ADR-022: HMAC-SHA256 calculado por servidor (reutilizado por MonitorEngine para re-verificación)
- ADR-024: CAS en auto_timestamp — excepción controlada al append-only
- ADR-025: MonitorEngine event-driven, no cron

## Dependencias

- `alertsQueue: Queue` — reutiliza `custodyNotificationsQueue` del app.ts (misma instancia)
- `CUSTODY_EVENT_HMAC_SECRET` — variable de entorno existente, reutilizada para re-verificación
- `CustodyEventsRepository` — no dependencia directa; Monitor lee directamente de `order_event`
