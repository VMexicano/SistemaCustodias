/**
 * admin.service.test.ts — unit tests for AdminService
 *
 * All external dependencies are mocked.
 * Target: ≥80% lines, ≥75% branches.
 */

import { AdminService } from '../../modules/admin/admin.service.js';
import type { AdminRepository, AdminStats, AdminTripRow, AdminDriverRow, SystemErrorLog, PaginatedResult } from '../../modules/admin/admin.repository.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeStats(overrides: Partial<AdminStats> = {}): AdminStats {
  return {
    active_trips: 5,
    online_drivers: 12,
    today_revenue: 1500.5,
    pending_errors: 2,
    ...overrides,
  };
}

function makeTripRow(overrides: Partial<AdminTripRow> = {}): AdminTripRow {
  return {
    id: 'trip-1',
    status: 'IN_PROGRESS',
    passenger_name: 'Juan Perez',
    origin_lat: 19.4326,
    origin_lng: -99.1332,
    origin_address: 'CDMX Centro',
    destination_lat: 19.39,
    destination_lng: -99.17,
    destination_address: 'Polanco',
    origin: {
      lat: 19.4326,
      lng: -99.1332,
      address: 'CDMX Centro',
    },
    destinations: [
      {
        sequence: 1,
        lat: 19.39,
        lng: -99.17,
        address: 'Polanco',
      },
    ],
    created_at: new Date(),
    fare_amount: 150,
    ...overrides,
  };
}

function makeDriverRow(overrides: Partial<AdminDriverRow> = {}): AdminDriverRow {
  return {
    id: 'driver-1',
    full_name: 'Maria Lopez',
    phone: '+521234567890',
    online: true,
    status: 'approved',
    created_at: new Date(),
    ...overrides,
  };
}

function makeErrorLog(overrides: Partial<SystemErrorLog> = {}): SystemErrorLog {
  return {
    id: 'err-1',
    message: 'DB timeout',
    context: { table: 'trips' },
    resolved_at: null,
    created_at: new Date(),
    ...overrides,
  };
}

function makePaginated<T>(data: T[]): PaginatedResult<T> {
  return { data, total: data.length, page: 1, limit: 10 };
}

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

function makeMockAdminRepo(): jest.Mocked<AdminRepository> {
  return {
    getStats: jest.fn().mockResolvedValue(makeStats()),
    getTrips: jest.fn().mockResolvedValue(makePaginated([makeTripRow()])),
    getDrivers: jest.fn().mockResolvedValue(makePaginated([makeDriverRow()])),
    getErrors: jest.fn().mockResolvedValue([makeErrorLog()]),
    resolveError: jest.fn().mockResolvedValue(makeErrorLog({ resolved_at: new Date() })),
  } as unknown as jest.Mocked<AdminRepository>;
}

// ---------------------------------------------------------------------------
// Tests — AdminService.getStats()
// ---------------------------------------------------------------------------

describe('AdminService', () => {
  describe('getStats()', () => {
    it('returns stats from the repository', async () => {
      const adminRepo = makeMockAdminRepo();
      const svc = new AdminService(adminRepo);

      const result = await svc.getStats();

      expect(result).toMatchObject({
        active_trips: 5,
        online_drivers: 12,
        today_revenue: 1500.5,
        pending_errors: 2,
      });
      expect(adminRepo.getStats).toHaveBeenCalledTimes(1);
    });

    it('returns 0 todayRevenue when repo returns 0', async () => {
      const adminRepo = makeMockAdminRepo();
      adminRepo.getStats.mockResolvedValue(makeStats({ today_revenue: 0 }));
      const svc = new AdminService(adminRepo);

      const result = await svc.getStats();

      expect(result.today_revenue).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // getTrips()
  // --------------------------------------------------------------------------

  describe('getTrips()', () => {
    it('returns paginated trips from the repository', async () => {
      const adminRepo = makeMockAdminRepo();
      const svc = new AdminService(adminRepo);

      const result = await svc.getTrips({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(adminRepo.getTrips).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });

    it('passes status filter to the repository', async () => {
      const adminRepo = makeMockAdminRepo();
      const svc = new AdminService(adminRepo);

      await svc.getTrips({ page: 1, limit: 10, status: 'IN_PROGRESS' });

      expect(adminRepo.getTrips).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'IN_PROGRESS' }),
      );
    });

    it('returns empty list when no trips match', async () => {
      const adminRepo = makeMockAdminRepo();
      adminRepo.getTrips.mockResolvedValue(makePaginated([]));
      const svc = new AdminService(adminRepo);

      const result = await svc.getTrips({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // getDrivers()
  // --------------------------------------------------------------------------

  describe('getDrivers()', () => {
    it('returns paginated drivers from the repository', async () => {
      const adminRepo = makeMockAdminRepo();
      const svc = new AdminService(adminRepo);

      const result = await svc.getDrivers({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(adminRepo.getDrivers).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  // --------------------------------------------------------------------------
  // getErrors()
  // --------------------------------------------------------------------------

  describe('getErrors()', () => {
    it('returns unresolved errors by default (resolved=false)', async () => {
      const adminRepo = makeMockAdminRepo();
      const svc = new AdminService(adminRepo);

      const result = await svc.getErrors(false);

      expect(adminRepo.getErrors).toHaveBeenCalledWith(false);
      expect(result).toHaveLength(1);
      expect(result[0]!.resolved_at).toBeNull();
    });

    it('returns resolved errors when resolved=true', async () => {
      const adminRepo = makeMockAdminRepo();
      adminRepo.getErrors.mockResolvedValue([makeErrorLog({ resolved_at: new Date() })]);
      const svc = new AdminService(adminRepo);

      const result = await svc.getErrors(true);

      expect(adminRepo.getErrors).toHaveBeenCalledWith(true);
      expect(result[0]!.resolved_at).not.toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // resolveError()
  // --------------------------------------------------------------------------

  describe('resolveError()', () => {
    it('marks the error as resolved and returns updated record', async () => {
      const adminRepo = makeMockAdminRepo();
      const svc = new AdminService(adminRepo);

      const result = await svc.resolveError('err-1');

      expect(adminRepo.resolveError).toHaveBeenCalledWith('err-1');
      expect(result.resolved_at).not.toBeNull();
    });

    it('propagates ADMIN_ERROR_NOT_FOUND from the repository', async () => {
      const adminRepo = makeMockAdminRepo();
      const { BusinessError } = await import('../../shared/errors/business-error.js');
      adminRepo.resolveError.mockRejectedValue(new BusinessError('ADMIN_ERROR_NOT_FOUND'));
      const svc = new AdminService(adminRepo);

      await expect(svc.resolveError('nonexistent')).rejects.toMatchObject({
        code: 'ADMIN_ERROR_NOT_FOUND',
      });
    });

    it('propagates ADMIN_ERROR_ALREADY_RESOLVED from the repository', async () => {
      const adminRepo = makeMockAdminRepo();
      const { BusinessError } = await import('../../shared/errors/business-error.js');
      adminRepo.resolveError.mockRejectedValue(new BusinessError('ADMIN_ERROR_ALREADY_RESOLVED'));
      const svc = new AdminService(adminRepo);

      await expect(svc.resolveError('err-1')).rejects.toMatchObject({
        code: 'ADMIN_ERROR_ALREADY_RESOLVED',
      });
    });
  });
});
