/**
 * trips.service.ts — unit tests
 *
 * Covers branches not reached by integration tests:
 *   - resolveDriverId: DRIVER_NOT_FOUND, DRIVER_NOT_APPROVED
 *   - acceptTrip:      TRIP_NOT_FOUND (inside transaction)
 *   - updateStatus:    DRIVER_NOT_FOUND, TRIP_NOT_FOUND
 *   - cancelTrip:      DRIVER_NOT_FOUND, TRIP_NOT_FOUND, FORBIDDEN (passenger & driver)
 *                      re-throw non-cancellation errors
 *   - changeDestination: TRIP_NOT_FOUND, ONLY_PASSENGER_CAN_CHANGE_DESTINATION
 *   - handleSearchingTimeout: trip not found, trip not SEARCHING, auto-cancel path
 *   - createTrip: requiresApproval routing
 *   - approveTrip: with/without driver, wrong status, driver not available
 *   - rejectTrip: happy path, wrong status, empty reason
 *   - findPendingApproval: via getPendingApproval
 *
 * All DB and repository calls are mocked — no real database needed.
 */

import type { Knex } from 'knex';
import { TripsService } from '../../modules/trips/trips.service.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { TripsRepository, TripWithWait } from '../../modules/trips/trips.repository.js';
import type { PricingService } from '../../modules/pricing/pricing.service.js';
import type { PricingEngine } from '../../modules/pricing/pricing-engine.js';
import type { TripStateMachine } from '../../modules/trips/trip-state-machine.js';
import type { DriversRepository } from '../../modules/drivers/drivers.repository.js';
import type { Trip } from '../../modules/trips/trips.types.js';
import type { VerticalsService } from '../../modules/verticals/verticals.service.js';
import type { TrackingService } from '../../modules/tracking/tracking.service.js';

