/**
 * admin-config.service.test.ts — unit tests for AdminConfigService
 *
 * All external dependencies are mocked.
 * Target: ≥80% lines, ≥75% branches.
 */

import { AdminConfigService } from '../../modules/admin/admin-config.service.js';
import type { AdminConfigRepository, PricingFactor, CommissionRule, TripType } from '../../modules/admin/admin-config.repository.js';
import type { Database } from '../../config/database.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeFactor(overrides: Partial<PricingFactor> = {}): PricingFactor {
  return {
    id: 'factor-1',
    regionId: 'region-mx',
    code: 'SURGE',
    name: 'Surge pricing',
    type: 'multiplier',
    value: 1.5,
    stackable: false,
    priority: 1,
    active: true,
    ...overrides,
  };
}

function makeCommission(overrides: Partial<CommissionRule> = {}): CommissionRule {
  return {
    id: 'comm-1',
    regionId: 'region-mx',
    platformFeePct: 20,
    active: true,
    validFrom: null,
    validUntil: null,
    ...overrides,
  };
}

function makeTripType(overrides: Partial<TripType> = {}): TripType {
  return {
    id: 'tt-1',
    regionId: 'region-mx',
    code: 'STANDARD',
    name: 'Standard',
    description: 'Servicio estándar',
    baseFare: 30,
    costPerKm: 5,
    costPerMin: 1,
    minFare: 50,
    serviceMode: 'on_demand',
    active: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

function makeMockConfigRepo(): jest.Mocked<AdminConfigRepository> {
  return {
    getFactors: jest.fn().mockResolvedValue([makeFactor()]),
    getFactorById: jest.fn().mockResolvedValue(makeFactor()),
    updateFactor: jest.fn().mockResolvedValue(makeFactor({ active: false })),
    getCommissions: jest.fn().mockResolvedValue([makeCommission()]),
    getCommissionById: jest.fn().mockResolvedValue(makeCommission()),
    updateCommission: jest.fn().mockResolvedValue(makeCommission({ platformFeePct: 25 })),
    getTripTypes: jest.fn().mockResolvedValue([makeTripType()]),
    getTripTypeById: jest.fn().mockResolvedValue(makeTripType()),
    updateTripType: jest.fn().mockResolvedValue(makeTripType({ baseFare: 40 })),
    getDefaultRegionId: jest.fn().mockResolvedValue('region-mx'),
    createTripType: jest.fn().mockResolvedValue(makeTripType()),
  } as unknown as jest.Mocked<AdminConfigRepository>;
}

function makeMockDb(): jest.Mocked<Database> {
  const insertMock = jest.fn().mockResolvedValue([]);
  const tableChain = { insert: insertMock };
  const db = jest.fn().mockReturnValue(tableChain) as unknown as jest.Mocked<Database>;
  return db;
}

// ---------------------------------------------------------------------------
// Tests — AdminConfigService.updateFactor()
// ---------------------------------------------------------------------------

describe('AdminConfigService', () => {
  describe('getFactors()', () => {
    it('returns all pricing factors', async () => {
      const repo = makeMockConfigRepo();
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.getFactors();

      expect(result).toHaveLength(1);
      expect(repo.getFactors).toHaveBeenCalled();
    });
  });

  describe('updateFactor()', () => {
    it('deactivates an active factor', async () => {
      const repo = makeMockConfigRepo();
      repo.updateFactor.mockResolvedValue(makeFactor({ active: false }));
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.updateFactor('factor-1', { active: false }, 'admin-1');

      expect(repo.updateFactor).toHaveBeenCalledWith('factor-1', { active: false });
      expect(result.active).toBe(false);
    });

    it('activates an inactive factor', async () => {
      const repo = makeMockConfigRepo();
      repo.getFactorById.mockResolvedValue(makeFactor({ active: false }));
      repo.updateFactor.mockResolvedValue(makeFactor({ active: true }));
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.updateFactor('factor-1', { active: true }, 'admin-1');

      expect(result.active).toBe(true);
    });

    it('updates the value of a factor', async () => {
      const repo = makeMockConfigRepo();
      repo.updateFactor.mockResolvedValue(makeFactor({ value: 2.0 }));
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.updateFactor('factor-1', { value: 2.0 }, 'admin-1');

      expect(repo.updateFactor).toHaveBeenCalledWith('factor-1', { value: 2.0 });
      expect(result.value).toBe(2.0);
    });

    it('writes an audit_logs entry after successful update', async () => {
      const repo = makeMockConfigRepo();
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await svc.updateFactor('factor-1', { active: false }, 'admin-1');

      expect(db).toHaveBeenCalledWith('audit_logs');
    });

    it('throws FACTOR_NOT_FOUND when the factor does not exist', async () => {
      const repo = makeMockConfigRepo();
      repo.getFactorById.mockResolvedValue(null);
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await expect(svc.updateFactor('nonexistent', { active: false }, 'admin-1')).rejects.toMatchObject({
        code: 'FACTOR_NOT_FOUND',
      });
    });
  });

  // --------------------------------------------------------------------------
  // updateCommission()
  // --------------------------------------------------------------------------

  describe('getCommissions()', () => {
    it('returns all commission rules', async () => {
      const repo = makeMockConfigRepo();
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.getCommissions();

      expect(result).toHaveLength(1);
    });
  });

  describe('updateCommission()', () => {
    it('updates platform_fee_pct correctly', async () => {
      const repo = makeMockConfigRepo();
      repo.updateCommission.mockResolvedValue(makeCommission({ platformFeePct: 25 }));
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.updateCommission('comm-1', { platformFeePct: 25 }, 'admin-1');

      expect(repo.updateCommission).toHaveBeenCalledWith('comm-1', { platformFeePct: 25 });
      expect(result.platformFeePct).toBe(25);
    });

    it('writes an audit_logs entry after successful commission update', async () => {
      const repo = makeMockConfigRepo();
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await svc.updateCommission('comm-1', { platformFeePct: 15 }, 'admin-1');

      expect(db).toHaveBeenCalledWith('audit_logs');
    });

    it('throws COMMISSION_NOT_FOUND when the commission rule does not exist', async () => {
      const repo = makeMockConfigRepo();
      repo.getCommissionById.mockResolvedValue(null);
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await expect(svc.updateCommission('nonexistent', { platformFeePct: 20 }, 'admin-1')).rejects.toMatchObject({
        code: 'COMMISSION_NOT_FOUND',
      });
    });

    it('throws INVALID_FEE_PCT when platformFeePct is negative', async () => {
      const repo = makeMockConfigRepo();
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await expect(svc.updateCommission('comm-1', { platformFeePct: -5 }, 'admin-1')).rejects.toMatchObject({
        code: 'INVALID_FEE_PCT',
      });
    });

    it('throws INVALID_FEE_PCT when platformFeePct exceeds 100', async () => {
      const repo = makeMockConfigRepo();
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await expect(svc.updateCommission('comm-1', { platformFeePct: 101 }, 'admin-1')).rejects.toMatchObject({
        code: 'INVALID_FEE_PCT',
      });
    });

    it('allows platformFeePct of exactly 0', async () => {
      const repo = makeMockConfigRepo();
      repo.updateCommission.mockResolvedValue(makeCommission({ platformFeePct: 0 }));
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.updateCommission('comm-1', { platformFeePct: 0 }, 'admin-1');

      expect(result.platformFeePct).toBe(0);
    });

    it('allows platformFeePct of exactly 100', async () => {
      const repo = makeMockConfigRepo();
      repo.updateCommission.mockResolvedValue(makeCommission({ platformFeePct: 100 }));
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.updateCommission('comm-1', { platformFeePct: 100 }, 'admin-1');

      expect(result.platformFeePct).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // updateTripType()
  // --------------------------------------------------------------------------

  describe('getTripTypes()', () => {
    it('returns all trip types', async () => {
      const repo = makeMockConfigRepo();
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.getTripTypes();

      expect(result).toHaveLength(1);
    });
  });

  describe('updateTripType()', () => {
    it('updates baseFare correctly', async () => {
      const repo = makeMockConfigRepo();
      repo.updateTripType.mockResolvedValue(makeTripType({ baseFare: 40 }));
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.updateTripType('tt-1', { baseFare: 40 }, 'admin-1');

      expect(repo.updateTripType).toHaveBeenCalledWith('tt-1', { baseFare: 40 });
      expect(result.baseFare).toBe(40);
    });

    it('updates multiple fields simultaneously', async () => {
      const repo = makeMockConfigRepo();
      repo.updateTripType.mockResolvedValue(makeTripType({ baseFare: 40, costPerKm: 6, minFare: 60 }));
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.updateTripType('tt-1', { baseFare: 40, costPerKm: 6, minFare: 60 }, 'admin-1');

      expect(repo.updateTripType).toHaveBeenCalledWith('tt-1', { baseFare: 40, costPerKm: 6, minFare: 60 });
      expect(result.baseFare).toBe(40);
      expect(result.costPerKm).toBe(6);
      expect(result.minFare).toBe(60);
    });

    it('writes an audit_logs entry after successful trip type update', async () => {
      const repo = makeMockConfigRepo();
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await svc.updateTripType('tt-1', { baseFare: 40 }, 'admin-1');

      expect(db).toHaveBeenCalledWith('audit_logs');
    });

    it('throws TRIP_TYPE_NOT_FOUND when the trip type does not exist', async () => {
      const repo = makeMockConfigRepo();
      repo.getTripTypeById.mockResolvedValue(null);
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await expect(svc.updateTripType('nonexistent', { baseFare: 40 }, 'admin-1')).rejects.toMatchObject({
        code: 'TRIP_TYPE_NOT_FOUND',
      });
    });
  });

  // --------------------------------------------------------------------------
  // createTripType()
  // --------------------------------------------------------------------------

  describe('createTripType()', () => {
    it('creates trip type with normalized code and default serviceMode', async () => {
      const repo = makeMockConfigRepo();
      const created = makeTripType({ code: 'express_service', name: 'Express Service' });
      repo.createTripType.mockResolvedValue(created);
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      const result = await svc.createTripType(
        { code: 'Express Service', name: 'Express Service', description: 'Express', baseFare: 40, costPerKm: 6, costPerMin: 1.5, minFare: 60 },
        'admin-1',
      );

      expect(repo.createTripType).toHaveBeenCalledWith(expect.objectContaining({
        code: 'express_service',
        regionId: 'region-mx',
        serviceMode: 'people',
      }));
      expect(result.code).toBe('express_service');
    });

    it('uses provided serviceMode over default', async () => {
      const repo = makeMockConfigRepo();
      repo.createTripType.mockResolvedValue(makeTripType());
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await svc.createTripType(
        { code: 'cargo', name: 'Cargo', description: 'Cargo service', baseFare: 80, costPerKm: 10, costPerMin: 2, minFare: 100, serviceMode: 'cargo' as any },
        'admin-1',
      );

      expect(repo.createTripType).toHaveBeenCalledWith(expect.objectContaining({ serviceMode: 'cargo' }));
    });

    it('writes audit_log entry after creation', async () => {
      const repo = makeMockConfigRepo();
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await svc.createTripType(
        { code: 'standard', name: 'Standard', description: 'Estándar', baseFare: 30, costPerKm: 5, costPerMin: 1, minFare: 50 },
        'admin-1',
      );

      expect(db).toHaveBeenCalledWith('audit_logs');
    });

    it('throws VALIDATION_ERROR when no default region exists', async () => {
      const repo = makeMockConfigRepo();
      repo.getDefaultRegionId.mockResolvedValue(null);
      const db = makeMockDb();
      const svc = new AdminConfigService(repo, db);

      await expect(
        svc.createTripType(
          { code: 'x', name: 'X', description: 'X', baseFare: 10, costPerKm: 1, costPerMin: 0.5, minFare: 20 },
          'admin-1',
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });
  });
});
