// ---------------------------------------------------------------------------
// monitor-engine.service.test.ts — unit tests for MonitorEngine
// Target: 100% line + branch + function coverage on monitor-engine.service.ts
// ---------------------------------------------------------------------------

import { createHmac } from 'node:crypto';
import { MonitorEngine } from '../../modules/monitor-engine/monitor-engine.service.js';
import type { MonitorEventRow } from '../../modules/monitor-engine/monitor-engine.repository.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HMAC_SECRET = 'test-hmac-secret-32-chars-minimum-xx';

// ---------------------------------------------------------------------------
// Mocks (plain objects with jest.fn())
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helper: compute a valid integrity hash for a given event row
// Must replicate exactly the canonical object built in checkIntegrityHash()
// Fields: event_type, actor_role, app_timestamp, location, payload, device
// Sorted alphabetically before JSON.stringify
// ---------------------------------------------------------------------------

function computeIntegrityHash(
  event: Pick<
    MonitorEventRow,
    'event_type' | 'actor_role' | 'app_timestamp' | 'location' | 'payload' | 'device'
  >,
  secret: string,
): string {
  const canonical: Record<string, unknown> = {
    event_type: event.event_type,
    actor_role: event.actor_role,
    app_timestamp:
      event.app_timestamp instanceof Date
        ? event.app_timestamp.toISOString()
        : String(event.app_timestamp),
    location: event.location,
    payload: event.payload,
    device: event.device,
  };
  const sortedKeys = Object.keys(canonical).sort();
  const canonicalStr = JSON.stringify(canonical, sortedKeys);
  return createHmac('sha256', secret).update(canonicalStr).digest('hex');
}

// ---------------------------------------------------------------------------
// Helper: build a base event with a VALID integrity hash
// ---------------------------------------------------------------------------

function buildValidEvent(overrides: Partial<MonitorEventRow> = {}): MonitorEventRow {
  const base: Omit<MonitorEventRow, 'integrity_hash'> = {
    id: 'event-uuid-1',
    order_id: 'order-uuid-1',
    actor_id: 'user-uuid-1',
    actor_role: 'custodio',
    event_type: 'CHECKPOINT',
    app_timestamp: new Date('2026-05-18T12:00:00.000Z'),
    auto_timestamp: null,
    location: { lat: 25.6866, long: -100.3161, accuracy_meters: 5.0, provider: 'gps' },
    payload: { route_on_track: true, vehicle_secured: true, cargo_intact: true },
    device: {
      battery_percent: 80,
      signal_strength: 'good',
      app_version: '1.0.0',
      os: 'android',
      mock_location_detected: false,
    },
    ...overrides,
  };

  const integrity_hash = computeIntegrityHash(base, HMAC_SECRET);
  return { ...base, integrity_hash, ...('integrity_hash' in overrides ? { integrity_hash: overrides.integrity_hash as string } : {}) };
}

// ---------------------------------------------------------------------------
// SUT factory
// ---------------------------------------------------------------------------

function makeEngine(): MonitorEngine {
  return new MonitorEngine(
    mockRepo as never,
    mockGpsProvider as never,
    mockAlertsQueue as never,
    HMAC_SECRET,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockRepo.updateAutoTimestamp.mockResolvedValue(undefined);
  mockAlertsQueue.add.mockResolvedValue({});
});

// ===========================================================================
// processEvent — event not found
// ===========================================================================