// Mock BullMQ queue so no real Redis connection is needed
jest.mock('../../modules/trips/trips.queue.js', () => ({
  tripsQueue: {
    enqueueSearchingTimeout: jest.fn().mockResolvedValue(undefined),
    enqueuePromoteApproved: jest.fn().mockResolvedValue(undefined),
    cancelSearchingTimeout: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock realtime so getIO() doesn't throw
jest.mock('../../modules/realtime/realtime.plugin.js', () => ({
  getIO: jest.fn().mockReturnValue(null),
}));

jest.mock('../../modules/payments/payment.queue.js', () => ({
  paymentQueue: { enqueue: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../modules/notifications/notification.queue.js', () => ({
  notificationQueue: { enqueue: jest.fn().mockResolvedValue(undefined) },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    region_id: 'region-mx',
    passenger_id: 'pax-1',
    driver_id: null,
    trip_type_id: 'tt-1',
    status: 'SEARCHING',
    origin_lat: 19.4326,
    origin_lng: -99.1332,
    origin_address: 'CDMX',
    destination_lat: 19.5,
    destination_lng: -99.2,
    destination_address: 'Destino',
    estimated_distance_km: 10,
    estimated_duration_min: 20,
    estimated_fare: 150,
    actual_distance_km: null,
    actual_duration_min: null,
    final_fare: null,
    pricing_snapshot: { region_id: 'region-mx', tax_pct: 0.16, base_fare: 30, per_km_rate: 5, per_min_rate: 1, min_fare: 50 },
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

/** Creates a minimal mock Knex transaction */
function makeMockTrx(lockReturn: Trip | null = null) {
  const trx = jest.fn() as unknown as jest.MockedFunction<Knex.Transaction>;
  const mockTransaction = jest.fn().mockImplementation(async (fn: (trx: Knex.Transaction) => Promise<unknown>) => fn(trx));
  return { trx, mockTransaction };
}

function makeService(overrides: {
  tripsRepo?: Partial<TripsRepository>;
  pricingService?: Partial<PricingService>;
  pricingEngine?: Partial<PricingEngine>;
  stateMachine?: Partial<TripStateMachine>;
  driversRepo?: Partial<DriversRepository>;
  db?: Partial<Knex>;
  verticalService?: Partial<VerticalsService>;
  trackingService?: Partial<TrackingService>;
} = {}) {
  const tripsRepo: jest.Mocked<TripsRepository> = {
    create: jest.fn(),
    findById: jest.fn(),
    findActiveByPassengerId: jest.fn().mockResolvedValue(null),
    findActiveByDriverId: jest.fn().mockResolvedValue(null),
    findAllActiveByDriverId: jest.fn().mockResolvedValue([]),
    findByPassengerId: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findPendingApproval: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    update: jest.fn(),
    insertStatusHistory: jest.fn(),
    findStatusHistory: jest.fn().mockResolvedValue([]),
    findByIdForUpdate: jest.fn(),
    ...overrides.tripsRepo,
  } as jest.Mocked<TripsRepository>;

  const pricingService: jest.Mocked<PricingService> = {
    estimate: jest.fn(),
    ...overrides.pricingService,
  } as jest.Mocked<PricingService>;

  const pricingEngine: jest.Mocked<PricingEngine> = {
    calculateDistanceKm: jest.fn().mockReturnValue(10),
    recalculate: jest.fn().mockReturnValue({ final_fare: 200, estimated_distance_km: 12 }),
    estimate: jest.fn(),
    applyFactors: jest.fn(),
    ...overrides.pricingEngine,
  } as jest.Mocked<PricingEngine>;

  const stateMachine: jest.Mocked<TripStateMachine> = {
    canTransition: jest.fn().mockReturnValue(true),
    getCancellationFee: jest.fn().mockReturnValue(0),
    transition: jest.fn().mockResolvedValue({
      success: true,
      newStatus: 'CANCELLED',
      cancellationFee: 0,
      historyEntry: {},
    }),
    ...overrides.stateMachine,
  } as jest.Mocked<TripStateMachine>;

  const driversRepo: jest.Mocked<DriversRepository> = {
    findByUserId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    findAll: jest.fn(),
    findByLicenseNumber: jest.fn(),
    ...overrides.driversRepo,
  } as unknown as jest.Mocked<DriversRepository>;

  const verticalService: jest.Mocked<VerticalsService> = {
    getConfig: jest.fn().mockResolvedValue({ features: { requiresApproval: false } }),
    getAll: jest.fn(),
    updateFeatures: jest.fn(),
    ...overrides.verticalService,
  } as unknown as jest.Mocked<VerticalsService>;

  const { mockTransaction } = makeMockTrx();
  const db = {
    transaction: mockTransaction,
    ...overrides.db,
  } as unknown as Knex;

  const trackingSvc = overrides.trackingService as unknown as TrackingService | undefined;
  const service = new TripsService(
    tripsRepo,
    pricingService,
    pricingEngine,
    stateMachine,
    db,
    driversRepo,
    trackingSvc,
  );
  service.setVerticalService(verticalService);

  return { service, tripsRepo, pricingService, pricingEngine, stateMachine, driversRepo, db, verticalService };
}

// ---------------------------------------------------------------------------
// resolveDriverId (private — tested via acceptTrip)
// ---------------------------------------------------------------------------

describe('TripsService.acceptTrip() — driver validation', () => {
  it('throws DRIVER_NOT_FOUND when driversRepo.findByUserId returns null', async () => {
    const { service, driversRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue(undefined);

    await expect(service.acceptTrip('trip-1', 'user-1')).rejects.toMatchObject({
      code: 'DRIVER_NOT_FOUND',
    });
  });

  it('throws DRIVER_NOT_APPROVED when driver status is not approved', async () => {
    const { service, driversRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'pending' } as never);

    await expect(service.acceptTrip('trip-1', 'user-1')).rejects.toMatchObject({
      code: 'DRIVER_NOT_APPROVED',
    });
  });

  it('throws TRIP_NOT_FOUND when trip does not exist inside transaction', async () => {
    const { service, driversRepo, tripsRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'approved' } as never);
    tripsRepo.findByIdForUpdate.mockResolvedValue(null);

    await expect(service.acceptTrip('trip-1', 'user-1')).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// updateStatus — driver validation
// ---------------------------------------------------------------------------

describe('TripsService.updateStatus()', () => {
  it('throws DRIVER_NOT_FOUND when no driver profile exists', async () => {
    const { service, driversRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue(undefined);

    await expect(service.updateStatus('trip-1', 'user-1', 'DRIVER_EN_ROUTE')).rejects.toMatchObject({
      code: 'DRIVER_NOT_FOUND',
    });
  });

  it('throws TRIP_NOT_FOUND when trip does not exist inside transaction', async () => {
    const { service, driversRepo, tripsRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'approved' } as never);
    tripsRepo.findByIdForUpdate.mockResolvedValue(null);

    await expect(service.updateStatus('trip-1', 'user-1', 'DRIVER_EN_ROUTE')).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// cancelTrip — branches
// ---------------------------------------------------------------------------

describe('TripsService.cancelTrip()', () => {
  it('throws DRIVER_NOT_FOUND when actorType=driver and no driver profile', async () => {
    const { service, driversRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue(undefined);

    await expect(service.cancelTrip('trip-1', 'user-1', 'driver')).rejects.toMatchObject({
      code: 'DRIVER_NOT_FOUND',
    });
  });

  it('throws TRIP_NOT_FOUND when trip does not exist inside transaction', async () => {
    const { service, driversRepo, tripsRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'approved' } as never);
    tripsRepo.findByIdForUpdate.mockResolvedValue(null);

    await expect(service.cancelTrip('trip-1', 'user-1', 'driver')).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when passenger tries to cancel someone else\'s trip', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ passenger_id: 'other-pax' }));

    await expect(service.cancelTrip('trip-1', 'pax-1', 'passenger')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws FORBIDDEN when driver tries to cancel someone else\'s trip', async () => {
    const { service, driversRepo, tripsRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'other-driver', status: 'approved' } as never);
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ driver_id: 'driver-1' }));

    await expect(service.cancelTrip('trip-1', 'user-1', 'driver')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('re-throws non-cancellation BusinessErrors from state machine', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ passenger_id: 'pax-1', status: 'SEARCHING' }));
    stateMachine.transition.mockRejectedValue(new BusinessError('NOT_AUTHORIZED_FOR_TRANSITION', 'Not authorized'));

    await expect(service.cancelTrip('trip-1', 'pax-1', 'passenger')).rejects.toMatchObject({
      code: 'NOT_AUTHORIZED_FOR_TRANSITION',
    });
  });
});

// ---------------------------------------------------------------------------
// changeDestination — branches
// ---------------------------------------------------------------------------

describe('TripsService.changeDestination()', () => {
  const newDest = { lat: 19.35, lng: -99.16, address: 'Coyoacán' };

  it('throws TRIP_NOT_FOUND when trip does not exist', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(null);

    await expect(service.changeDestination('trip-1', 'pax-1', newDest)).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
    });
  });

  it('throws ONLY_PASSENGER_CAN_CHANGE_DESTINATION when requester is not the passenger', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ status: 'IN_PROGRESS', passenger_id: 'other-pax' }));

    await expect(service.changeDestination('trip-1', 'pax-1', newDest)).rejects.toMatchObject({
      code: 'ONLY_PASSENGER_CAN_CHANGE_DESTINATION',
    });
  });
});

// ---------------------------------------------------------------------------
// handleSearchingTimeout — internal handler
// ---------------------------------------------------------------------------

describe('TripsService.handleSearchingTimeout()', () => {
  it('does nothing when trip is not found', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(null);

    // Should resolve without throwing
    await expect(service.handleSearchingTimeout('trip-1')).resolves.toBeUndefined();
  });

  it('does nothing when trip is no longer in SEARCHING state', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ status: 'ACCEPTED' }));

    await expect(service.handleSearchingTimeout('trip-1')).resolves.toBeUndefined();
  });

  it('auto-cancels trip when it is still SEARCHING', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    const trip = makeTrip({ status: 'SEARCHING' });
    tripsRepo.findById.mockResolvedValue(trip);
    tripsRepo.findByIdForUpdate.mockResolvedValue(trip);
    tripsRepo.update.mockResolvedValue({ ...trip, status: 'CANCELLED', cancelled_at: new Date() });
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'CANCELLED' as const,
      cancellationFee: 0,
      historyEntry: {
        trip_id: 'trip-1',
        from_status: 'SEARCHING' as const,
        to_status: 'CANCELLED' as const,
        changed_by: null,
        actor_type: 'system' as const,
        notes: null,
      },
    });

    await service.handleSearchingTimeout('trip-1');

    expect(stateMachine.transition).toHaveBeenCalledWith(expect.objectContaining({
      toStatus: 'CANCELLED',
      actor: 'system',
    }));
    expect(tripsRepo.update).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ status: 'CANCELLED' }),
      expect.anything(),
    );
  });

  it('does nothing inside transaction when status changed between outer and inner check', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    // Outer findById returns SEARCHING, but inner findByIdForUpdate returns ACCEPTED (race condition)
    tripsRepo.findById.mockResolvedValue(makeTrip({ status: 'SEARCHING' }));
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ status: 'ACCEPTED' }));

    await service.handleSearchingTimeout('trip-1');

    // transition should NOT be called because the inner check sees ACCEPTED
    expect(stateMachine.transition).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createTrip — requiresApproval routing
