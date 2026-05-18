# Design — Sprint 15: Monitor Engine

## Arquitectura al finalizar el sprint

```
POST /orders/:id/events
        │
        ▼
CustodyEventService.createEvent()
        │
        ├─── db.transaction()
        │       ├── getNextSequenceNo (FOR UPDATE)
        │       └── repo.create() → order_event row (auto_timestamp = NULL)
        │
        ├─── if PANIC: alertsQueue.add('create-alert', ...)   [ya existía]
        │
        └─── monitorQueue.add('process-event', { eventId, orderId })  [NUEVO Sprint 15]
                                │
                                ▼
                    monitor-engine.worker.ts
                                │
                                ▼
                    MonitorEngine.processEvent(eventId)
                                │
                    ┌───────────┼───────────────────┐
                    ▼           ▼                   ▼
              [1] fillAutoTs  [2] checkDelta   [3] checkHash   [4] checkMock
                    │               │                │               │
              gpsProvider     |delta| > 3min   recalc HMAC    device.mock=true
              .getAutoTs()         │                │               │
                    │          tamper alert    tamper alert    custom alert
              repo.updateAutoTs                                      │
              (CAS: WHERE IS NULL)                                   │
                                                    └───────────────►alertsQueue
```

---

## Estructura de directorios

```
apps/api/src/
├── modules/
│   └── monitor-engine/                        [NUEVO]
│       ├── monitor-engine.types.ts
│       ├── monitor-engine.repository.ts
│       ├── monitor-engine.service.ts          (MonitorEngine)
│       ├── monitor-engine.queue.ts
│       └── monitor-engine.worker.ts
├── shared/
│   └── gps/                                   [NUEVO]
│       ├── gps-provider.interface.ts          (IGpsProvider)
│       └── mock-gps.adapter.ts               (MockGpsAdapter)
```

---

## Interfaces TypeScript

### IGpsProvider

```typescript
// apps/api/src/shared/gps/gps-provider.interface.ts

export interface IGpsProvider {
  getAutoTimestamp(orderId: string, vehicleId: string | null): Promise<Date>;
}
```

### MockGpsAdapter

```typescript
// apps/api/src/shared/gps/mock-gps.adapter.ts

export class MockGpsAdapter implements IGpsProvider {
  async getAutoTimestamp(orderId: string, _vehicleId: string | null): Promise<Date> {
    // Simula proveedor GPS: offset de 0-120 segundos respecto a now
    // En producción, WinlogAdapter haría HTTP call al proveedor
    const offsetMs = Math.floor(Math.random() * 120_000);
    return new Date(Date.now() - offsetMs);
  }
}
```

### MonitorRepository

```typescript
// apps/api/src/modules/monitor-engine/monitor-engine.repository.ts

export interface MonitorEventRow {
  id: string;
  order_id: string;
  actor_id: string | null;
  actor_role: string;
  event_type: string;
  app_timestamp: Date;
  auto_timestamp: Date | null;
  location: Record<string, unknown>;
  payload: Record<string, unknown>;
  device: { mock_location_detected: boolean; [key: string]: unknown };
  integrity_hash: string;
}

export class MonitorRepository {
  constructor(private readonly db: Database) {}

  async findEventById(eventId: string): Promise<MonitorEventRow | null>

  // CAS: solo escribe si auto_timestamp IS NULL
  async updateAutoTimestamp(eventId: string, ts: Date): Promise<void>
    // UPDATE order_event SET auto_timestamp = ? WHERE id = ? AND auto_timestamp IS NULL
}
```

### MonitorEngine

```typescript
// apps/api/src/modules/monitor-engine/monitor-engine.service.ts

export class MonitorEngine {
  constructor(
    private readonly repo: MonitorRepository,
    private readonly gpsProvider: IGpsProvider,
    private readonly alertsQueue: Queue,
    private readonly hmacSecret: string,
  ) {}

  async processEvent(eventId: string): Promise<void>
    // 1. findEventById → null → log + return (order may be deleted)
    // 2. getAutoTimestamp(order_id, null) → updateAutoTimestamp(CAS)
    // 3. checkTimestampDelta(app_timestamp, autoTs)
    // 4. checkIntegrityHash(event)
    // 5. checkMockLocation(event)
    // Each check: if alert condition → alertsQueue.add('create-alert', {...}) [outside any trx]
    // GPS Provider error: catch → log → continue with remaining checks

  private async checkTimestampDelta(
    eventId: string, orderId: string, actorId: string | null,
    appTs: Date, autoTs: Date,
  ): Promise<void>
    // |autoTs.getTime() - appTs.getTime()| > 3 * 60 * 1000
    // → alertsQueue.add('create-alert', { type: 'tamper', orderId, actorId,
    //     description: `Timestamp delta ${deltaSeconds}s exceeds 3 min threshold` })

  private async checkIntegrityHash(event: MonitorEventRow): Promise<void>
    // Reconstruir CreateCustodyEventPayload desde el row
    // recalcular HMAC-SHA256 con hmacSecret
    // si !== event.integrity_hash → alertsQueue.add('create-alert', { type: 'tamper', ... })

  private async checkMockLocation(event: MonitorEventRow): Promise<void>
    // if event.device.mock_location_detected === true
    // → alertsQueue.add('create-alert', { type: 'custom', description: 'mock_location_detected', ... })
}
```

