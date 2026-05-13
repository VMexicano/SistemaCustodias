/**
 * custody.service.test.ts — unit tests for CustodyService
 *
 * All external dependencies are mocked (no Testcontainers).
 */

import { CustodyService } from '../../modules/custody/custody.service.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { CustodyRepository, CustodyEventRow } from '../../modules/custody/custody.repository.js';
import type { TripsRepository } from '../../modules/trips/trips.repository.js';
import type { DriversRepository } from '../../modules/drivers/drivers.repository.js';
import type { Trip } from '../../modules/trips/trips.types.js';
import type { Driver } from '../../modules/drivers/drivers.repository.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    region_id: 'region-1',
    passenger_id: 'user-passenger-1',
    driver_id: 'driver-1',
    trip_type_id: 'type-1',
    status: 'IN_PROGRESS',
    origin_lat: 19.4326,
    origin_lng: -99.1332,
    origin_address: 'CDMX Centro',
    destination_lat: 19.39,
    destination_lng: -99.17,
    destination_address: 'Polanco',
    estimated_distance_km: 10,
    estimated_duration_min: 20,
    estimated_fare: 150,
    actual_distance_km: null,
    actual_duration_min: null,
    final_fare: null,
    pricing_snapshot: null,
    accepted_at: new Date(),
    approved_at: null,
    approved_by: null,
    started_at: new Date(),
    completed_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'driver-1',
    user_id: 'user-driver-1',
    region_id: 'region-1',
    license_number: 'LIC-001',
    license_expiry: new Date(),
    status: 'approved',
    service_modes: ['people'],
    online: true,
    rating_avg: 4.5,
    rating_count: 10,
    total_trips: 20,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeCustodyEvent(overrides: Partial<CustodyEventRow> = {}): CustodyEventRow {
  return {
    id: 'event-1',
    trip_id: 'trip-1',
    event_type: 'pick_up',
    actor_id: 'driver-1',
    actor_name: 'Test Driver',
    signature_url: null,
    photo_url: null,
    declared_value: null,
    notes: null,
    lat: null,
    lng: null,
    occurred_at: new Date().toISOString(),
    sequence: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

function makeMockCustodyRepo(): jest.Mocked<CustodyRepository> {
  return {
    createEvent: jest.fn().mockResolvedValue(makeCustodyEvent()),
    getEventsByTrip: jest.fn().mockResolvedValue([makeCustodyEvent()]),
  } as unknown as jest.Mocked<CustodyRepository>;
}

function makeMockTripsRepo(trip: Trip | null = makeTrip()): jest.Mocked<TripsRepository> {
  return {
    findById: jest.fn().mockResolvedValue(trip),
  } as unknown as jest.Mocked<TripsRepository>;
}

function makeMockDriversRepo(driver: Driver | undefined = makeDriver()): jest.Mocked<DriversRepository> {
  return {
    findByUserId: jest.fn().mockResolvedValue(driver),
  } as unknown as jest.Mocked<DriversRepository>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CustodyService', () => {
  // --------------------------------------------------------------------------
  // createEvent
  // --------------------------------------------------------------------------

  describe('createEvent()', () => {
    it('creates pick_up event with sequence 1 on new trip', async () => {
      const custodyRepo = makeMockCustodyRepo();
      const tripsRepo = makeMockTripsRepo();
      const driversRepo = makeMockDriversRepo();
      custodyRepo.createEvent.mockResolvedValue(makeCustodyEvent({ sequence: 1 }));

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);
      const result = await svc.createEvent({
        tripId: 'trip-1',
        eventType: 'pick_up',
        actorUserId: 'user-driver-1',
      });

      expect(result.sequence).toBe(1);
      expect(result.event_type).toBe('pick_up');
      expect(custodyRepo.createEvent).toHaveBeenCalledTimes(1);
    });

    it('increments sequence correctly for same trip', async () => {
      const custodyRepo = makeMockCustodyRepo();
      const tripsRepo = makeMockTripsRepo();
      const driversRepo = makeMockDriversRepo();
      custodyRepo.createEvent.mockResolvedValue(makeCustodyEvent({ sequence: 2, event_type: 'handoff' }));

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);
      const result = await svc.createEvent({
        tripId: 'trip-1',
        eventType: 'handoff',
        actorUserId: 'user-driver-1',
      });

      expect(result.sequence).toBe(2);
      expect(result.event_type).toBe('handoff');
    });

    it('throws TRIP_NOT_FOUND when trip does not exist', async () => {
      const custodyRepo = makeMockCustodyRepo();
      const tripsRepo = makeMockTripsRepo(null);
      const driversRepo = makeMockDriversRepo();

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);

      await expect(
        svc.createEvent({ tripId: 'nonexistent', eventType: 'pick_up', actorUserId: 'user-driver-1' }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND' });

      expect(custodyRepo.createEvent).not.toHaveBeenCalled();
    });

    it('throws FORBIDDEN when actor is not the trip driver', async () => {
      const custodyRepo = makeMockCustodyRepo();
      // Trip has driver_id: 'driver-1', but actor is associated with 'driver-other'
      const tripsRepo = makeMockTripsRepo(makeTrip({ driver_id: 'driver-1' }));
      const driversRepo = makeMockDriversRepo(makeDriver({ id: 'driver-other', user_id: 'user-other' }));

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);

      await expect(
        svc.createEvent({ tripId: 'trip-1', eventType: 'pick_up', actorUserId: 'user-other' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      expect(custodyRepo.createEvent).not.toHaveBeenCalled();
    });

    it('throws TRIP_NOT_ACTIVE when trip is COMPLETED', async () => {
      const custodyRepo = makeMockCustodyRepo();
      const tripsRepo = makeMockTripsRepo(makeTrip({ status: 'COMPLETED' }));
      const driversRepo = makeMockDriversRepo();

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);

      await expect(
        svc.createEvent({ tripId: 'trip-1', eventType: 'pick_up', actorUserId: 'user-driver-1' }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_ACTIVE' });

      expect(custodyRepo.createEvent).not.toHaveBeenCalled();
    });

    it('throws TRIP_NOT_ACTIVE when trip is CANCELLED', async () => {
      const custodyRepo = makeMockCustodyRepo();
      const tripsRepo = makeMockTripsRepo(makeTrip({ status: 'CANCELLED' }));
      const driversRepo = makeMockDriversRepo();

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);

      await expect(
        svc.createEvent({ tripId: 'trip-1', eventType: 'pick_up', actorUserId: 'user-driver-1' }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_ACTIVE' });

      expect(custodyRepo.createEvent).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // getEventsByTrip
  // --------------------------------------------------------------------------

  describe('getEventsByTrip()', () => {
    it('getEventsByTrip returns events ordered by sequence ASC', async () => {
      const custodyRepo = makeMockCustodyRepo();
      const events = [
        makeCustodyEvent({ id: 'e1', sequence: 1, event_type: 'pick_up' }),
        makeCustodyEvent({ id: 'e2', sequence: 2, event_type: 'handoff' }),
      ];
      custodyRepo.getEventsByTrip.mockResolvedValue(events);

      const tripsRepo = makeMockTripsRepo();
      const driversRepo = makeMockDriversRepo();

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);
      const result = await svc.getEventsByTrip({
        tripId: 'trip-1',
        requestingUserId: 'user-driver-1',
        requestingUserRoles: ['driver'],
      });

      expect(result).toHaveLength(2);
      expect(result[0]!.sequence).toBe(1);
      expect(result[1]!.sequence).toBe(2);
    });

    it('getEventsByTrip returns empty array when no events', async () => {
      const custodyRepo = makeMockCustodyRepo();
      custodyRepo.getEventsByTrip.mockResolvedValue([]);

      const tripsRepo = makeMockTripsRepo();
      const driversRepo = makeMockDriversRepo();

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);
      const result = await svc.getEventsByTrip({
        tripId: 'trip-1',
        requestingUserId: 'user-driver-1',
        requestingUserRoles: ['driver'],
      });

      expect(result).toEqual([]);
    });

    it('getEventsByTrip throws TRIP_NOT_FOUND when trip does not exist', async () => {
      const custodyRepo = makeMockCustodyRepo();
      const tripsRepo = makeMockTripsRepo(null);
      const driversRepo = makeMockDriversRepo();

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);

      await expect(
        svc.getEventsByTrip({ tripId: 'nonexistent', requestingUserId: 'user-driver-1', requestingUserRoles: ['driver'] }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND' });
    });

    it('getEventsByTrip throws FORBIDDEN when requester is neither driver nor passenger', async () => {
      const custodyRepo = makeMockCustodyRepo();
      // Trip: driver-1 / passenger-1; stranger tries to access
      const tripsRepo = makeMockTripsRepo(makeTrip({ driver_id: 'driver-1', passenger_id: 'user-passenger-1' }));
      const driversRepo = makeMockDriversRepo(makeDriver({ id: 'driver-2', user_id: 'stranger' }));

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);

      await expect(
        svc.getEventsByTrip({ tripId: 'trip-1', requestingUserId: 'stranger', requestingUserRoles: ['driver'] }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('getEventsByTrip succeeds for admin regardless of trip assignment', async () => {
      const custodyRepo = makeMockCustodyRepo();
      custodyRepo.getEventsByTrip.mockResolvedValue([]);
      const tripsRepo = makeMockTripsRepo(makeTrip({ driver_id: 'driver-1' }));
      const driversRepo = makeMockDriversRepo();

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);
      const result = await svc.getEventsByTrip({
        tripId: 'trip-1',
        requestingUserId: 'admin-user',
        requestingUserRoles: ['admin'],
      });

      expect(result).toEqual([]);
      expect(driversRepo.findByUserId).not.toHaveBeenCalled();
    });

    it('getEventsByTrip succeeds when requester is the trip passenger', async () => {
      const custodyRepo = makeMockCustodyRepo();
      custodyRepo.getEventsByTrip.mockResolvedValue([makeCustodyEvent()]);
      // passenger_id matches requestingUserId
      const tripsRepo = makeMockTripsRepo(makeTrip({ passenger_id: 'user-passenger-1', driver_id: 'driver-1' }));
      const driversRepo = makeMockDriversRepo(makeDriver({ id: 'driver-99', user_id: 'user-passenger-1' }));

      const svc = new CustodyService(custodyRepo, tripsRepo, driversRepo);
      const result = await svc.getEventsByTrip({
        tripId: 'trip-1',
        requestingUserId: 'user-passenger-1',
        requestingUserRoles: ['passenger'],
      });

      expect(result).toHaveLength(1);
    });
  });
});
