/**
 * scheduled-trips.service.test.ts — unit tests for ScheduledTripsService
 *
 * All external dependencies are mocked — no real database.
 * Target: ≥80% lines, ≥75% branches.
 */

import type { Knex } from 'knex';
import { ScheduledTripsService } from '../../modules/scheduled-trips/scheduled-trips.service.js';
import type { ScheduledTripsRepository, ScheduledTripRow } from '../../modules/scheduled-trips/scheduled-trips.repository.js';
import type { TripsRepository } from '../../modules/trips/trips.repository.js';
import type { PricingEngine } from '../../modules/pricing/pricing-engine.js';
import type { PricingRepository } from '../../modules/pricing/pricing.repository.js';
import type { ScheduleTripInput } from '../../modules/scheduled-trips/scheduled-trips.service.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<ScheduleTripInput> = {}): ScheduleTripInput {
  return {
    passengerId: 'pax-1',
    origin: { lat: 19.4326, lng: -99.1332, address: 'CDMX Centro' },
    destination: { lat: 19.5, lng: -99.2, address: 'Polanco' },
    tripTypeId: 'tt-1',
    scheduledFor: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h from now
    ...overrides,
  };
}

function makeTripType() {
  return {
    id: 'tt-1',
    region_id: 'region-mx',
    code: 'STANDARD',
    name: 'Standard',
    base_fare: 30,
    cost_per_km: 5,
    cost_per_minute: 1,
    min_fare: 50,
    service_mode: 'on_demand',
  };
}

function makeEstimate() {
  return {
    estimated_distance_km: 10,
    estimated_duration_min: 20,
    base_fare: 30,
    factors_applied: [] as import('../../modules/pricing/pricing.types').FactorApplied[],
    subtotal: 129.31,
    tax_amount: 20.69,
    final_fare: 150,
    currency: 'MXN' as const,
    pricing_snapshot: {
      trip_type_id: 'tt-1',
      base_fare: 30,
      cost_per_km: 5,
      cost_per_minute: 1,
      min_fare: 50,
      factors: [] as Array<{ id: string; code: string; type: 'fixed_amount' | 'percentage' | 'multiplier'; value: number; priority: number; stackable: boolean }>,
      region_id: 'region-mx',
      tax_pct: 0.16,
      captured_at: new Date().toISOString(),
    },
  };
}