// ---------------------------------------------------------------------------

describe('TripsService.createTrip() — requiresApproval routing', () => {
  const dto = {
    origin: { lat: 19.4, lng: -99.1, address: 'Origin' },
    destination: { lat: 19.5, lng: -99.2, address: 'Destination' },
    trip_type_id: 'tt-1',
  };

  const mockEstimate = {
    final_fare: 150,
    estimated_distance_km: 10,
    estimated_duration_min: 20,
    pricing_snapshot: {
      region_id: 'region-mx',
      tax_pct: 0.16,
      base_fare: 30,
      per_km_rate: 5,
      per_min_rate: 1,
      min_fare: 50,
    },
  };

  it('creates trip with SEARCHING when requiresApproval is false', async () => {
    const { service, tripsRepo, pricingService, stateMachine, verticalService } = makeService();
    verticalService.getConfig.mockResolvedValue({ features: { requiresApproval: false } } as never);
    pricingService.estimate.mockResolvedValue(mockEstimate as never);
    const newTrip = makeTrip({ id: 'trip-new', status: 'REQUESTED' });
    tripsRepo.create.mockResolvedValue(newTrip);
    const searchingTrip = makeTrip({ id: 'trip-new', status: 'SEARCHING' });
    tripsRepo.update.mockResolvedValue(searchingTrip);
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'SEARCHING' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    const result = await service.createTrip('pax-1', dto);

    expect(result.status).toBe('SEARCHING');
    expect(stateMachine.transition).toHaveBeenCalledWith(expect.objectContaining({ toStatus: 'SEARCHING' }));
  });

  it('creates trip with PENDING_APPROVAL when requiresApproval is true', async () => {
    const { service, tripsRepo, pricingService, stateMachine, verticalService } = makeService();
    verticalService.getConfig.mockResolvedValue({ features: { requiresApproval: true } } as never);
    pricingService.estimate.mockResolvedValue(mockEstimate as never);
    const newTrip = makeTrip({ id: 'trip-new', status: 'REQUESTED' });
    tripsRepo.create.mockResolvedValue(newTrip);
    const pendingTrip = makeTrip({ id: 'trip-new', status: 'PENDING_APPROVAL' });
    tripsRepo.update.mockResolvedValue(pendingTrip);
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'PENDING_APPROVAL' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    const result = await service.createTrip('pax-1', dto);

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(stateMachine.transition).toHaveBeenCalledWith(expect.objectContaining({ toStatus: 'PENDING_APPROVAL' }));
  });
});

