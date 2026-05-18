// ---------------------------------------------------------------------------
// monitor-engine.repository.integration.test.ts
//
// Integration tests for MonitorRepository against a real PostgreSQL database
// (Testcontainers). Validates the CAS behaviour of updateAutoTimestamp (ADR-024)
// and the read path of findEventById.
//
// FK constraints are bypassed with SET LOCAL session_replication_role = 'replica'
// so rows can be inserted into order_event without parent records.
//
// Timeout: 120 s — container start takes ~30 s on first run.
// ---------------------------------------------------------------------------

import knex from 'knex';
import type { Knex } from 'knex';
import { startTestContainers, type TestContainers } from '../../shared/test/containers.js';
import { MonitorRepository } from '../../modules/monitor-engine/monitor-engine.repository.js';

jest.setTimeout(120_000);

// ---------------------------------------------------------------------------
// Stable UUIDs — no parent records needed (FK bypass)
// ---------------------------------------------------------------------------

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ORDER_ID  = '22222222-2222-2222-2222-222222222222';

const BASE_FIELDS = {
  order_id:      ORDER_ID,
  tenant_id:     TENANT_ID,
  event_type:    'CHECKPOINT',
  actor_id:      null,
  actor_role:    'custodio' as const,
  app_timestamp: new Date('2026-05-18T12:00:00.000Z'),
  auto_timestamp: null,
  location:      JSON.stringify({ lat: 25.6866, long: -100.3161, accuracy_meters: 5, provider: 'gps' }),
  payload:       JSON.stringify({ route_on_track: true }),
  device:        JSON.stringify({ mock_location_detected: false, battery_percent: 80 }),
  integrity_hash: 'a'.repeat(64),
};

// ---------------------------------------------------------------------------
// Suite state
// ---------------------------------------------------------------------------

let containers: TestContainers;
let db: Knex;
let repo: MonitorRepository;

let eventNullTsId:     string; // auto_timestamp = NULL
let eventPresetTsId:   string; // auto_timestamp already set
let eventDataCheckId:  string; // for verifying findEventById field values

const PRESET_TS = new Date('2026-05-18T10:00:00.000Z');

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  containers = await startTestContainers();

  db = knex({
    client: 'pg',
    connection: containers.postgresUrl,
    pool: { min: 1, max: 5, acquireTimeoutMillis: 30_000 },
  });

  await db.migrate.latest({ directory: 'migrations', extension: 'ts' });

  // Insert test rows bypassing FK constraints — SET LOCAL applies only within
  // this transaction, so FK checks are disabled only during the insert.
  await db.transaction(async (trx) => {
    await trx.raw("SET LOCAL session_replication_role = 'replica'");

    [{ id: eventNullTsId }] = await trx('order_event')
      .insert({ ...BASE_FIELDS, sequence_no: 1 })
      .returning('id');

    [{ id: eventPresetTsId }] = await trx('order_event')
      .insert({ ...BASE_FIELDS, sequence_no: 2, auto_timestamp: PRESET_TS })
      .returning('id');

    [{ id: eventDataCheckId }] = await trx('order_event')
      .insert({
        ...BASE_FIELDS,
        sequence_no: 3,
        event_type: 'PANIC',
        integrity_hash: 'b'.repeat(64),
      })
      .returning('id');
  });

  repo = new MonitorRepository(db as never);
});

afterAll(async () => {
  await db.destroy();
  await containers.stop();
});

// ===========================================================================
// findEventById
// ===========================================================================

describe('MonitorRepository.findEventById', () => {
  it('retorna null cuando el ID no existe en la BD', async () => {
    const result = await repo.findEventById('ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(result).toBeNull();
  });

  it('retorna el row cuando el evento existe', async () => {
    const result = await repo.findEventById(eventNullTsId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(eventNullTsId);
  });

  it('retorna los campos correctos del evento', async () => {
    const result = await repo.findEventById(eventDataCheckId);

    expect(result).toMatchObject({
      id:             eventDataCheckId,
      order_id:       ORDER_ID,
      event_type:     'PANIC',
      actor_role:     'custodio',
      actor_id:       null,
      integrity_hash: 'b'.repeat(64),
    });
  });

  it('auto_timestamp es null cuando no fue seteado aún', async () => {
    const result = await repo.findEventById(eventNullTsId);
    expect(result!.auto_timestamp).toBeNull();
  });

  it('auto_timestamp es un Date cuando ya estaba seteado desde la inserción', async () => {
    const result = await repo.findEventById(eventPresetTsId);
    expect(result!.auto_timestamp).toBeInstanceOf(Date);
    // DB may round sub-millisecond precision — allow 1 s tolerance
    expect(Math.abs(result!.auto_timestamp!.getTime() - PRESET_TS.getTime())).toBeLessThan(1_000);
  });
});

// ===========================================================================
// updateAutoTimestamp — CAS (ADR-024)
// ===========================================================================

describe('MonitorRepository.updateAutoTimestamp — CAS (ADR-024)', () => {
  // NOTE: tests 1 and 3 operate on eventNullTsId sequentially.
  // Test 1 writes the timestamp; test 3 verifies a second write is a no-op.

  it('CAS exitoso: escribe auto_timestamp cuando el campo es NULL', async () => {
    const newTs = new Date('2026-05-18T12:00:30.000Z');

    await repo.updateAutoTimestamp(eventNullTsId, newTs);

    const updated = await repo.findEventById(eventNullTsId);
    expect(updated!.auto_timestamp).not.toBeNull();
    expect(Math.abs(updated!.auto_timestamp!.getTime() - newTs.getTime())).toBeLessThan(1_000);
  });

  it('CAS skip: NO sobrescribe auto_timestamp cuando ya tiene un valor', async () => {
    const attemptTs = new Date('2026-05-18T14:00:00.000Z');

    // eventPresetTsId was inserted with auto_timestamp = PRESET_TS
    await repo.updateAutoTimestamp(eventPresetTsId, attemptTs);

    const afterAttempt = await repo.findEventById(eventPresetTsId);
    // Must still hold PRESET_TS, not attemptTs
    expect(Math.abs(afterAttempt!.auto_timestamp!.getTime() - PRESET_TS.getTime())).toBeLessThan(1_000);
    expect(Math.abs(afterAttempt!.auto_timestamp!.getTime() - attemptTs.getTime())).toBeGreaterThan(10_000);
  });

  it('CAS idempotente: segunda llamada al mismo evento (ya escrito) no cambia el valor', async () => {
    // eventNullTsId was written by the first test in this describe block
    const firstRead = await repo.findEventById(eventNullTsId);
    const firstTs = firstRead!.auto_timestamp!;

    const laterTs = new Date('2026-05-18T23:59:59.000Z');
    await repo.updateAutoTimestamp(eventNullTsId, laterTs);

    const secondRead = await repo.findEventById(eventNullTsId);
    expect(Math.abs(secondRead!.auto_timestamp!.getTime() - firstTs.getTime())).toBeLessThan(1_000);
    // laterTs would differ by >40 000 s — confirm it was NOT written
    expect(Math.abs(secondRead!.auto_timestamp!.getTime() - laterTs.getTime())).toBeGreaterThan(40_000_000);
  });
});