function makeScheduledTripRow(overrides: Partial<ScheduledTripRow> = {}): ScheduledTripRow {
  return {
    id: 'st-1',
    trip_id: 'trip-1',
    scheduled_for: new Date(Date.now() + 60 * 60 * 1000),
    notif_24h_sent: false,
    notif_1h_sent: false,
    notif_15m_sent: false,
    created_at: new Date(),
    updated_at: new Date(),
    origin_address: 'CDMX Centro',
    destination_address: 'Polanco',
    estimated_fare: 150,
    trip_type_name: 'Standard',
    dispatch_window_min: 30,
    search_started_at: null,
    passenger_notified_searching_at: null,
    pre_assigned_driver_id: null,
    pre_assigned_at: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

function makeMockScheduledRepo(): jest.Mocked<ScheduledTripsRepository> {
  return {
    create: jest.fn().mockResolvedValue(undefined),
    findByPassenger: jest.fn().mockResolvedValue([]),
    findByTripId: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<ScheduledTripsRepository>;
}

function makeMockTripsRepo(): jest.Mocked<TripsRepository> {
  return {
    create: jest.fn().mockResolvedValue({ id: 'trip-1' }),
    insertStatusHistory: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<TripsRepository>;
}

function makeMockPricingEngine(): jest.Mocked<PricingEngine> {
  return {
    estimate: jest.fn().mockReturnValue(makeEstimate()),
  } as unknown as jest.Mocked<PricingEngine>;
}

function makeMockPricingRepo(): jest.Mocked<PricingRepository> {
  return {
    findTripTypeById: jest.fn().mockResolvedValue(makeTripType()),
    findActiveFactors: jest.fn().mockResolvedValue([]),
    findRegionConfig: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<PricingRepository>;
}

function makeMockDb(
  activeTrip: Record<string, unknown> | null = null,
  options: {
    transactionFn?: (cb: (trx: Knex.Transaction) => Promise<unknown>) => Promise<unknown>;
  } = {},
) {
  // Chain builder for trx('trips')...insert()/update()
  const insertMock = jest.fn().mockResolvedValue(undefined);
  const updateMock = jest.fn().mockResolvedValue(1);
  const whereMock = jest.fn().mockReturnThis();
  const whereNullMock = jest.fn().mockReturnThis();
  const whereInMock = jest.fn().mockReturnThis();
  const firstMock = jest.fn().mockResolvedValue(activeTrip);

  const tableChain = {
    insert: insertMock,
    update: updateMock,
    where: whereMock,
    whereIn: whereInMock,
    whereNull: whereNullMock,
    first: firstMock,
  };

  const trx = jest.fn().mockReturnValue(tableChain) as unknown as Knex.Transaction;

  const db = jest.fn().mockReturnValue(tableChain) as unknown as Knex;
  (db as unknown as { transaction: jest.Mock }).transaction = jest.fn().mockImplementation(
    async (cb: (trx: Knex.Transaction) => Promise<unknown>) => {
      if (options.transactionFn) return options.transactionFn(cb);
      return cb(trx);
    },
  );

  return { db, trx, tableChain };
}

// ---------------------------------------------------------------------------
// Tests — ScheduledTripsService.schedule()
// ---------------------------------------------------------------------------

describe('ScheduledTripsService', () => {
  describe('schedule()', () => {
    it('creates trip in SCHEDULED state and returns tripId + estimatedFare', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeMockDb(null); // no active trip

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      const result = await svc.schedule(makeInput());

      expect(result.tripId).toBe('trip-1');
      expect(result.estimatedFare).toBe(150);
      expect(scheduledRepo.create).toHaveBeenCalled();
      expect(tripsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'SCHEDULED', passenger_id: 'pax-1' }),
        expect.anything(),
      );
    });

    it('throws SCHEDULED_TOO_SOON if scheduledFor < NOW + 30min', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeMockDb(null);

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);

      const input = makeInput({
        scheduledFor: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // only 10min from now
      });

      await expect(svc.schedule(input)).rejects.toMatchObject({ code: 'SCHEDULED_TOO_SOON' });
    });

    it('throws PASSENGER_HAS_ACTIVE_TRIP if passenger has an active trip', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeMockDb({ id: 'trip-active', status: 'IN_PROGRESS' }); // active trip exists

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      await expect(svc.schedule(makeInput())).rejects.toMatchObject({ code: 'PASSENGER_HAS_ACTIVE_TRIP' });
    });

    it('throws PASSENGER_HAS_ACTIVE_TRIP if passenger has a SCHEDULED trip', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeMockDb({ id: 'trip-sched', status: 'SCHEDULED' });

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      await expect(svc.schedule(makeInput())).rejects.toMatchObject({ code: 'PASSENGER_HAS_ACTIVE_TRIP' });
    });

    it('throws TRIP_TYPE_NOT_FOUND if the trip type does not exist', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      pricingRepo.findTripTypeById.mockResolvedValue(null);
      const { db } = makeMockDb(null);

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      await expect(svc.schedule(makeInput())).rejects.toMatchObject({ code: 'TRIP_TYPE_NOT_FOUND' });
    });

    it('throws VALIDATION_ERROR if scheduledFor is not a valid date', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeMockDb(null);

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      const input = makeInput({ scheduledFor: 'not-a-date' });

      await expect(svc.schedule(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('throws ORIGIN_EQUALS_DESTINATION if origin and destination coords are the same', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeMockDb(null);

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      const input = makeInput({
        origin: { lat: 19.4326, lng: -99.1332, address: 'CDMX' },
        destination: { lat: 19.4326, lng: -99.1332, address: 'CDMX' },
      });

      await expect(svc.schedule(input)).rejects.toMatchObject({ code: 'ORIGIN_EQUALS_DESTINATION' });
    });

    it('throws DISTANCE_EXCEEDS_LIMIT when estimated distance > 200km', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeMockDb(null);

      pricingEngine.estimate.mockReturnValue({ ...makeEstimate(), estimated_distance_km: 250 });

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      await expect(svc.schedule(makeInput())).rejects.toMatchObject({ code: 'DISTANCE_EXCEEDS_LIMIT' });
    });

    it('applies regionConfig tax rate when available', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      pricingRepo.findRegionConfig.mockResolvedValue({ id: 'region-mx', country_code: 'MX', tax_rate: 0.16 });
      const { db } = makeMockDb(null);

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      const result = await svc.schedule(makeInput());

      expect(pricingEngine.estimate).toHaveBeenCalledWith(
        expect.objectContaining({ regionTaxPct: 0.16 }),
      );
      expect(result.tripId).toBe('trip-1');
    });
  });

  // --------------------------------------------------------------------------
  // getScheduled()
  // --------------------------------------------------------------------------

  describe('getScheduled()', () => {
    it('returns list of scheduled trips for the passenger', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const rows = [makeScheduledTripRow(), makeScheduledTripRow({ id: 'st-2', trip_id: 'trip-2' })];
      scheduledRepo.findByPassenger.mockResolvedValue(rows);

      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeMockDb(null);

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      const result = await svc.getScheduled('pax-1');

      expect(result).toHaveLength(2);
      expect(scheduledRepo.findByPassenger).toHaveBeenCalledWith('pax-1');
    });

    it('returns empty array when passenger has no scheduled trips', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      scheduledRepo.findByPassenger.mockResolvedValue([]);

      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeMockDb(null);

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      const result = await svc.getScheduled('pax-1');

      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // cancel()
  // --------------------------------------------------------------------------

  describe('cancel()', () => {
    function makeDbForCancel(
      trip: Record<string, unknown> | null,
    ) {
      const firstMock = jest.fn().mockResolvedValue(trip);
      const updateMock = jest.fn().mockResolvedValue(1);
      const insertMock = jest.fn().mockResolvedValue([]);
      const whereMock = jest.fn().mockReturnThis();
      const whereNullMock = jest.fn().mockReturnThis();

      const trxTableChain = {
        where: whereMock,
        update: updateMock,
        insert: insertMock,
        whereNull: whereNullMock,
        first: firstMock,
      };

      const trx = jest.fn().mockReturnValue(trxTableChain) as unknown as Knex.Transaction;
      const dbTableChain = { ...trxTableChain };
      const db = jest.fn().mockReturnValue(dbTableChain) as unknown as Knex;

      (db as unknown as { transaction: jest.Mock }).transaction = jest.fn().mockImplementation(
        async (cb: (trx: Knex.Transaction) => Promise<unknown>) => cb(trx),
      );

      return { db };
    }

    it('cancels a SCHEDULED trip successfully', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeDbForCancel({ id: 'trip-1', passenger_id: 'pax-1', status: 'SCHEDULED' });

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      await expect(svc.cancel('pax-1', 'trip-1')).resolves.toBeUndefined();
    });

    it('throws TRIP_NOT_FOUND if the trip does not exist', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeDbForCancel(null);

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      await expect(svc.cancel('pax-1', 'trip-x')).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND' });
    });

    it('throws FORBIDDEN if the trip belongs to a different passenger', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeDbForCancel({ id: 'trip-1', passenger_id: 'other-pax', status: 'SCHEDULED' });

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      await expect(svc.cancel('pax-1', 'trip-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws TRIP_NOT_SCHEDULED if the trip is not in SCHEDULED status', async () => {
      const scheduledRepo = makeMockScheduledRepo();
      const tripsRepo = makeMockTripsRepo();
      const pricingEngine = makeMockPricingEngine();
      const pricingRepo = makeMockPricingRepo();
      const { db } = makeDbForCancel({ id: 'trip-1', passenger_id: 'pax-1', status: 'IN_PROGRESS' });

      const svc = new ScheduledTripsService(db, scheduledRepo, tripsRepo, pricingEngine, pricingRepo);
      await expect(svc.cancel('pax-1', 'trip-1')).rejects.toMatchObject({ code: 'TRIP_NOT_SCHEDULED' });
    });
  });
});