// ---------------------------------------------------------------------------
// approveTrip — dispatcher approval
// ---------------------------------------------------------------------------

describe('TripsService.approveTrip()', () => {
  it('approves trip without driver → status APPROVED, approved_at/approved_by saved, job enqueued', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    const pendingTrip = makeTrip({ status: 'PENDING_APPROVAL' });
    tripsRepo.findByIdForUpdate.mockResolvedValue(pendingTrip);
    const approvedTrip = makeTrip({
      status: 'APPROVED',
      approved_at: new Date(),
      approved_by: 'dispatcher-1',
    });
    tripsRepo.update.mockResolvedValue(approvedTrip);
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'APPROVED' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    const result = await service.approveTrip('trip-1', 'dispatcher-1');

    expect(result.status).toBe('APPROVED');
    expect(result.approved_by).toBe('dispatcher-1');
    expect(result.approved_at).toBeDefined();
    expect(tripsRepo.update).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ status: 'APPROVED', approved_by: 'dispatcher-1' }),
      expect.anything(),
    );

    // BullMQ job should be enqueued
    const { tripsQueue } = await import('../../modules/trips/trips.queue.js');
    expect(tripsQueue.enqueuePromoteApproved).toHaveBeenCalledWith('trip-1');
  });

  it('approves trip with valid online driver → status ACCEPTED', async () => {
    const { service, tripsRepo, driversRepo, stateMachine } = makeService();
    const pendingTrip = makeTrip({ status: 'PENDING_APPROVAL' });
    tripsRepo.findByIdForUpdate.mockResolvedValue(pendingTrip);
    const acceptedTrip = makeTrip({
      status: 'ACCEPTED',
      driver_id: 'driver-1',
      accepted_at: new Date(),
      approved_at: new Date(),
      approved_by: 'dispatcher-1',
    });
    tripsRepo.update.mockResolvedValue(acceptedTrip);
    driversRepo.findById.mockResolvedValue({ id: 'driver-1', status: 'approved', online: true } as never);
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'ACCEPTED' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    const result = await service.approveTrip('trip-1', 'dispatcher-1', 'driver-1');

    expect(result.status).toBe('ACCEPTED');
  });

  it('throws INVALID_TRIP_TRANSITION when trip is not PENDING_APPROVAL', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ status: 'SEARCHING' }));

    await expect(service.approveTrip('trip-1', 'dispatcher-1')).rejects.toMatchObject({
      code: 'INVALID_TRIP_TRANSITION',
    });
  });

  it('throws DRIVER_NOT_AVAILABLE when assigned driver is offline', async () => {
    const { service, driversRepo } = makeService();
    driversRepo.findById.mockResolvedValue({ id: 'driver-1', status: 'approved', online: false } as never);

    await expect(service.approveTrip('trip-1', 'dispatcher-1', 'driver-1')).rejects.toMatchObject({
      code: 'DRIVER_NOT_AVAILABLE',
    });
  });

  it('throws DRIVER_NOT_FOUND when assigned driver id does not exist', async () => {
    const { service, driversRepo } = makeService();
    driversRepo.findById.mockResolvedValue(undefined);

    await expect(service.approveTrip('trip-1', 'dispatcher-1', 'driver-nonexistent')).rejects.toMatchObject({
      code: 'DRIVER_NOT_FOUND',
    });
  });
});

