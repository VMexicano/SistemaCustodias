# Tasks — Sprint 15: Monitor Engine

## Resumen

| ID | Título | Tipo | Estado |
|---|---|---|---|
| MON-001 | IGpsProvider + MockGpsAdapter + MonitorRepository | FEATURE | 🔲 |
| MON-002 | MonitorEngine service (fraud detection) | FEATURE | 🔲 |
| MON-003 | BullMQ queue + worker + wiring | FEATURE | 🔲 |
| MON-QA-001 | Tests MonitorEngine 100% cobertura | QA_ONLY | 🔲 |

---

## Grafo de dependencias

```
MON-001 → MON-002 → MON-003 → MON-QA-001
```

## Grupos de ejecución

- **Grupo 1 (inicio inmediato):** MON-001
- **Grupo 2 (espera MON-001 ✅):** MON-002
- **Grupo 3 (espera MON-002 ✅):** MON-003
- **Grupo 4 (espera MON-003 ✅):** MON-QA-001

---

## MON-001 — IGpsProvider + MockGpsAdapter + MonitorRepository

### Checklist planner
- [x] Tipo: FEATURE
- [x] Sprint: 15
- [x] Agentes: backend
- [x] Depende de: ninguna
- [x] Scope in: IGpsProvider interface, MockGpsAdapter, MonitorRepository (findEventById + updateAutoTimestamp CAS)
- [x] Scope out: WinlogAdapter, HTTP call a proveedor externo, endpoints REST
- [x] Criterio negocio: el sistema puede obtener auto_timestamp de un proveedor intercambiable
- [x] Criterio técnico: TypeScript 0 errores, CAS usa WHERE auto_timestamp IS NULL
- [x] Irreversible: no

### Archivos a crear
```
apps/api/src/shared/gps/gps-provider.interface.ts
apps/api/src/shared/gps/mock-gps.adapter.ts
apps/api/src/modules/monitor-engine/monitor-engine.repository.ts
apps/api/src/modules/monitor-engine/monitor-engine.types.ts
```

### Spec de implementación
```typescript
// gps-provider.interface.ts
export interface IGpsProvider {
  getAutoTimestamp(orderId: string, vehicleId: string | null): Promise<Date>;
}

// mock-gps.adapter.ts
export class MockGpsAdapter implements IGpsProvider {
  async getAutoTimestamp(_orderId: string, _vehicleId: string | null): Promise<Date> {
    const offsetMs = Math.floor(Math.random() * 120_000); // 0-120s
    return new Date(Date.now() - offsetMs);
  }
}

// monitor-engine.repository.ts
export class MonitorRepository {
  constructor(private readonly db: Database) {}

  async findEventById(eventId: string): Promise<MonitorEventRow | null> {
    const row = await this.db<MonitorEventRow>('order_event')
      .where({ id: eventId })
      .first();
    return row ?? null;
  }

  async updateAutoTimestamp(eventId: string, ts: Date): Promise<void> {
    await this.db('order_event')
      .where({ id: eventId })
      .whereNull('auto_timestamp')        // CAS — ADR-024
      .update({ auto_timestamp: ts });
  }
}
```

### TDD — tests para MON-QA-001 (referencia)
- MonitorRepository no se testea unitariamente (integration-only, excluir de jest.config.ts)

---

## MON-002 — MonitorEngine service

### Checklist planner
- [x] Tipo: FEATURE
- [x] Sprint: 15
- [x] Agentes: backend
- [x] Depende de: MON-001
- [x] Scope in: MonitorEngine.processEvent() con 4 checks, alertsQueue side-effects
- [x] Scope out: WebSocket, notificaciones push, suspensión de operador
- [x] Criterio negocio: fraude detectado → supervisor recibe alerta automática
- [x] Criterio técnico: TypeScript 0 errores, side-effects fuera de transacción (ADR-003)
- [x] Irreversible: no

### Archivos a crear/modificar
```
apps/api/src/modules/monitor-engine/monitor-engine.service.ts   [CREAR]
```

