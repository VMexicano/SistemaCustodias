/**
 * temperature.service.test.ts — unit tests for TemperatureService
 *
 * All external dependencies are mocked.
 */

import { TemperatureService } from '../../modules/temperature/temperature.service.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { TemperatureRepository } from '../../modules/temperature/temperature.repository.js';
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
    passenger_id: 'passenger-1',
    driver_id: 'driver-1',
    trip_type_id: 'type-1',
    status: 'IN_PROGRESS',
    origin_lat: 19.4326,
    origin_lng: -99.1332,
    origin_address: 'CDMX Centro',
    destination_lat: 19.39,
    destination_lng: -99.17,
    destination_address: 'Polanco',
    estimated_distance_km: 5,
    estimated_duration_min: 15,
    estimated_fare: 100,
    actual_distance_km: null,
    actual_duration_min: null,
    final_fare: null,
    pricing_snapshot: null,
    accepted_at: null,
    approved_at: null,
    approved_by: null,
    started_at: null,
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
    license_number: 'LIC123',
    license_expiry: new Date('2027-01-01'),
    status: 'approved',
    service_modes: ['people'],
    online: true,
    rating_avg: 4.8,
    rating_count: 50,
    total_trips: 100,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builder
// ---------------------------------------------------------------------------

function makeMockTemperatureRepo(): jest.Mocked<TemperatureRepository> {
  return {
    createReading: jest.fn().mockResolvedValue(undefined),
    getReadings: jest.fn().mockResolvedValue([]),
    getSummary: jest.fn().mockResolvedValue({
      min: 0,
      max: 0,
      avg: 0,
      out_of_range_count: 0,
      total_readings: 0,
    }),
  } as unknown as jest.Mocked<TemperatureRepository>;
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

describe('TemperatureService', () => {
  // --------------------------------------------------------------------------
  // createReading
  // --------------------------------------------------------------------------

  describe('createReading()', () => {
    it('creates reading for IN_PROGRESS trip', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      const tripsRepo = makeMockTripsRepo(makeTrip({ status: 'IN_PROGRESS', driver_id: 'driver-1' }));
      const driversRepo = makeMockDriversRepo(makeDriver({ id: 'driver-1', user_id: 'user-driver-1' }));
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      await svc.createReading({
        tripId: 'trip-1',
        actorUserId: 'user-driver-1',
        celsius: 22.5,
      });

      expect(temperatureRepo.createReading).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: 'trip-1', celsius: 22.5 }),
      );
    });

    it('throws TRIP_NOT_FOUND when trip does not exist', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      const tripsRepo = makeMockTripsRepo(null);
      const driversRepo = makeMockDriversRepo();
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      await expect(
        svc.createReading({ tripId: 'nonexistent', actorUserId: 'user-driver-1', celsius: 22 }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND' });
    });

    it('throws TRIP_NOT_IN_PROGRESS when trip is ACCEPTED', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      const tripsRepo = makeMockTripsRepo(makeTrip({ status: 'ACCEPTED' }));
      const driversRepo = makeMockDriversRepo();
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      await expect(
        svc.createReading({ tripId: 'trip-1', actorUserId: 'user-driver-1', celsius: 22 }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_IN_PROGRESS' });
    });

    it('throws INVALID_TEMPERATURE for celsius > 200', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      const tripsRepo = makeMockTripsRepo(makeTrip({ status: 'IN_PROGRESS' }));
      const driversRepo = makeMockDriversRepo();
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      await expect(
        svc.createReading({ tripId: 'trip-1', actorUserId: 'user-driver-1', celsius: 201 }),
      ).rejects.toMatchObject({ code: 'INVALID_TEMPERATURE' });
    });

    it('throws INVALID_TEMPERATURE for celsius < -100', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      const tripsRepo = makeMockTripsRepo(makeTrip({ status: 'IN_PROGRESS' }));
      const driversRepo = makeMockDriversRepo();
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      await expect(
        svc.createReading({ tripId: 'trip-1', actorUserId: 'user-driver-1', celsius: -101 }),
      ).rejects.toMatchObject({ code: 'INVALID_TEMPERATURE' });
    });

    it('throws FORBIDDEN when actor is not the trip driver', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      const tripsRepo = makeMockTripsRepo(makeTrip({ status: 'IN_PROGRESS', driver_id: 'driver-1' }));
      // Driver found but it's a different driver (id 'driver-2')
      const driversRepo = makeMockDriversRepo(makeDriver({ id: 'driver-2', user_id: 'user-other' }));
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      await expect(
        svc.createReading({ tripId: 'trip-1', actorUserId: 'user-other', celsius: 22 }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // --------------------------------------------------------------------------
  // getTemperature (getSummary behaviour)
  // --------------------------------------------------------------------------

  describe('getTemperature() — errors', () => {
    it('throws TRIP_NOT_FOUND when trip does not exist', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      const tripsRepo = makeMockTripsRepo(null);
      const driversRepo = makeMockDriversRepo();
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      await expect(
        svc.getTemperature({ tripId: 'nonexistent' }),
      ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND' });
    });
  });

  describe('getTemperature() — summary', () => {
    it('getSummary returns min/max/avg correctly', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      temperatureRepo.getSummary.mockResolvedValue({
        min: -5,
        max: 30,
        avg: 12.5,
        out_of_range_count: 0,
        total_readings: 10,
      });
      const tripsRepo = makeMockTripsRepo(makeTrip({ metadata: {} }));
      const driversRepo = makeMockDriversRepo();
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      const result = await svc.getTemperature({ tripId: 'trip-1' });

      expect(result.summary).toMatchObject({ min: -5, max: 30, avg: 12.5 });
    });

    it('getSummary returns out_of_range_count = 0 when no setpoints in metadata', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      temperatureRepo.getSummary.mockResolvedValue({
        min: 5,
        max: 25,
        avg: 15,
        out_of_range_count: 0,
        total_readings: 5,
      });
      const tripsRepo = makeMockTripsRepo(makeTrip({ metadata: {} }));
      const driversRepo = makeMockDriversRepo();
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      const result = await svc.getTemperature({ tripId: 'trip-1' });

      // No setpoints → getSummary called without setpoints arg → out_of_range_count = 0
      expect(temperatureRepo.getSummary).toHaveBeenCalledWith('trip-1', undefined);
      expect(result.summary.out_of_range_count).toBe(0);
    });

    it('getSummary counts out_of_range correctly when setpoints exist', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      temperatureRepo.getSummary.mockResolvedValue({
        min: 0,
        max: 35,
        avg: 18,
        out_of_range_count: 3,
        total_readings: 10,
      });
      const setpoints = { min_celsius: 2, max_celsius: 8 };
      const tripsRepo = makeMockTripsRepo(makeTrip({ metadata: { setpoints } }));
      const driversRepo = makeMockDriversRepo();
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      const result = await svc.getTemperature({ tripId: 'trip-1' });

      expect(temperatureRepo.getSummary).toHaveBeenCalledWith('trip-1', setpoints);
      expect(result.summary.out_of_range_count).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // getReadings date range filter
  // --------------------------------------------------------------------------

  describe('getTemperature() — readings filter', () => {
    it('getReadings filters by from/to date range', async () => {
      const temperatureRepo = makeMockTemperatureRepo();
      const reading = {
        trip_id: 'trip-1',
        recorded_at: '2026-04-01T10:00:00Z',
        celsius: 5,
        sensor_id: null,
        lat: null,
        lng: null,
      };
      temperatureRepo.getReadings.mockResolvedValue([reading]);
      const tripsRepo = makeMockTripsRepo(makeTrip({ metadata: {} }));
      const driversRepo = makeMockDriversRepo();
      const svc = new TemperatureService(temperatureRepo, tripsRepo, driversRepo);

      const result = await svc.getTemperature({
        tripId: 'trip-1',
        from: '2026-04-01T00:00:00Z',
        to: '2026-04-01T23:59:59Z',
        limit: 50,
      });

      expect(temperatureRepo.getReadings).toHaveBeenCalledWith('trip-1', {
        from: '2026-04-01T00:00:00Z',
        to: '2026-04-01T23:59:59Z',
        limit: 50,
      });
      expect(result.readings).toHaveLength(1);
      expect(result.readings[0]!.celsius).toBe(5);
    });
  });
});