// ---------------------------------------------------------------------------
// rejectTrip — dispatcher rejection
// ---------------------------------------------------------------------------

describe('TripsService.rejectTrip()', () => {
  it('rejects trip → status CANCELLED, cancellation_reason saved', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    const pendingTrip = makeTrip({ status: 'PENDING_APPROVAL' });
    tripsRepo.findByIdForUpdate.mockResolvedValue(pendingTrip);
    const cancelledTrip = makeTrip({
      status: 'CANCELLED',
      cancellation_reason: 'Cargo exceeds limit',
      cancelled_at: new Date(),
    });
    tripsRepo.update.mockResolvedValue(cancelledTrip);
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'CANCELLED' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    const result = await service.rejectTrip('trip-1', 'dispatcher-1', 'Cargo exceeds limit');

    expect(result.status).toBe('CANCELLED');
    expect(result.cancellation_reason).toBe('Cargo exceeds limit');
  });

  it('throws INVALID_TRIP_TRANSITION when trip is not PENDING_APPROVAL', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ status: 'SEARCHING' }));

    await expect(service.rejectTrip('trip-1', 'dispatcher-1', 'reason')).rejects.toMatchObject({
      code: 'INVALID_TRIP_TRANSITION',
    });
  });

  it('throws VALIDATION_ERROR when reason is empty', async () => {
    const { service } = makeService();

    await expect(service.rejectTrip('trip-1', 'dispatcher-1', '')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('throws VALIDATION_ERROR when reason is whitespace only', async () => {
    const { service } = makeService();

    await expect(service.rejectTrip('trip-1', 'dispatcher-1', '   ')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

// ---------------------------------------------------------------------------
// getPendingApproval — delegates to repository
// ---------------------------------------------------------------------------

describe('TripsService.getPendingApproval()', () => {
  it('returns only PENDING_APPROVAL trips with wait_minutes from repository', async () => {
    const pendingTrip: TripWithWait = {
      ...makeTrip({ status: 'PENDING_APPROVAL' }),
      passenger_phone: '+521234567890',
      wait_minutes: 7.5,
    };
    const { service, tripsRepo } = makeService({
      tripsRepo: {
        findPendingApproval: jest.fn().mockResolvedValue({ data: [pendingTrip], total: 1 }),
      },
    });

    const result = await service.getPendingApproval(20, 0);

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.wait_minutes).toBe(7.5);
    expect(result.data[0]!.status).toBe('PENDING_APPROVAL');
    expect(tripsRepo.findPendingApproval).toHaveBeenCalledWith(20, 0);
  });
});

// ===========================================================================
// getTripTrack — access control + tracking service delegation
// ===========================================================================

describe('TripsService.getTripTrack()', () => {
  it('throws TRIP_NOT_FOUND when trip does not exist', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(null);

    await expect(service.getTripTrack('trip-1', 'user-1', 'passenger')).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
    });
  });

  it('allows admin to view any trip regardless of ownership', async () => {
    const locations = [{ lat: 19.4, lng: -99.1, recorded_at: new Date().toISOString() }];
    const { service, tripsRepo } = makeService({
      trackingService: { getTripLocations: jest.fn().mockResolvedValue(locations) },
    });
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'other-pax' }));

    const result = await service.getTripTrack('trip-1', 'admin-1', 'admin');

    expect(result).toEqual({ locations, count: 1 });
  });

  it('allows passenger to view their own trip', async () => {
    const { service, tripsRepo } = makeService({
      trackingService: { getTripLocations: jest.fn().mockResolvedValue([]) },
    });
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'pax-1' }));

    await expect(service.getTripTrack('trip-1', 'pax-1', 'passenger')).resolves.toEqual({ locations: [], count: 0 });
  });

  it('throws FORBIDDEN when passenger tries to view someone else\'s trip', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'other-pax' }));

    await expect(service.getTripTrack('trip-1', 'pax-1', 'passenger')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws FORBIDDEN when driver profile is not found', async () => {
    const { service, tripsRepo, driversRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ driver_id: 'driver-1' }));
    driversRepo.findByUserId.mockResolvedValue(undefined);

    await expect(service.getTripTrack('trip-1', 'user-1', 'driver')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws FORBIDDEN when driver is not assigned to the trip', async () => {
    const { service, tripsRepo, driversRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ driver_id: 'other-driver' }));
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1' } as never);

    await expect(service.getTripTrack('trip-1', 'user-1', 'driver')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('returns empty locations when no trackingService is injected', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'pax-1' }));

    const result = await service.getTripTrack('trip-1', 'pax-1', 'passenger');

    expect(result).toEqual({ locations: [], count: 0 });
  });

  it('returns locations from trackingService for authorized driver', async () => {
    const locations = [{ lat: 19.4, lng: -99.1, recorded_at: new Date().toISOString() }];
    const { service, tripsRepo, driversRepo } = makeService({
      trackingService: { getTripLocations: jest.fn().mockResolvedValue(locations) },
    });
    tripsRepo.findById.mockResolvedValue(makeTrip({ driver_id: 'driver-1' }));
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1' } as never);

    const result = await service.getTripTrack('trip-1', 'user-1', 'driver');

    expect(result).toEqual({ locations, count: 1 });
  });
});