### Spec de implementación
```typescript
const TIMESTAMP_DELTA_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutos

export class MonitorEngine {
  constructor(
    private readonly repo: MonitorRepository,
    private readonly gpsProvider: IGpsProvider,
    private readonly alertsQueue: Queue,
    private readonly hmacSecret: string,
  ) {}

  async processEvent(eventId: string): Promise<void> {
    const event = await this.repo.findEventById(eventId);
    if (!event) return; // evento no encontrado — log y salir

    // 1. Obtener auto_timestamp del GPS Provider
    let autoTs: Date | null = null;
    try {
      autoTs = await this.gpsProvider.getAutoTimestamp(event.order_id, null);
      await this.repo.updateAutoTimestamp(eventId, autoTs);
    } catch (err) {
      // GPS Provider error es no-fatal — continuar con los otros checks
      console.error('[MonitorEngine] GPS provider error:', err);
    }

    // 2. Check delta de timestamps (solo si auto_timestamp obtenido)
    if (autoTs !== null) {
      await this.checkTimestampDelta(event, autoTs);
    }

    // 3. Check integrity hash
    await this.checkIntegrityHash(event);

    // 4. Check mock location
    await this.checkMockLocation(event);
  }

  private async checkTimestampDelta(event: MonitorEventRow, autoTs: Date): Promise<void> {
    const deltaMs = Math.abs(autoTs.getTime() - new Date(event.app_timestamp).getTime());
    if (deltaMs > TIMESTAMP_DELTA_THRESHOLD_MS) {
      const deltaSeconds = Math.round(deltaMs / 1000);
      await this.alertsQueue.add('create-alert', {
        type: 'tamper',
        orderId: event.order_id,
        actorId: event.actor_id,
        description: `Timestamp delta ${deltaSeconds}s exceeds 3 min threshold`,
        source: 'monitor-engine',
      });
    }
  }

  private async checkIntegrityHash(event: MonitorEventRow): Promise<void> {
    // Reconstruir el payload original para re-calcular hash
    const canonical: Record<string, unknown> = {
      event_type: event.event_type,
      actor_role: event.actor_role,
      app_timestamp: event.app_timestamp instanceof Date
        ? event.app_timestamp.toISOString()
        : String(event.app_timestamp),
      location: event.location,
      payload: event.payload,
      device: event.device,
    };
    const sortedKeys = Object.keys(canonical).sort();
    const canonicalStr = JSON.stringify(canonical, sortedKeys);
    const recalculated = createHmac('sha256', this.hmacSecret)
      .update(canonicalStr)
      .digest('hex');

    if (recalculated !== event.integrity_hash) {
      await this.alertsQueue.add('create-alert', {
        type: 'tamper',
        orderId: event.order_id,
        actorId: event.actor_id,
        description: 'integrity_hash_mismatch',
        source: 'monitor-engine',
      });
    }
  }

  private async checkMockLocation(event: MonitorEventRow): Promise<void> {
    if (event.device.mock_location_detected === true) {
      await this.alertsQueue.add('create-alert', {
        type: 'custom',
        orderId: event.order_id,
        actorId: event.actor_id,
        description: 'mock_location_detected',
        source: 'monitor-engine',
      });
    }
  }
}
```

**Nota:** `import { createHmac } from 'node:crypto'` — sin deps adicionales.

---

## MON-003 — BullMQ queue + worker + wiring

### Checklist planner
- [x] Tipo: FEATURE
- [x] Sprint: 15
- [x] Agentes: backend
- [x] Depende de: MON-002
- [x] Scope in: queue.ts, worker.ts, actualizar CustodyEventService (6to param monitorQueue), wiring en app.ts
- [x] Scope out: retry logic personalizado
- [x] Criterio negocio: todo evento registrado desencadena verificación de fraude automáticamente
- [x] Criterio técnico: CustodyEventService.createEvent() encola job post-commit, TypeScript 0 errores
- [x] Irreversible: no

### Archivos a crear/modificar
```
apps/api/src/modules/monitor-engine/monitor-engine.queue.ts    [CREAR]
apps/api/src/modules/monitor-engine/monitor-engine.worker.ts   [CREAR]
apps/api/src/modules/custody-events/custody-events.service.ts  [MODIFICAR — añadir monitorQueue]
apps/api/src/app.ts                                            [MODIFICAR — wiring]
apps/api/jest.config.ts                                        [MODIFICAR — excluir monitor repo/worker/routes]
```