### MonitorJobData

```typescript
// apps/api/src/modules/monitor-engine/monitor-engine.types.ts

export interface MonitorJobData {
  eventId: string;
  orderId: string;
}
```

---

## BullMQ Queue y Worker

```typescript
// apps/api/src/modules/monitor-engine/monitor-engine.queue.ts
import { Queue } from 'bullmq';
export function createMonitorEngineQueue(connection: Redis): Queue<MonitorJobData> {
  return new Queue('monitor-engine', {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  });
}

// apps/api/src/modules/monitor-engine/monitor-engine.worker.ts
import { Worker } from 'bullmq';
export function registerMonitorEngineWorker(
  monitorEngine: MonitorEngine,
  connection: Redis,
): Worker {
  return new Worker<MonitorJobData>(
    'monitor-engine',
    async (job) => {
      await monitorEngine.processEvent(job.data.eventId);
    },
    { connection, concurrency: 5 },
  );
}
```

---

## Cambio en CustodyEventService

```typescript
// Añadir monitorQueue como 6to parámetro del constructor
export class CustodyEventService {
  constructor(
    private readonly repo: CustodyEventsRepository,
    private readonly ordersRepo: CustodyOrdersRepository,
    private readonly alertsQueue: Queue,
    private readonly hmacSecret: string,
    private readonly db: Knex,
    private readonly monitorQueue: Queue,          // NUEVO
  ) {}

  async createEvent(...): Promise<OrderEventDTO> {
    // ... lógica existente ...

    // 8. Side effects fuera de transacción (ADR-003)
    if (data.event_type === 'PANIC') {
      await this.alertsQueue.add('create-alert', { ... });
    }

    // 9. Encolar verificación de Monitor Engine (NUEVO)
    await this.monitorQueue.add('process-event', {
      eventId: event.id,
      orderId,
    });

    return toEventDTO(event, true);
  }
}
```

---

## Wiring en app.ts

```typescript
// Nuevas instancias a crear:
const mockGpsAdapter = new MockGpsAdapter();
const monitorEngineQueue = createMonitorEngineQueue(redisConnection);
const monitorRepo = new MonitorRepository(db);
const monitorEngine = new MonitorEngine(
  monitorRepo,
  mockGpsAdapter,
  alertsQueue,
  env.CUSTODY_EVENT_HMAC_SECRET,
);
registerMonitorEngineWorker(monitorEngine, redisConnection);

// Actualizar CustodyEventService para recibir monitorEngineQueue como 6to arg
```

---

## Variables de entorno nuevas

Ninguna — se reutiliza `CUSTODY_EVENT_HMAC_SECRET` para la re-verificación del hash.

---

## ADRs aplicables

| ADR | Decisión |
|---|---|
| ADR-003 | Side-effects fuera de transacciones → BullMQ |
| ADR-022 | integrity_hash calculado por servidor con HMAC-SHA256 |
| ADR-024 (nueva) | CAS en order_event.auto_timestamp: UPDATE WHERE auto_timestamp IS NULL |
| ADR-025 (nueva) | MonitorEngine event-driven (no cron): un job por evento, latencia mínima |

### ADR-024 — CAS en order_event.auto_timestamp

**Fecha:** 2026-05-18 · **Estado:** Vigente · **Área:** persistence

**Contexto:** `order_event` es append-only por diseño de cadena de custodia, pero `auto_timestamp` llega por canal separado (GPS Provider) y no puede incluirse en el INSERT original.

**Decisión:** Permitir un único UPDATE condicional: `UPDATE order_event SET auto_timestamp = ? WHERE id = ? AND auto_timestamp IS NULL`. Si ya tiene valor, la operación es no-op. El registro no puede ser alterado retroactivamente.

**Consecuencias:**
- Facilita: completar el registro sin violar la inmutabilidad semántica
- Complica: requiere que el Monitor Engine maneje el caso de timestamp ya presente
- Criterio de revisión: si se necesita corregir un auto_timestamp erróneo, requiere intervención manual de DBA

### ADR-025 — MonitorEngine event-driven (no cron)

**Fecha:** 2026-05-18 · **Estado:** Vigente · **Área:** architecture

**Contexto:** La arquitectura original describe un "Monitor Engine (ciclo 15 min)". Para MVP con MockGpsAdapter, un cron sería overhead innecesario.

**Decisión:** MonitorEngine se activa por BullMQ job encolado en `CustodyEventService.createEvent()`. Un job por evento. Latencia típica: < 5 segundos.

**Consecuencias:**
- Facilita: latencia mínima para detección de fraude, sin scan periódico
- Complica: si el GPS Provider real es push (no pull), el modelo cambia
- Criterio de revisión: cuando se integre WinlogAdapter real, evaluar si el modelo debe cambiar a pub-sub