describe('processEvent — event not found', () => {
  it('retorna sin error cuando el evento no existe en repo', async () => {
    mockRepo.findEventById.mockResolvedValue(null);
    const engine = makeEngine();

    await expect(engine.processEvent('missing-event-id')).resolves.toBeUndefined();
    expect(mockRepo.findEventById).toHaveBeenCalledWith('missing-event-id');
  });

  it('no llama a gpsProvider ni encola alertas cuando el evento no existe', async () => {
    mockRepo.findEventById.mockResolvedValue(null);
    const engine = makeEngine();

    await engine.processEvent('missing-event-id');

    expect(mockGpsProvider.getAutoTimestamp).not.toHaveBeenCalled();
    expect(mockAlertsQueue.add).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// processEvent — GPS provider happy path
// ===========================================================================

describe('processEvent — GPS provider interaction', () => {
  it('llama gpsProvider.getAutoTimestamp con order_id del evento', async () => {
    const event = buildValidEvent();
    mockRepo.findEventById.mockResolvedValue(event);
    const autoTs = new Date('2026-05-18T12:00:30.000Z'); // 30s delta — under threshold
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockGpsProvider.getAutoTimestamp).toHaveBeenCalledWith(event.order_id, null);
  });

  it('llama repo.updateAutoTimestamp con el Date obtenido del GPS provider', async () => {
    const event = buildValidEvent();
    mockRepo.findEventById.mockResolvedValue(event);
    const autoTs = new Date('2026-05-18T12:00:30.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockRepo.updateAutoTimestamp).toHaveBeenCalledWith(event.id, autoTs);
  });
});

// ===========================================================================
// processEvent — GPS provider error (non-fatal)
// ===========================================================================

describe('processEvent — GPS provider error (non-fatal)', () => {
  it('no propaga el error del GPS provider — continúa procesando', async () => {
    const event = buildValidEvent();
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS timeout'));
    const engine = makeEngine();

    // Must NOT throw
    await expect(engine.processEvent(event.id)).resolves.toBeUndefined();
  });

  it('NO encola alerta de tamper cuando el GPS provider falla (error no-fatal)', async () => {
    const event = buildValidEvent();
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS timeout'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    // No timestamp-delta alert — GPS failed so autoTs is null
    // Only integrity and mock-location checks run; both are clean for this event
    expect(mockAlertsQueue.add).not.toHaveBeenCalled();
  });

  it('no llama repo.updateAutoTimestamp cuando el GPS provider falla', async () => {
    const event = buildValidEvent();
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS timeout'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockRepo.updateAutoTimestamp).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// checkTimestampDelta — via processEvent
// ===========================================================================

describe('checkTimestampDelta', () => {
  it('delta ≤ 3 minutos → NO encola alerta de tamper', async () => {
    const event = buildValidEvent({ app_timestamp: new Date('2026-05-18T12:00:00.000Z') });
    mockRepo.findEventById.mockResolvedValue(event);
    // 2 min 59 sec = 179 000 ms — below threshold
    const autoTs = new Date('2026-05-18T12:02:59.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const tamperCalls = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => (data as Record<string, unknown>).description !== 'integrity_hash_mismatch' &&
                    (data as Record<string, unknown>).description !== 'mock_location_detected' &&
                    String((data as Record<string, unknown>).description).includes('Timestamp'),
    );
    expect(tamperCalls).toHaveLength(0);
  });

  it('delta exactamente 3 minutos (180 000 ms) → NO encola alerta (non-strict)', async () => {
    const event = buildValidEvent({ app_timestamp: new Date('2026-05-18T12:00:00.000Z') });
    mockRepo.findEventById.mockResolvedValue(event);
    const autoTs = new Date('2026-05-18T12:03:00.000Z'); // exactly 3 min
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const timestampAlerts = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => String((data as Record<string, unknown>).description).includes('Timestamp'),
    );
    expect(timestampAlerts).toHaveLength(0);
  });

  it('delta > 3 minutos → encola alerta type: tamper', async () => {
    const event = buildValidEvent({ app_timestamp: new Date('2026-05-18T12:00:00.000Z') });
    mockRepo.findEventById.mockResolvedValue(event);
    // 3 min 1 sec = 181 000 ms — above threshold
    const autoTs = new Date('2026-05-18T12:03:01.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({ type: 'tamper' }),
    );
  });

  it('delta > 3 minutos → la descripción incluye los segundos exactos', async () => {
    const event = buildValidEvent({ app_timestamp: new Date('2026-05-18T12:00:00.000Z') });
    mockRepo.findEventById.mockResolvedValue(event);
    // 5 min = 300 000 ms → 300 seconds
    const autoTs = new Date('2026-05-18T12:05:00.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const call = (mockAlertsQueue.add as jest.Mock).mock.calls.find(
      ([, data]) => String((data as Record<string, unknown>).description).includes('300s'),
    );
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({
      description: 'Timestamp delta 300s exceeds 3 min threshold',
    });
  });

  it('delta negativo mayor a 3 min (app adelantada) → encola alerta', async () => {
    const event = buildValidEvent({ app_timestamp: new Date('2026-05-18T12:10:00.000Z') });
    mockRepo.findEventById.mockResolvedValue(event);
    // autoTs is 5 min BEFORE app_timestamp — absolute delta = 300s
    const autoTs = new Date('2026-05-18T12:05:00.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({
        type: 'tamper',
        description: 'Timestamp delta 300s exceeds 3 min threshold',
      }),
    );
  });

  it('alerta de delta contiene orderId y actorId correctos', async () => {
    const event = buildValidEvent({
      order_id: 'order-abc',
      actor_id: 'actor-xyz',
      app_timestamp: new Date('2026-05-18T12:00:00.000Z'),
    });
    mockRepo.findEventById.mockResolvedValue(event);
    const autoTs = new Date('2026-05-18T12:10:00.000Z'); // 10 min
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({
        orderId: 'order-abc',
        actorId: 'actor-xyz',
        source: 'monitor-engine',
      }),
    );
  });
});

// ===========================================================================
// checkIntegrityHash — via processEvent
// ===========================================================================

describe('checkIntegrityHash', () => {
  it('hash correcto → NO encola alerta de tamper por hash', async () => {
    const event = buildValidEvent(); // hash is computed to be valid
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(new Date('2026-05-18T12:00:30.000Z'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const hashAlerts = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => (data as Record<string, unknown>).description === 'integrity_hash_mismatch',
    );
    expect(hashAlerts).toHaveLength(0);
  });

  it('hash incorrecto → encola alerta type: tamper', async () => {
    const event = buildValidEvent({ integrity_hash: 'bad'.repeat(21) + 'x' }); // 64 chars of garbage
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(new Date('2026-05-18T12:00:30.000Z'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({ type: 'tamper', description: 'integrity_hash_mismatch' }),
    );
  });

  it('hash incorrecto → la descripción es exactamente integrity_hash_mismatch', async () => {
    const event = buildValidEvent({ integrity_hash: 'a'.repeat(64) });
    mockRepo.findEventById.mockResolvedValue(event);
    // GPS fails → only hash and mock-location checks run
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const hashAlert = (mockAlertsQueue.add as jest.Mock).mock.calls.find(
      ([, data]) => (data as Record<string, unknown>).description === 'integrity_hash_mismatch',
    );
    expect(hashAlert).toBeDefined();
  });

  it('hash incorrecto → alerta contiene orderId y actorId correctos', async () => {
    const event = buildValidEvent({
      order_id: 'order-hash-test',
      actor_id: 'actor-hash-test',
      integrity_hash: 'deadbeef'.repeat(8), // invalid hash
    });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({
        orderId: 'order-hash-test',
        actorId: 'actor-hash-test',
        source: 'monitor-engine',
      }),
    );
  });

  it('app_timestamp como string en BD → hash se recalcula con String() y compara correctamente', async () => {
    // Simulate DB returning app_timestamp as a string (not a Date object)
    const tsString = '2026-05-18T12:00:00.000Z';
    const baseFields = {
      event_type: 'CHECKPOINT',
      actor_role: 'custodio',
      app_timestamp: tsString as unknown as Date, // string from DB
      location: { lat: 25.6866, long: -100.3161, accuracy_meters: 5.0, provider: 'gps' },
      payload: { route_on_track: true, vehicle_secured: true, cargo_intact: true },
      device: { battery_percent: 80, signal_strength: 'good', app_version: '1.0.0', os: 'android', mock_location_detected: false },
    };
    // Compute hash as the service would: String(non-Date)
    const canonical: Record<string, unknown> = {
      event_type: baseFields.event_type,
      actor_role: baseFields.actor_role,
      app_timestamp: String(baseFields.app_timestamp), // non-Date path
      location: baseFields.location,
      payload: baseFields.payload,
      device: baseFields.device,
    };
    const sortedKeys = Object.keys(canonical).sort();
    const correctHash = createHmac('sha256', HMAC_SECRET)
      .update(JSON.stringify(canonical, sortedKeys))
      .digest('hex');

    const event: MonitorEventRow = {
      id: 'event-str-ts',
      order_id: 'order-str-ts',
      actor_id: 'actor-str-ts',
      auto_timestamp: null,
      integrity_hash: correctHash,
      ...baseFields,
    };
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    // Hash matches → no integrity alert
    const hashAlerts = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => (data as Record<string, unknown>).description === 'integrity_hash_mismatch',
    );
    expect(hashAlerts).toHaveLength(0);
  });
});

// ===========================================================================
// checkMockLocation — via processEvent
// ===========================================================================

describe('checkMockLocation', () => {
  it('mock_location_detected false → NO encola alerta de mock_location', async () => {
    const event = buildValidEvent({ device: { mock_location_detected: false, battery_percent: 80 } });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(new Date('2026-05-18T12:00:30.000Z'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const mockAlerts = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => (data as Record<string, unknown>).description === 'mock_location_detected',
    );
    expect(mockAlerts).toHaveLength(0);
  });

  it('mock_location_detected true → encola alerta type: custom', async () => {
    const event = buildValidEvent({ device: { mock_location_detected: true, battery_percent: 80 } });
    // Recompute hash with the new device value
    const correctHash = computeIntegrityHash(event, HMAC_SECRET);
    event.integrity_hash = correctHash;
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(new Date('2026-05-18T12:00:30.000Z'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({ type: 'custom', description: 'mock_location_detected' }),
    );
  });

  it('mock_location_detected true → la descripción es exactamente mock_location_detected', async () => {
    const device = { mock_location_detected: true, battery_percent: 80, signal_strength: 'good', app_version: '1.0.0', os: 'android' };
    const event = buildValidEvent({ device });
    event.integrity_hash = computeIntegrityHash(event, HMAC_SECRET);
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const mockAlert = (mockAlertsQueue.add as jest.Mock).mock.calls.find(
      ([, data]) => (data as Record<string, unknown>).description === 'mock_location_detected',
    );
    expect(mockAlert).toBeDefined();
    expect(mockAlert?.[0]).toBe('create-alert');
  });

  it('mock_location_detected true → alerta contiene orderId y actorId correctos', async () => {
    const device = { mock_location_detected: true, battery_percent: 80 };
    const event = buildValidEvent({ order_id: 'order-mock-test', actor_id: 'actor-mock-test', device });
    event.integrity_hash = computeIntegrityHash(event, HMAC_SECRET);
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({
        type: 'custom',
        orderId: 'order-mock-test',
        actorId: 'actor-mock-test',
        source: 'monitor-engine',
      }),
    );
  });
});

// ===========================================================================
// processEvent — end-to-end integration scenarios
// ===========================================================================

describe('processEvent — escenarios completos', () => {
  it('evento legítimo (GPS ok, hash ok, no mock) → 0 alertas encoladas', async () => {
    const event = buildValidEvent({ app_timestamp: new Date('2026-05-18T12:00:00.000Z') });
    mockRepo.findEventById.mockResolvedValue(event);
    // autoTs 30 sec after — under threshold
    const autoTs = new Date('2026-05-18T12:00:30.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).not.toHaveBeenCalled();
  });

  it('GPS falla → solo checkIntegrityHash y checkMockLocation se ejecutan (sin checkTimestampDelta)', async () => {
    const event = buildValidEvent();
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    // Hash is valid + no mock location → 0 alerts
    expect(mockAlertsQueue.add).not.toHaveBeenCalled();
    // Confirm GPS was called but updateAutoTimestamp was NOT
    expect(mockGpsProvider.getAutoTimestamp).toHaveBeenCalled();
    expect(mockRepo.updateAutoTimestamp).not.toHaveBeenCalled();
  });

  it('todas las condiciones de fraude (delta>3min + hash mal + mock) → 3 alertas encoladas', async () => {
    const device = { mock_location_detected: true, battery_percent: 20 };
    const event = buildValidEvent({
      app_timestamp: new Date('2026-05-18T12:00:00.000Z'),
      device,
      integrity_hash: 'a'.repeat(64), // deliberately wrong hash
    });
    mockRepo.findEventById.mockResolvedValue(event);
    // 10 min delta — well above threshold
    const autoTs = new Date('2026-05-18T12:10:00.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledTimes(3);
  });

  it('mock_location + delta > 3min + hash correcto → exactamente 2 alertas', async () => {
    const device = { mock_location_detected: true, battery_percent: 80, signal_strength: 'good', app_version: '1.0.0', os: 'android' };
    const appTs = new Date('2026-05-18T12:00:00.000Z');
    const event = buildValidEvent({
      app_timestamp: appTs,
      device,
    });
    // Recompute hash with mock_location device
    event.integrity_hash = computeIntegrityHash(event, HMAC_SECRET);
    mockRepo.findEventById.mockResolvedValue(event);
    // 5 min delta
    const autoTs = new Date('2026-05-18T12:05:00.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    // Alerts: 1 timestamp-delta + 1 mock_location = 2
    expect(mockAlertsQueue.add).toHaveBeenCalledTimes(2);
  });

  it('mock_location + delta > 3min + hash mal → 3 alertas (todas a la vez)', async () => {
    const device = { mock_location_detected: true, battery_percent: 20 };
    const event = buildValidEvent({
      order_id: 'order-fraud',
      actor_id: 'actor-fraud',
      app_timestamp: new Date('2026-05-18T12:00:00.000Z'),
      device,
      integrity_hash: 'badbadbad'.repeat(7) + 'b', // invalid hash (63+1=64)
    });
    mockRepo.findEventById.mockResolvedValue(event);
    const autoTs = new Date('2026-05-18T12:10:00.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledTimes(3);

    const calls = (mockAlertsQueue.add as jest.Mock).mock.calls as Array<[string, Record<string, unknown>]>;
    const descriptions = calls.map(([, data]) => data.description as string);
    expect(descriptions).toContain('integrity_hash_mismatch');
    expect(descriptions).toContain('mock_location_detected');
    expect(descriptions.some((d) => d.includes('Timestamp delta'))).toBe(true);
  });

  it('todas las alertas tienen orderId y actorId correctos', async () => {
    const device = { mock_location_detected: true, battery_percent: 20 };
    const event = buildValidEvent({
      order_id: 'order-check-ids',
      actor_id: 'actor-check-ids',
      app_timestamp: new Date('2026-05-18T12:00:00.000Z'),
      device,
      integrity_hash: 'a'.repeat(64), // invalid
    });
    mockRepo.findEventById.mockResolvedValue(event);
    const autoTs = new Date('2026-05-18T12:10:00.000Z');
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const calls = (mockAlertsQueue.add as jest.Mock).mock.calls as Array<[string, Record<string, unknown>]>;
    for (const [jobName, data] of calls) {
      expect(jobName).toBe('create-alert');
      expect(data.orderId).toBe('order-check-ids');
      expect(data.actorId).toBe('actor-check-ids');
      expect(data.source).toBe('monitor-engine');
    }
  });

  it('GPS falla + hash mal → solo 1 alerta (integrity_hash_mismatch)', async () => {
    const event = buildValidEvent({
      integrity_hash: 'a'.repeat(64), // deliberately wrong
    });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledTimes(1);
    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({ description: 'integrity_hash_mismatch' }),
    );
  });

  it('GPS falla + mock_location → solo 1 alerta (mock_location_detected)', async () => {
    const device = { mock_location_detected: true, battery_percent: 20 };
    const event = buildValidEvent({ device });
    event.integrity_hash = computeIntegrityHash(event, HMAC_SECRET); // valid hash
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledTimes(1);
    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({ description: 'mock_location_detected', type: 'custom' }),
    );
  });
});

// ===========================================================================
// Casos edge — actor_id, actor_role, event_type
// ===========================================================================

describe('processEvent — casos edge: actor_id / actor_role / event_type', () => {
  it('actor_id null → la alerta se crea con actorId: null', async () => {
    const event = buildValidEvent({ actor_id: null, integrity_hash: 'a'.repeat(64) });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({ actorId: null }),
    );
  });

  it('actor_role copiloto → hash calculado correctamente, sin falso positivo', async () => {
    const event = buildValidEvent({ actor_role: 'copiloto' });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(new Date('2026-05-18T12:00:30.000Z'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const hashAlerts = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => (data as Record<string, unknown>).description === 'integrity_hash_mismatch',
    );
    expect(hashAlerts).toHaveLength(0);
  });

  it('actor_role supervisor → hash calculado correctamente, sin falso positivo', async () => {
    const event = buildValidEvent({ actor_role: 'supervisor' });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const hashAlerts = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => (data as Record<string, unknown>).description === 'integrity_hash_mismatch',
    );
    expect(hashAlerts).toHaveLength(0);
  });

  it('event_type PANIC → MonitorEngine procesa todos los checks de fraude normalmente', async () => {
    const event = buildValidEvent({ event_type: 'PANIC' });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(new Date('2026-05-18T12:00:30.000Z'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    // PANIC event with valid hash, no mock_location, small delta → 0 alertas
    expect(mockAlertsQueue.add).not.toHaveBeenCalled();
  });

  it('evento PANIC con hash incorrecto → alerta integrity_hash_mismatch (no omite el check)', async () => {
    const event = buildValidEvent({ event_type: 'PANIC', integrity_hash: 'a'.repeat(64) });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({ description: 'integrity_hash_mismatch' }),
    );
  });

  it('event_type modificado en BD (tamper) → hash no coincide → alerta de integridad', async () => {
    // Hash was computed for event_type='CHECKPOINT', but DB row has event_type='DELIVERED'
    const originalEvent = buildValidEvent({ event_type: 'CHECKPOINT' });
    const tamperedEvent = { ...originalEvent, event_type: 'DELIVERED' }; // hash still for CHECKPOINT
    mockRepo.findEventById.mockResolvedValue(tamperedEvent);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(tamperedEvent.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({ description: 'integrity_hash_mismatch' }),
    );
  });
});

// ===========================================================================
// Casos edge — timestamp delta
// ===========================================================================

describe('checkTimestampDelta — casos edge de precisión', () => {
  it('delta = 0 ms (timestamps idénticos) → sin alerta', async () => {
    const ts = new Date('2026-05-18T12:00:00.000Z');
    const event = buildValidEvent({ app_timestamp: ts });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(ts); // same millisecond
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).not.toHaveBeenCalled();
  });

  it('delta = 1 ms → sin alerta (bien por debajo del umbral)', async () => {
    const appTs = new Date('2026-05-18T12:00:00.000Z');
    const autoTs = new Date(appTs.getTime() + 1);
    const event = buildValidEvent({ app_timestamp: appTs });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).not.toHaveBeenCalled();
  });

  it('delta = 180 001 ms (1 ms sobre el umbral) → alerta, descripción muestra 180s', async () => {
    const appTs = new Date('2026-05-18T12:00:00.000Z');
    const autoTs = new Date(appTs.getTime() + 180_001); // 180.001 s → Math.round = 180s
    const event = buildValidEvent({ app_timestamp: appTs });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({
        type: 'tamper',
        description: 'Timestamp delta 180s exceeds 3 min threshold',
      }),
    );
  });

  it('delta = 86 400 s (24 h) → alerta con descripción correcta', async () => {
    const appTs = new Date('2026-05-18T12:00:00.000Z');
    const autoTs = new Date(appTs.getTime() + 86_400_000);
    const event = buildValidEvent({ app_timestamp: appTs });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockResolvedValue(autoTs);
    const engine = makeEngine();

    await engine.processEvent(event.id);

    expect(mockAlertsQueue.add).toHaveBeenCalledWith(
      'create-alert',
      expect.objectContaining({
        type: 'tamper',
        description: 'Timestamp delta 86400s exceeds 3 min threshold',
      }),
    );
  });
});

// ===========================================================================
// Casos edge — campos de device y payload
// ===========================================================================

describe('processEvent — casos edge: device y payload', () => {
  it('device con solo mock_location_detected (sin otros campos) → no rompe el hash', async () => {
    const device = { mock_location_detected: false };
    const event = buildValidEvent({ device });
    // buildValidEvent computes hash with this minimal device object
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await expect(engine.processEvent(event.id)).resolves.toBeUndefined();

    const hashAlerts = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => (data as Record<string, unknown>).description === 'integrity_hash_mismatch',
    );
    expect(hashAlerts).toHaveLength(0);
  });

  it('payload vacío {} → hash calculado correctamente, sin falso positivo', async () => {
    const event = buildValidEvent({ payload: {} });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const hashAlerts = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => (data as Record<string, unknown>).description === 'integrity_hash_mismatch',
    );
    expect(hashAlerts).toHaveLength(0);
  });

  it('location con objeto anidado → hash calculado correctamente', async () => {
    const location = { lat: 19.4326, long: -99.1332, accuracy_meters: 10.5, provider: 'network', extra: { floor: 3 } };
    const event = buildValidEvent({ location });
    mockRepo.findEventById.mockResolvedValue(event);
    mockGpsProvider.getAutoTimestamp.mockRejectedValue(new Error('GPS offline'));
    const engine = makeEngine();

    await engine.processEvent(event.id);

    const hashAlerts = (mockAlertsQueue.add as jest.Mock).mock.calls.filter(
      ([, data]) => (data as Record<string, unknown>).description === 'integrity_hash_mismatch',
    );
    expect(hashAlerts).toHaveLength(0);
  });
});