### Spec de implementación

```typescript
// monitor-engine.queue.ts
export function createMonitorEngineQueue(connection: Redis): Queue<MonitorJobData> {
  return new Queue<MonitorJobData>('monitor-engine', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}

// monitor-engine.worker.ts
export function registerMonitorEngineWorker(
  monitorEngine: MonitorEngine,
  connection: Redis,
): Worker<MonitorJobData> {
  return new Worker<MonitorJobData>(
    'monitor-engine',
    async (job) => {
      await monitorEngine.processEvent(job.data.eventId);
    },
    { connection, concurrency: 5 },
  );
}

// custody-events.service.ts — MODIFICAR constructor + createEvent
// Añadir: private readonly monitorQueue: Queue como 6to param
// Al final de createEvent, después del if (PANIC):
await this.monitorQueue.add('process-event', { eventId: event.id, orderId });
```

### Wiring en app.ts
```typescript
// Añadir después de la creación de custodyEventsService:
const monitorEngineQueue = createMonitorEngineQueue(redis);
const monitorRepo = new MonitorRepository(db);
const monitorEngine = new MonitorEngine(
  monitorRepo,
  new MockGpsAdapter(),
  alertsQueue,           // reutilizar la queue de alertas existente
  env.CUSTODY_EVENT_HMAC_SECRET,
);
registerMonitorEngineWorker(monitorEngine, redis);

// Actualizar custodyEventsService para pasar monitorEngineQueue como 6to arg
```

### jest.config.ts — exclusiones a añadir
```typescript
// En collectCoverageFrom exclude list:
'!src/modules/monitor-engine/monitor-engine.repository.ts',
'!src/modules/monitor-engine/monitor-engine.queue.ts',
'!src/modules/monitor-engine/monitor-engine.worker.ts',
```

---

## MON-QA-001 — Tests MonitorEngine

### Checklist planner
- [x] Tipo: QA_ONLY
- [x] Sprint: 15
- [x] Agentes: qa
- [x] Depende de: MON-003
- [x] Scope in: MonitorEngine service tests, 100% cobertura lines/branches
- [x] Scope out: MonitorRepository (integration), worker (integration), MockGpsAdapter
- [x] Criterio técnico: npx jest --testPathPattern=monitor-engine → 100% coverage en service.ts
- [x] Irreversible: no

### Archivo de tests
```
apps/api/src/__tests__/monitor-engine/monitor-engine.service.test.ts
```

### TDD — tests mínimos a escribir (≥ 22 tests)

```typescript
describe('MonitorEngine', () => {

  // Setup: mockRepo, mockGpsProvider, mockAlertsQueue, hmacSecret
  // mockRepo.findEventById = jest.fn()
  // mockRepo.updateAutoTimestamp = jest.fn()
  // mockGpsProvider.getAutoTimestamp = jest.fn()
  // mockAlertsQueue.add = jest.fn()

  describe('processEvent', () => {
    it('retorna sin hacer nada si el evento no existe')
    it('llama gpsProvider.getAutoTimestamp con order_id')
    it('llama repo.updateAutoTimestamp con el timestamp obtenido')
    it('continúa con los checks si GPS provider lanza error')
    it('no encola alerta si GPS provider falla (no-fatal)')
  })

  describe('checkTimestampDelta', () => {
    it('no encola alerta si delta <= 3 minutos')
    it('encola alerta tamper si delta > 3 minutos')
    it('incluye el delta exacto en segundos en la descripción')
    it('encola alerta si delta negativo > 3 minutos (app adelantada)')
  })

  describe('checkIntegrityHash', () => {
    it('no encola alerta si hash coincide')
    it('encola alerta tamper si hash no coincide')
    it('recalcula hash con las mismas claves ordenadas que createEvent')
  })

  describe('checkMockLocation', () => {
    it('no encola alerta si mock_location_detected es false')
    it('encola alerta custom si mock_location_detected es true')
    it('usa type: custom y description: mock_location_detected')
  })

  describe('processEvent — flujo completo', () => {
    it('ejecuta los 4 checks en orden para un evento válido')
    it('encola 3 alertas si todas las condiciones de fraude se cumplen')
    it('encola 0 alertas si el evento es completamente legítimo')
    it('no encola alerta de delta si GPS provider falla (solo los otros 2 checks)')
    it('los side-effects van a alertsQueue, no dentro de transacción')
  })
})
```