// ===========================================================================
// acceptTrip — trip stacking rules
// ===========================================================================

describe('TripsService.acceptTrip() — trip stacking', () => {
  it('throws DRIVER_TRIP_QUEUE_FULL when driver already has 2 active trips', async () => {
    const { service, driversRepo, tripsRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'approved' } as never);
    tripsRepo.findAllActiveByDriverId.mockResolvedValue([makeTrip(), makeTrip({ id: 'trip-2' })]);

    await expect(service.acceptTrip('trip-1', 'user-1')).rejects.toMatchObject({
      code: 'DRIVER_TRIP_QUEUE_FULL',
    });
  });

  it('throws DRIVER_HAS_ACTIVE_TRIP when driver has 1 active trip not in IN_PROGRESS', async () => {
    const { service, driversRepo, tripsRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'approved' } as never);
    tripsRepo.findAllActiveByDriverId.mockResolvedValue([makeTrip({ status: 'ACCEPTED' })]);

    await expect(service.acceptTrip('trip-1', 'user-1')).rejects.toMatchObject({
      code: 'DRIVER_HAS_ACTIVE_TRIP',
    });
  });

  it('throws DRIVER_NOT_NEAR_COMPLETION when IN_PROGRESS trip has more than 10 min remaining', async () => {
    const { service, driversRepo, tripsRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'approved' } as never);
    const startedAt = new Date(Date.now() - 60_000); // started 1 min ago, 30 min estimated → ~29 min left
    tripsRepo.findAllActiveByDriverId.mockResolvedValue([
      makeTrip({ status: 'IN_PROGRESS', started_at: startedAt, estimated_duration_min: 30 }),
    ]);

    await expect(service.acceptTrip('trip-1', 'user-1')).rejects.toMatchObject({
      code: 'DRIVER_NOT_NEAR_COMPLETION',
    });
  });

  it('throws TRIP_NOT_IN_SEARCHING when locked trip is not in SEARCHING state', async () => {
    const { service, driversRepo, tripsRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'approved' } as never);
    tripsRepo.findAllActiveByDriverId.mockResolvedValue([]);
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ status: 'ACCEPTED' }));

    await expect(service.acceptTrip('trip-1', 'user-1')).rejects.toMatchObject({
      code: 'TRIP_NOT_IN_SEARCHING',
    });
  });
});

// ===========================================================================
// updateStatus — transition happy paths
// ===========================================================================

describe('TripsService.updateStatus() — transitions', () => {
  it('sets started_at when transitioning to IN_PROGRESS', async () => {
    const { service, driversRepo, tripsRepo, stateMachine } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'approved' } as never);
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ status: 'ACCEPTED', driver_id: 'driver-1' }));
    tripsRepo.update.mockResolvedValue(makeTrip({ status: 'IN_PROGRESS', started_at: new Date(), passenger_id: 'pax-1', driver_id: 'driver-1' }));
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'IN_PROGRESS' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    await service.updateStatus('trip-1', 'user-1', 'IN_PROGRESS');

    expect(tripsRepo.update).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ status: 'IN_PROGRESS', started_at: expect.any(Date) }),
      expect.anything(),
    );
  });

  it('calculates final_fare and enqueues payment job when COMPLETED', async () => {
    const { service, driversRepo, tripsRepo, pricingEngine, stateMachine } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1', status: 'approved' } as never);
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ status: 'IN_PROGRESS', driver_id: 'driver-1' }));
    tripsRepo.update.mockResolvedValue(
      makeTrip({ status: 'COMPLETED', final_fare: 200, completed_at: new Date(), passenger_id: 'pax-1', driver_id: 'driver-1' }),
    );
    pricingEngine.calculateDistanceKm.mockReturnValue(12);
    pricingEngine.recalculate.mockReturnValue({ final_fare: 200, estimated_distance_km: 12 } as never);
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'COMPLETED' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    const result = await service.updateStatus('trip-1', 'user-1', 'COMPLETED');

    const { paymentQueue } = await import('../../modules/payments/payment.queue.js');
    expect(paymentQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ tripId: 'trip-1', passengerId: 'pax-1' }));
    expect(result.final_fare).toBe(200);
  });

  it('returns result without final_fare for non-COMPLETED transitions', async () => {
    const { service, driversRepo, tripsRepo, stateMachine } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1' } as never);
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ status: 'ACCEPTED' }));
    tripsRepo.update.mockResolvedValue(makeTrip({ status: 'DRIVER_EN_ROUTE', passenger_id: 'pax-1' }));
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'DRIVER_EN_ROUTE' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    const result = await service.updateStatus('trip-1', 'user-1', 'DRIVER_EN_ROUTE');

    expect(result.status).toBe('DRIVER_EN_ROUTE');
    expect(result.final_fare).toBeUndefined();
  });
});

