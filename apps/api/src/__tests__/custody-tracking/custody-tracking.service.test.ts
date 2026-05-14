// ---------------------------------------------------------------------------
// custody-tracking.service.test.ts — unit tests for CustodyTrackingService
// ---------------------------------------------------------------------------

import { CustodyTrackingService } from '../../modules/custody-tracking/custody-tracking.service.js';
import type { CustodyTrackingRepository } from '../../modules/custody-tracking/custody-tracking.repository.js';
import type { LocationReading } from '../../modules/custody-tracking/custody-tracking.types.js';
import { BusinessError } from '../../shared/errors/business-error.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_ID = 'order-uuid-1';
const OPERATOR_ID = 'operator-uuid-1';
const USER_ID = 'user-uuid-1';

const makeReading = (overrides: Partial<LocationReading> = {}): LocationReading => ({
  time: '2026-05-14T12:00:00.000Z',
  order_id: ORDER_ID,
  operator_id: OPERATOR_ID,
  vehicle_id: null,
  lat: 19.432608,
  lng: -99.133209,
  speed_kmh: 40,
  accuracy_m: 5,
  heading: 180,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeRepo(
  overrides: Partial<CustodyTrackingRepository> = {},
): jest.Mocked<CustodyTrackingRepository> {
  return {
    insertReading: jest.fn().mockResolvedValue(undefined),
    getCurrentLocation: jest.fn().mockResolvedValue(makeReading()),
    getHistory: jest.fn().mockResolvedValue([makeReading()]),
    ...overrides,
  } as unknown as jest.Mocked<CustodyTrackingRepository>;
}

function makeDb(orderRow?: unknown, operatorRow?: unknown) {
  const rawFn = jest.fn();

  // Each call to db.raw returns different data depending on the SQL query
  rawFn.mockImplementation((sql: string) => {
    if (sql.includes('custody_orders')) {
      return Promise.resolve({
        rows: orderRow !== undefined ? [orderRow] : [],
      });
    }
    if (sql.includes('operators')) {
      return Promise.resolve({
        rows: operatorRow !== undefined ? [operatorRow] : [],
      });
    }
    return Promise.resolve({ rows: [] });
  });

  return { raw: rawFn } as unknown as import('knex').Knex;
}

function makeRedis() {
  return {} as unknown as import('ioredis').Redis;
}

function makeQueue() {
  return { add: jest.fn().mockResolvedValue(undefined) } as unknown as import('bullmq').Queue;
}

// ---------------------------------------------------------------------------
// Tests: recordLocation
// ---------------------------------------------------------------------------

describe('CustodyTrackingService.recordLocation', () => {
  const validOrder = {
    id: ORDER_ID,
    status: 'EN_ROUTE_TO_PICKUP',
    custodio_id: OPERATOR_ID,
    copiloto_id: null,
  };
  const validOperator = { id: OPERATOR_ID, vehicle_id: null };

  it('records a location and returns the result', async () => {
    const repo = makeRepo();
    const db = makeDb(validOrder, validOperator);
    const queue = makeQueue();
    const service = new CustodyTrackingService(repo, db, makeRedis(), queue);

    const result = await service.recordLocation(USER_ID, {
      order_id: ORDER_ID,
      lat: 19.432608,
      lng: -99.133209,
      speed_kmh: 40,
    });

    expect(result.recorded).toBe(true);
    expect(result.order_id).toBe(ORDER_ID);
    expect(typeof result.timestamp).toBe('string');
    expect(repo.insertReading).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith('geofence-check', expect.objectContaining({
      order_id: ORDER_ID,
      operator_id: OPERATOR_ID,
    }));
  });

  it('records when operator is copiloto', async () => {
    const order = {
      ...validOrder,
      custodio_id: 'other-operator',
      copiloto_id: OPERATOR_ID,
    };
    const repo = makeRepo();
    const db = makeDb(order, validOperator);
    const service = new CustodyTrackingService(repo, db, makeRedis(), makeQueue());

    const result = await service.recordLocation(USER_ID, {
      order_id: ORDER_ID,
      lat: 19.0,
      lng: -99.0,
    });

    expect(result.recorded).toBe(true);
  });

  it('allows IN_TRANSIT status', async () => {
    const order = { ...validOrder, status: 'IN_TRANSIT' };
    const repo = makeRepo();
    const db = makeDb(order, validOperator);
    const service = new CustodyTrackingService(repo, db, makeRedis(), makeQueue());

    await expect(
      service.recordLocation(USER_ID, { order_id: ORDER_ID, lat: 19.0, lng: -99.0 }),
    ).resolves.toMatchObject({ recorded: true });
  });

  it('throws ORDER_NOT_FOUND when order does not exist', async () => {
    const repo = makeRepo();
    const db = makeDb(undefined, validOperator); // no order row
    const service = new CustodyTrackingService(repo, db, makeRedis(), makeQueue());

    await expect(
      service.recordLocation(USER_ID, { order_id: ORDER_ID, lat: 0, lng: 0 }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('throws ORDER_NOT_TRACKABLE for non-trackable status', async () => {
    const order = { ...validOrder, status: 'ASSIGNED' };
    const repo = makeRepo();
    const db = makeDb(order, validOperator);
    const service = new CustodyTrackingService(repo, db, makeRedis(), makeQueue());

    await expect(
      service.recordLocation(USER_ID, { order_id: ORDER_ID, lat: 0, lng: 0 }),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_TRACKABLE' });
  });

  it('throws OPERATOR_NOT_FOUND when user has no operator profile', async () => {
    const repo = makeRepo();
    const db = makeDb(validOrder, undefined); // no operator row
    const service = new CustodyTrackingService(repo, db, makeRedis(), makeQueue());

    await expect(
      service.recordLocation(USER_ID, { order_id: ORDER_ID, lat: 0, lng: 0 }),
    ).rejects.toMatchObject({ code: 'OPERATOR_NOT_FOUND' });
  });

  it('throws OPERATOR_NOT_ASSIGNED when operator is not on this order', async () => {
    const order = { ...validOrder, custodio_id: 'other-1', copiloto_id: 'other-2' };
    const repo = makeRepo();
    const db = makeDb(order, validOperator); // operator.id is OPERATOR_ID, not on order
    const service = new CustodyTrackingService(repo, db, makeRedis(), makeQueue());

    await expect(
      service.recordLocation(USER_ID, { order_id: ORDER_ID, lat: 0, lng: 0 }),
    ).rejects.toMatchObject({ code: 'OPERATOR_NOT_ASSIGNED' });
  });

  it('broadcasts via socket.io when io is set', async () => {
    const emitFn = jest.fn();
    const toFn = jest.fn().mockReturnValue({ emit: emitFn });
    const mockIo = { to: toFn } as unknown as import('socket.io').Namespace;

    const repo = makeRepo();
    const db = makeDb(validOrder, validOperator);
    const service = new CustodyTrackingService(repo, db, makeRedis(), makeQueue(), mockIo);

    await service.recordLocation(USER_ID, { order_id: ORDER_ID, lat: 19.0, lng: -99.0 });

    expect(toFn).toHaveBeenCalledWith(`order:${ORDER_ID}`);
    expect(emitFn).toHaveBeenCalledWith('location:updated', expect.objectContaining({
      order_id: ORDER_ID,
    }));
  });

  it('does not throw when io is absent (optional dependency)', async () => {
    const repo = makeRepo();
    const db = makeDb(validOrder, validOperator);
    const service = new CustodyTrackingService(repo, db, makeRedis(), makeQueue()); // no io

    await expect(
      service.recordLocation(USER_ID, { order_id: ORDER_ID, lat: 19.0, lng: -99.0 }),
    ).resolves.toMatchObject({ recorded: true });
  });

  it('setIo injects io after construction', async () => {
    const emitFn = jest.fn();
    const toFn = jest.fn().mockReturnValue({ emit: emitFn });
    const mockIo = { to: toFn } as unknown as import('socket.io').Namespace;

    const repo = makeRepo();
    const db = makeDb(validOrder, validOperator);
    const service = new CustodyTrackingService(repo, db, makeRedis(), makeQueue());
    service.setIo(mockIo);

    await service.recordLocation(USER_ID, { order_id: ORDER_ID, lat: 19.0, lng: -99.0 });
    expect(emitFn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests: getCurrentLocation
// ---------------------------------------------------------------------------

describe('CustodyTrackingService.getCurrentLocation', () => {
  it('returns the current location point', async () => {
    const repo = makeRepo({
      getCurrentLocation: jest.fn().mockResolvedValue(makeReading()),
    });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    const result = await service.getCurrentLocation(ORDER_ID);

    expect(result.order_id).toBe(ORDER_ID);
    expect(result.operator_id).toBe(OPERATOR_ID);
    expect(result.point.lat).toBeCloseTo(19.432608);
    expect(result.point.speed_kmh).toBe(40);
  });

  it('throws NO_LOCATION_DATA when no readings exist', async () => {
    const repo = makeRepo({
      getCurrentLocation: jest.fn().mockResolvedValue(null),
    });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    const err = await service.getCurrentLocation(ORDER_ID).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BusinessError);
    expect((err as BusinessError).code).toBe('NO_LOCATION_DATA');
    expect((err as BusinessError).statusCode).toBe(404);
  });

  it('handles Date objects for time field', async () => {
    const readingWithDate = { ...makeReading(), time: new Date('2026-05-14T12:00:00.000Z') as unknown as string };
    const repo = makeRepo({
      getCurrentLocation: jest.fn().mockResolvedValue(readingWithDate),
    });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    const result = await service.getCurrentLocation(ORDER_ID);
    expect(result.point.timestamp).toBe('2026-05-14T12:00:00.000Z');
  });

  it('returns null speed_kmh when reading has null speed', async () => {
    const repo = makeRepo({
      getCurrentLocation: jest.fn().mockResolvedValue(makeReading({ speed_kmh: null })),
    });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    const result = await service.getCurrentLocation(ORDER_ID);
    expect(result.point.speed_kmh).toBeNull();
  });

  it('returns null heading when reading has null heading', async () => {
    const repo = makeRepo({
      getCurrentLocation: jest.fn().mockResolvedValue(makeReading({ heading: null })),
    });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    const result = await service.getCurrentLocation(ORDER_ID);
    expect(result.point.heading).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: getHistory
// ---------------------------------------------------------------------------

describe('CustodyTrackingService.getHistory', () => {
  it('returns history with correct point count', async () => {
    const readings = [makeReading(), makeReading({ lat: 19.5, lng: -99.2 })];
    const repo = makeRepo({
      getHistory: jest.fn().mockResolvedValue(readings),
    });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    const result = await service.getHistory(ORDER_ID, { limit: 50 });

    expect(result.order_id).toBe(ORDER_ID);
    expect(result.count).toBe(2);
    expect(result.points).toHaveLength(2);
    expect(result.points[0]!.lat).toBeCloseTo(19.432608);
    expect(result.points[1]!.lat).toBeCloseTo(19.5);
  });

  it('returns empty history when no readings exist', async () => {
    const repo = makeRepo({ getHistory: jest.fn().mockResolvedValue([]) });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    const result = await service.getHistory(ORDER_ID, {});
    expect(result.count).toBe(0);
    expect(result.points).toEqual([]);
  });

  it('passes query parameters to repository', async () => {
    const repo = makeRepo({ getHistory: jest.fn().mockResolvedValue([]) });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    await service.getHistory(ORDER_ID, { limit: 10, from: '2026-01-01', to: '2026-12-31' });

    expect(repo.getHistory).toHaveBeenCalledWith(ORDER_ID, {
      limit: 10,
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('maps null speed_kmh and null heading in history readings', async () => {
    const reading = makeReading({ speed_kmh: null, heading: null });
    const repo = makeRepo({ getHistory: jest.fn().mockResolvedValue([reading]) });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    const result = await service.getHistory(ORDER_ID, {});
    expect(result.points[0]!.speed_kmh).toBeNull();
    expect(result.points[0]!.heading).toBeNull();
  });

  it('handles Date objects for time field in history readings', async () => {
    const reading = { ...makeReading(), time: new Date('2026-05-14T12:00:00.000Z') as unknown as string };
    const repo = makeRepo({ getHistory: jest.fn().mockResolvedValue([reading]) });
    const service = new CustodyTrackingService(repo, makeDb(), makeRedis(), makeQueue());

    const result = await service.getHistory(ORDER_ID, {});
    expect(result.points[0]!.timestamp).toBe('2026-05-14T12:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Tests: BusinessError codes
// ---------------------------------------------------------------------------

describe('BusinessError codes for tracking', () => {
  it('ORDER_NOT_TRACKABLE has status 409', () => {
    const err = new BusinessError('ORDER_NOT_TRACKABLE');
    expect(err.statusCode).toBe(409);
  });

  it('OPERATOR_NOT_ASSIGNED has status 403', () => {
    const err = new BusinessError('OPERATOR_NOT_ASSIGNED');
    expect(err.statusCode).toBe(403);
  });

  it('NO_LOCATION_DATA has status 404', () => {
    const err = new BusinessError('NO_LOCATION_DATA');
    expect(err.statusCode).toBe(404);
  });
});