### Mock pattern recomendado

```typescript
const mockRepo = {
  findEventById: jest.fn(),
  updateAutoTimestamp: jest.fn().mockResolvedValue(undefined),
};
const mockGpsProvider = {
  getAutoTimestamp: jest.fn(),
};
const mockAlertsQueue = {
  add: jest.fn().mockResolvedValue({}),
};

const HMAC_SECRET = 'test-hmac-secret-32-chars-minimum!!';

// Para construir un evento con hash válido en tests:
function buildValidEvent(overrides = {}): MonitorEventRow {
  const base = {
    event_type: 'CHECKPOINT',
    actor_role: 'custodio',
    app_timestamp: new Date('2026-05-18T10:00:00Z'),
    location: { lat: 19.4, long: -99.1, accuracy_meters: 5, provider: 'gps' },
    payload: { route_on_track: true },
    device: { mock_location_detected: false, signal_strength: 'good', ... },
  };
  // Calcular hash igual que MonitorEngine.checkIntegrityHash()
  const canonical = { event_type, actor_role, app_timestamp, location, payload, device };
  const sortedKeys = Object.keys(canonical).sort();
  const hash = createHmac('sha256', HMAC_SECRET)
    .update(JSON.stringify(canonical, sortedKeys))
    .digest('hex');
  return { id: 'evt-1', order_id: 'ord-1', actor_id: 'usr-1', integrity_hash: hash, ...base, ...overrides };
}
```

---

## Definition of Done — Sprint 15

### Por tarea
- [ ] MON-001: IGpsProvider + MockGpsAdapter + MonitorRepository creados — TypeScript 0 errores
- [ ] MON-002: MonitorEngine.processEvent() implementado con los 4 checks — TypeScript 0 errores
- [ ] MON-003: Queue + worker creados, CustodyEventService actualizado (6to param), wiring en app.ts, jest.config.ts actualizado
- [ ] MON-QA-001: ≥ 22 tests pasando — MonitorEngine.service.ts 100% lines/branches

### Sprint completo
- [ ] TypeScript 0 errores en todo el workspace
- [ ] `npx jest --testPathPattern=monitor-engine` → 100% coverage en service.ts
- [ ] `POST /orders/:id/events` encola job en `monitor-engine` queue verificable en Bull Board (localhost:3001)
- [ ] ADR-024 y ADR-025 documentados en docs/13_decisions_log.md
- [ ] context/snapshots/monitor-engine.snapshot.md creado
- [ ] docs/06_memory.md marcado Sprint 15 COMPLETO
- [ ] context/project-index.md actualizado con módulo monitor-engine

---

## Notas por agente

### Backend
- `MockGpsAdapter.getAutoTimestamp()` no recibe Evidence ni payload real — solo orderId/vehicleId
- La re-verificación del hash en `checkIntegrityHash` DEBE usar exactamente el mismo conjunto de campos que `CustodyEventService.calculateIntegrityHash()` — comparar los dos métodos cuidadosamente
- El 6to parámetro de CustodyEventService es `monitorQueue: Queue` — actualizar también el mock en `custody-events.service.test.ts`
- `MonitorRepository` usar `Database` (tipo de Knex configurado en el proyecto), no `Knex` directamente
- No olvidar `removeOnComplete` y `removeOnFail` en las opciones del queue para no llenar Redis

### QA
- Excluir de cobertura: `monitor-engine.repository.ts`, `monitor-engine.queue.ts`, `monitor-engine.worker.ts`, `mock-gps.adapter.ts`
- El mock de `mockRepo.findEventById` devuelve `buildValidEvent()` por defecto en `beforeEach`
- Para el test de "hash coincide": calcular el hash correcto con `createHmac` en el helper `buildValidEvent`
- Para el test de "hash no coincide": modificar cualquier campo del evento después de construirlo
- Verificar que `custody-events.service.test.ts` sigue pasando tras añadir `monitorQueue` al constructor (añadir mock)
