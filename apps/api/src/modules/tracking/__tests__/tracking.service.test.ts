import { TrackingService } from '../tracking.service.js';

function makeDb() {
  return {
    raw: jest.fn().mockResolvedValue(undefined),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeQueryBuilder(rows: unknown[] = []) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

function makeRedis() {
  return {
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('TrackingService.recordLocation', () => {
  test('inserta en trip_locations si driver tiene viaje activo en Redis', async () => {
    const db = makeDb();
    const redis = makeRedis();
    redis.get.mockResolvedValue(JSON.stringify({ id: 'trip-001' }));

    const service = new TrackingService(db, redis);
    await service.recordLocation('driver-001', 19.4326, -99.1332);

    expect(db.raw).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO trip_locations'),
      ['trip-001', 'driver-001', 19.4326, -99.1332],
    );
  });

  test('NO inserta si driver no tiene viaje activo', async () => {
    const db = makeDb();
    const redis = makeRedis();
    redis.get.mockResolvedValue(null);

    const service = new TrackingService(db, redis);
    await service.recordLocation('driver-001', 19.4326, -99.1332);

    expect(db.raw).not.toHaveBeenCalled();
  });

  test('actualiza Redis driver:{id}:location con TTL 5 min', async () => {
    const db = makeDb();
    const redis = makeRedis();
    redis.get.mockResolvedValue(JSON.stringify({ id: 'trip-001' }));

    const service = new TrackingService(db, redis);
    await service.recordLocation('driver-001', 19.4326, -99.1332);

    expect(redis.set).toHaveBeenCalledWith(
      'driver:driver-001:location',
      expect.stringContaining('"lat":19.4326'),
      'EX',
      300,
    );
  });
});

describe('TrackingService.getTripLocations', () => {
  test('retorna las últimas 100 ubicaciones ordenadas DESC', async () => {
    const rows = [
      { lat: '19.44', lng: '-99.14', recorded_at: new Date('2026-04-12T10:00:00Z') },
      { lat: '19.43', lng: '-99.13', recorded_at: new Date('2026-04-12T09:00:00Z') },
    ];
    const qb = makeQueryBuilder(rows);
    const db = jest.fn(() => qb) as unknown as ReturnType<typeof makeDb>;

    const service = new TrackingService(db, makeRedis());
    const result = await service.getTripLocations('trip-001');

    expect(qb.where).toHaveBeenCalledWith({ trip_id: 'trip-001' });
    expect(qb.orderBy).toHaveBeenCalledWith('recorded_at', 'desc');
    expect(qb.limit).toHaveBeenCalledWith(100);
    expect(result).toHaveLength(2);
    expect(result[0]!.lat).toBe(19.44);
    expect(result[0]!.lng).toBe(-99.14);
  });

  test('respeta el parámetro limit', async () => {
    const qb = makeQueryBuilder([]);
    const db = jest.fn(() => qb) as unknown as ReturnType<typeof makeDb>;

    const service = new TrackingService(db, makeRedis());
    await service.getTripLocations('trip-001', 10);

    expect(qb.limit).toHaveBeenCalledWith(10);
  });

  test('retorna array vacío si no hay ubicaciones', async () => {
    const qb = makeQueryBuilder([]);
    const db = jest.fn(() => qb) as unknown as ReturnType<typeof makeDb>;

    const service = new TrackingService(db, makeRedis());
    const result = await service.getTripLocations('trip-001');

    expect(result).toEqual([]);
  });
});
