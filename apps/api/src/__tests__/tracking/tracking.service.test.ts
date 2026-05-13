/**
 * tracking.service.test.ts — unit tests for TrackingService
 *
 * All external dependencies are mocked (no Testcontainers).
 */

import { TrackingService } from '../../modules/tracking/tracking.service.js';
import type { Knex } from 'knex';
import type { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

function makeQueryBuilder(rows: unknown[] = []) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

function makeDb(rows: unknown[] = []): jest.Mocked<Knex> {
  const qb = makeQueryBuilder(rows);
  const db = jest.fn().mockReturnValue(qb) as unknown as jest.Mocked<Knex>;
  (db as unknown as Record<string, unknown>).raw = jest.fn().mockResolvedValue(undefined);
  return db;
}

function makeRedis(activeTripJson: string | null = null): jest.Mocked<Redis> {
  return {
    get: jest.fn().mockResolvedValue(activeTripJson),
    set: jest.fn().mockResolvedValue('OK'),
  } as unknown as jest.Mocked<Redis>;
}

// ---------------------------------------------------------------------------
// recordLocation
// ---------------------------------------------------------------------------

describe('TrackingService.recordLocation()', () => {
  it('no-op when driver has no active trip in Redis', async () => {
    const db = makeDb();
    const redis = makeRedis(null);
    const svc = new TrackingService(db, redis);

    await svc.recordLocation('driver-1', 19.4326, -99.1332);

    expect(db.raw).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('inserts location into trip_locations when active trip exists', async () => {
    const db = makeDb();
    const redis = makeRedis(JSON.stringify({ id: 'trip-abc' }));
    const svc = new TrackingService(db, redis);

    await svc.recordLocation('driver-1', 19.4326, -99.1332);

    expect(db.raw).toHaveBeenCalledTimes(1);
    const [sql, params] = (db.raw as jest.Mock).mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO trip_locations/);
    expect(params).toContain('trip-abc');
    expect(params).toContain('driver-1');
    expect(params).toContain(19.4326);
    expect(params).toContain(-99.1332);
  });

  it('updates driver location key in Redis with 5-minute TTL', async () => {
    const db = makeDb();
    const redis = makeRedis(JSON.stringify({ id: 'trip-abc' }));
    const svc = new TrackingService(db, redis);

    await svc.recordLocation('driver-1', 19.4326, -99.1332);

    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, value, exFlag, ttl] = (redis.set as jest.Mock).mock.calls[0] as [string, string, string, number];
    expect(key).toBe('driver:driver-1:location');
    const parsed = JSON.parse(value) as { lat: number; lng: number; updated_at: string };
    expect(parsed.lat).toBe(19.4326);
    expect(parsed.lng).toBe(-99.1332);
    expect(typeof parsed.updated_at).toBe('string');
    expect(exFlag).toBe('EX');
    expect(ttl).toBe(300);
  });

  it('reads active trip from the correct Redis key', async () => {
    const db = makeDb();
    const redis = makeRedis(JSON.stringify({ id: 'trip-xyz' }));
    const svc = new TrackingService(db, redis);

    await svc.recordLocation('driver-99', 0, 0);

    expect(redis.get).toHaveBeenCalledWith('driver:driver-99:active_trip');
  });
});

// ---------------------------------------------------------------------------
// getTripLocations
// ---------------------------------------------------------------------------

describe('TrackingService.getTripLocations()', () => {
  it('returns empty array when no locations exist', async () => {
    const db = makeDb([]);
    const redis = makeRedis();
    const svc = new TrackingService(db, redis);

    const result = await svc.getTripLocations('trip-1');

    expect(result).toEqual([]);
  });

  it('coerces string lat/lng (PostgreSQL numeric) to numbers', async () => {
    const db = makeDb([{ lat: '19.4326', lng: '-99.1332', recorded_at: '2026-05-07T10:00:00.000Z' }]);
    const redis = makeRedis();
    const svc = new TrackingService(db, redis);

    const result = await svc.getTripLocations('trip-1');

    expect(result[0]!.lat).toBe(19.4326);
    expect(result[0]!.lng).toBe(-99.1332);
    expect(typeof result[0]!.lat).toBe('number');
    expect(typeof result[0]!.lng).toBe('number');
  });

  it('passes through numeric lat/lng unchanged', async () => {
    const db = makeDb([{ lat: 19.4326, lng: -99.1332, recorded_at: '2026-05-07T10:00:00.000Z' }]);
    const redis = makeRedis();
    const svc = new TrackingService(db, redis);

    const result = await svc.getTripLocations('trip-1');

    expect(result[0]!.lat).toBe(19.4326);
    expect(result[0]!.lng).toBe(-99.1332);
  });

  it('converts Date objects in recorded_at to ISO strings', async () => {
    const date = new Date('2026-05-07T10:00:00.000Z');
    const db = makeDb([{ lat: 0, lng: 0, recorded_at: date }]);
    const redis = makeRedis();
    const svc = new TrackingService(db, redis);

    const result = await svc.getTripLocations('trip-1');

    expect(result[0]!.recorded_at).toBe(date.toISOString());
  });

  it('passes default limit of 100 to the query', async () => {
    const qb = makeQueryBuilder([]);
    const db = jest.fn().mockReturnValue(qb) as unknown as jest.Mocked<Knex>;
    const redis = makeRedis();
    const svc = new TrackingService(db, redis);

    await svc.getTripLocations('trip-1');

    expect(qb.limit).toHaveBeenCalledWith(100);
  });

  it('passes custom limit to the query', async () => {
    const qb = makeQueryBuilder([]);
    const db = jest.fn().mockReturnValue(qb) as unknown as jest.Mocked<Knex>;
    const redis = makeRedis();
    const svc = new TrackingService(db, redis);

    await svc.getTripLocations('trip-1', 10);

    expect(qb.limit).toHaveBeenCalledWith(10);
  });

  it('orders results by recorded_at descending', async () => {
    const qb = makeQueryBuilder([]);
    const db = jest.fn().mockReturnValue(qb) as unknown as jest.Mocked<Knex>;
    const redis = makeRedis();
    const svc = new TrackingService(db, redis);

    await svc.getTripLocations('trip-1');

    expect(qb.orderBy).toHaveBeenCalledWith('recorded_at', 'desc');
  });

  it('filters by trip_id in the query', async () => {
    const qb = makeQueryBuilder([]);
    const db = jest.fn().mockReturnValue(qb) as unknown as jest.Mocked<Knex>;
    const redis = makeRedis();
    const svc = new TrackingService(db, redis);

    await svc.getTripLocations('trip-specific');

    expect(qb.where).toHaveBeenCalledWith({ trip_id: 'trip-specific' });
  });
});