// ===========================================================================
// cancelTrip — TRIP_CANNOT_BE_CANCELLED mapping + happy path
// ===========================================================================

describe('TripsService.cancelTrip() — TRIP_CANNOT_BE_CANCELLED mapping', () => {
  it('maps INVALID_TRIP_TRANSITION to TRIP_CANNOT_BE_CANCELLED when trip is already COMPLETED', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ passenger_id: 'pax-1', status: 'COMPLETED' }));
    stateMachine.transition.mockRejectedValue(new BusinessError('INVALID_TRIP_TRANSITION', 'Cannot cancel'));

    await expect(service.cancelTrip('trip-1', 'pax-1', 'passenger')).rejects.toMatchObject({
      code: 'TRIP_CANNOT_BE_CANCELLED',
    });
  });

  it('maps INVALID_TRIP_TRANSITION to TRIP_CANNOT_BE_CANCELLED when trip is already CANCELLED', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ passenger_id: 'pax-1', status: 'CANCELLED' }));
    stateMachine.transition.mockRejectedValue(new BusinessError('INVALID_TRIP_TRANSITION', 'Cannot cancel'));

    await expect(service.cancelTrip('trip-1', 'pax-1', 'passenger')).rejects.toMatchObject({
      code: 'TRIP_CANNOT_BE_CANCELLED',
    });
  });

  it('happy path: passenger cancels own SEARCHING trip', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ passenger_id: 'pax-1', status: 'SEARCHING' }));
    const cancelled = makeTrip({ passenger_id: 'pax-1', status: 'CANCELLED', cancelled_at: new Date() });
    tripsRepo.update.mockResolvedValue(cancelled);
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'CANCELLED' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    const result = await service.cancelTrip('trip-1', 'pax-1', 'passenger');

    expect(result.trip.status).toBe('CANCELLED');
    expect(result.cancellationFee).toBe(0);
  });
});

// ===========================================================================
// changeDestination — additional branches
// ===========================================================================

describe('TripsService.changeDestination() — additional branches', () => {
  const newDest = { lat: 19.35, lng: -99.16, address: 'Coyoacán' };

  it('throws TRIP_NOT_IN_PROGRESS when trip is not in IN_PROGRESS state', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'pax-1', status: 'ACCEPTED' }));

    await expect(service.changeDestination('trip-1', 'pax-1', newDest)).rejects.toMatchObject({
      code: 'TRIP_NOT_IN_PROGRESS',
    });
  });

  it('returns recalculated fare and deltaKm after destination change', async () => {
    const { service, tripsRepo, pricingEngine } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'pax-1', status: 'IN_PROGRESS' }));
    tripsRepo.update.mockResolvedValue(makeTrip({ passenger_id: 'pax-1', status: 'IN_PROGRESS' }));
    pricingEngine.calculateDistanceKm.mockReturnValue(10);
    pricingEngine.recalculate.mockReturnValue({ final_fare: 200, estimated_distance_km: 12 } as never);

    const result = await service.changeDestination('trip-1', 'pax-1', newDest);

    expect(result.tripId).toBe('trip-1');
    expect(result.newEstimatedFare).toBe(200);
    expect(result.deltaKm).toBe(2); // 12 - 10
    expect(result.currency).toBe('MXN');
    expect(result.newDestination).toEqual(newDest);
  });
});

// ===========================================================================
// getTripById — access control
// ===========================================================================

describe('TripsService.getTripById()', () => {
  it('throws TRIP_NOT_FOUND when trip does not exist', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(null);

    await expect(service.getTripById('trip-1', 'user-1', 'passenger')).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when requester is not admin, passenger, or assigned driver', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'other-pax', driver_id: 'other-driver' }));

    await expect(service.getTripById('trip-1', 'unrelated-user', 'passenger')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('allows admin to view any trip', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'other-pax' }));

    const result = await service.getTripById('trip-1', 'admin-1', 'admin');

    expect(result.id).toBe('trip-1');
    expect(result.status_history).toEqual([]);
  });

  it('allows passenger to view their own trip', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'pax-1' }));

    const result = await service.getTripById('trip-1', 'pax-1', 'passenger');

    expect(result.id).toBe('trip-1');
  });

  it('allows driver to view their assigned trip', async () => {
    const { service, tripsRepo } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ passenger_id: 'other-pax', driver_id: 'driver-1' }));

    const result = await service.getTripById('trip-1', 'driver-1', 'driver');

    expect(result.id).toBe('trip-1');
  });
});

