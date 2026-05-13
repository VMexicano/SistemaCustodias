/**
 * temperature.repository.test.ts — unit tests for TemperatureRepository
 *
 * All DB calls are mocked via Knex fluent-API stubs.
 */

import { TemperatureRepository } from '../../modules/temperature/temperature.repository.js';

// ---------------------------------------------------------------------------
// Knex builder factory
// ---------------------------------------------------------------------------

function makeQueryBuilder(resolveWith: object | object[] | null = null) {
  const builder: Record<string, jest.Mock> = {
    insert: jest.fn().mockResolvedValue([]),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(resolveWith ?? []),
    first: jest.fn().mockResolvedValue(resolveWith),
  };
  // where returns this to allow chaining
  builder['where'] = jest.fn().mockReturnValue(builder);
  return builder;
}

// ---------------------------------------------------------------------------
// Tests — TemperatureRepository
// ---------------------------------------------------------------------------

describe('TemperatureRepository', () => {
  describe('createReading()', () => {
    it('inserts reading with all optional fields null when not provided', async () => {
      const insertMock = jest.fn().mockResolvedValue([]);
      const db = jest.fn().mockReturnValue({ insert: insertMock });

      const repo = new TemperatureRepository(db as never);
      await repo.createReading({ tripId: 'trip-1', celsius: 4.5 });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sensor_id: null,
          lat: null,
          lng: null,
        }),
      );
    });

    it('inserts reading with optional fields when provided', async () => {
      const insertMock = jest.fn().mockResolvedValue([]);
      const db = jest.fn().mockReturnValue({ insert: insertMock });

      const repo = new TemperatureRepository(db as never);
      await repo.createReading({ tripId: 'trip-1', celsius: 3.2, sensorId: 'sensor-A', lat: 19.43, lng: -99.13 });

      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sensor_id: 'sensor-A',
          lat: 19.43,
          lng: -99.13,
        }),
      );
    });
  });

  describe('getReadings()', () => {
    it('returns readings without filters applied', async () => {
      const selectResult = [{ trip_id: 'trip-1', celsius: 4.5 }];
      const selectMock = jest.fn().mockResolvedValue(selectResult);
      const orderByMock = jest.fn().mockReturnThis();
      const limitMock = jest.fn().mockReturnValue({ select: selectMock });
      const whereMock = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orderBy: orderByMock,
        limit: limitMock,
      });
      orderByMock.mockReturnValue({ limit: limitMock });

      const db = jest.fn().mockReturnValue({ where: whereMock });

      const repo = new TemperatureRepository(db as never);
      const result = await repo.getReadings('trip-1');

      expect(result).toHaveLength(1);
    });

    it('applies from/to filters when provided', async () => {
      const selectMock = jest.fn().mockResolvedValue([]);
      const limitMock = jest.fn().mockReturnValue({ select: selectMock });
      const orderByMock = jest.fn().mockReturnValue({ limit: limitMock });
      const whereMock = jest.fn().mockReturnThis();
      const chainBuilder = {
        where: whereMock,
        orderBy: orderByMock,
        limit: limitMock,
      };
      whereMock.mockReturnValue(chainBuilder);

      const db = jest.fn().mockReturnValue(chainBuilder);

      const repo = new TemperatureRepository(db as never);
      await repo.getReadings('trip-1', { from: '2026-01-01', to: '2026-12-31', limit: 50 });

      expect(whereMock).toHaveBeenCalledWith('recorded_at', '>=', '2026-01-01');
      expect(whereMock).toHaveBeenCalledWith('recorded_at', '<=', '2026-12-31');
    });
  });

  describe('getSummary()', () => {
    const summaryRow = { min_val: 2, max_val: 8, avg_val: 5, total: 10, out_of_range: 0 };

    it('returns summary without setpoints (out_of_range = 0)', async () => {
      const firstMock = jest.fn().mockResolvedValue(summaryRow);
      const selectMock = jest.fn().mockReturnValue({ first: firstMock });
      const whereMock = jest.fn().mockReturnValue({ select: selectMock });
      const rawMock = jest.fn().mockReturnValue('raw_expr');
      const db = jest.fn().mockReturnValue({ where: whereMock });
      (db as never as { raw: jest.Mock }).raw = rawMock;

      const repo = new TemperatureRepository(db as never);
      const result = await repo.getSummary('trip-1');

      expect(result.min).toBe(2);
      expect(result.max).toBe(8);
      expect(result.total_readings).toBe(10);
      expect(rawMock).toHaveBeenCalledWith('0 as out_of_range');
    });

    it('computes out_of_range when setpoints are provided', async () => {
      const rowWithRange = { ...summaryRow, out_of_range: 2 };
      const firstMock = jest.fn().mockResolvedValue(rowWithRange);
      const selectMock = jest.fn().mockReturnValue({ first: firstMock });
      const whereMock = jest.fn().mockReturnValue({ select: selectMock });
      const rawMock = jest.fn().mockReturnValue('raw_expr');
      const db = jest.fn().mockReturnValue({ where: whereMock });
      (db as never as { raw: jest.Mock }).raw = rawMock;

      const repo = new TemperatureRepository(db as never);
      const result = await repo.getSummary('trip-1', { min_celsius: 2, max_celsius: 8 });

      expect(result.out_of_range_count).toBe(2);
      expect(rawMock).toHaveBeenCalledWith(
        'SUM(CASE WHEN celsius < ? OR celsius > ? THEN 1 ELSE 0 END) as out_of_range',
        [2, 8],
      );
    });

    it('handles null result values gracefully (defaults to 0)', async () => {
      const firstMock = jest.fn().mockResolvedValue(null);
      const selectMock = jest.fn().mockReturnValue({ first: firstMock });
      const whereMock = jest.fn().mockReturnValue({ select: selectMock });
      const rawMock = jest.fn().mockReturnValue('raw_expr');
      const db = jest.fn().mockReturnValue({ where: whereMock });
      (db as never as { raw: jest.Mock }).raw = rawMock;

      const repo = new TemperatureRepository(db as never);
      const result = await repo.getSummary('trip-1');

      expect(result.min).toBe(0);
      expect(result.max).toBe(0);
      expect(result.avg).toBe(0);
    });
  });
});