// ===========================================================================
// getActiveTrip / getActiveTripForDriver — delegation
// ===========================================================================

describe('TripsService.getActiveTrip() / getActiveTripForDriver()', () => {
  it('delegates getActiveTrip to tripsRepo.findActiveByPassengerId', async () => {
    const trip = makeTrip({ status: 'SEARCHING' });
    const { service, tripsRepo } = makeService();
    tripsRepo.findActiveByPassengerId.mockResolvedValue(trip);

    const result = await service.getActiveTrip('pax-1');

    expect(result).toEqual(trip);
    expect(tripsRepo.findActiveByPassengerId).toHaveBeenCalledWith('pax-1');
  });

  it('returns null from getActiveTripForDriver when driver profile not found', async () => {
    const { service, driversRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue(undefined);

    const result = await service.getActiveTripForDriver('user-1');

    expect(result).toBeNull();
  });

  it('delegates getActiveTripForDriver to tripsRepo.findActiveByDriverId', async () => {
    const trip = makeTrip({ status: 'IN_PROGRESS', driver_id: 'driver-1' });
    const { service, driversRepo, tripsRepo } = makeService();
    driversRepo.findByUserId.mockResolvedValue({ id: 'driver-1' } as never);
    tripsRepo.findActiveByDriverId.mockResolvedValue(trip);

    const result = await service.getActiveTripForDriver('user-1');

    expect(result).toEqual(trip);
    expect(tripsRepo.findActiveByDriverId).toHaveBeenCalledWith('driver-1');
  });
});

// ===========================================================================
// getTripHistory — pagination delegation
// ===========================================================================

describe('TripsService.getTripHistory()', () => {
  it('returns paginated trip history from repository', async () => {
    const trips = [makeTrip({ status: 'COMPLETED' })];
    const { service, tripsRepo } = makeService({
      tripsRepo: {
        findByPassengerId: jest.fn().mockResolvedValue({ data: trips, total: 1 }),
      },
    });

    const result = await service.getTripHistory('pax-1', 1, 10);

    expect(result.data).toEqual(trips);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(tripsRepo.findByPassengerId).toHaveBeenCalledWith('pax-1', 1, 10);
  });
});

// ===========================================================================
// handlePromoteApproved — BullMQ worker handler
// ===========================================================================

describe('TripsService.handlePromoteApproved()', () => {
  it('does nothing when trip is not found', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    tripsRepo.findById.mockResolvedValue(null);

    await service.handlePromoteApproved('trip-1');

    expect(stateMachine.transition).not.toHaveBeenCalled();
  });

  it('does nothing when trip is not in APPROVED state', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ status: 'SEARCHING' }));

    await service.handlePromoteApproved('trip-1');

    expect(stateMachine.transition).not.toHaveBeenCalled();
  });

  it('does nothing inside transaction when status changed between outer and inner check', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    tripsRepo.findById.mockResolvedValue(makeTrip({ status: 'APPROVED' }));
    tripsRepo.findByIdForUpdate.mockResolvedValue(makeTrip({ status: 'SEARCHING' })); // race condition

    await service.handlePromoteApproved('trip-1');

    expect(stateMachine.transition).not.toHaveBeenCalled();
  });

  it('promotes APPROVED trip to SEARCHING and enqueues searching timeout', async () => {
    const { service, tripsRepo, stateMachine } = makeService();
    const approvedTrip = makeTrip({ status: 'APPROVED' });
    tripsRepo.findById.mockResolvedValue(approvedTrip);
    tripsRepo.findByIdForUpdate.mockResolvedValue(approvedTrip);
    tripsRepo.update.mockResolvedValue(makeTrip({ status: 'SEARCHING' }));
    stateMachine.transition.mockResolvedValue({
      success: true as const,
      newStatus: 'SEARCHING' as const,
      cancellationFee: 0,
      historyEntry: {} as never,
    });

    await service.handlePromoteApproved('trip-1');

    expect(stateMachine.transition).toHaveBeenCalledWith(expect.objectContaining({
      toStatus: 'SEARCHING',
      actor: 'system',
    }));
    expect(tripsRepo.update).toHaveBeenCalledWith('trip-1', { status: 'SEARCHING' }, expect.anything());

    const { tripsQueue } = await import('../../modules/trips/trips.queue.js');
    expect(tripsQueue.enqueueSearchingTimeout).toHaveBeenCalledWith('trip-1', expect.any(Number));
  });
});
