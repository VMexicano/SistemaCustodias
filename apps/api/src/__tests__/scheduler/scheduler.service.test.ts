/**
 * scheduler.service.test.ts — unit tests for SchedulerService
 *
 * All external dependencies are mocked — no real database, BullMQ, or cron.
 * Target: ≥90% lines, ≥85% branches.
 */

import { SchedulerService } from '../../modules/scheduler/scheduler.service.js';
import { TripStateMachine } from '../../modules/trips/trip-state-machine.js';
import type { SchedulerRepository, PendingReminder, SearchingTrip } from '../../modules/scheduler/scheduler.repository.js';
import type { NotificationQueue } from '../../modules/notifications/notification.queue.js';
import type { TripsRepository } from '../../modules/trips/trips.repository.js';
import type { Trip } from '../../modules/trips/trips.types.js';
import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Mock trips.queue module — avoid BullMQ initialization
// ---------------------------------------------------------------------------

jest.mock('../../modules/trips/trips.queue.js', () => ({
  tripsQueue: {
    enqueueSearchingTimeout: jest.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    region_id: 'region-mx',
    passenger_id: 'pax-1',
    driver_id: null,
    trip_type_id: 'tt-1',
    status: 'SCHEDULED',
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

function makePendingReminder(overrides: Partial<PendingReminder> = {}): PendingReminder {
  return {
    scheduledTripId: 'st-1',
    tripId: 'trip-1',
    passengerId: 'pax-1',
    scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h from now
    notif24hSent: false,
    notif1hSent: false,
    notif15mSent: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

function makeMockTrx() {
  const insertMock = jest.fn().mockResolvedValue([]);
  const returningMock = jest.fn().mockImplementation(() => insertMock());
  const updateMock = jest.fn().mockResolvedValue(1);
  const whereMock = jest.fn().mockReturnThis();

  const tableChain = {
    insert: jest.fn().mockReturnValue({ returning: returningMock }),
    where: whereMock,
    update: updateMock,
  };

  const trx = jest.fn().mockReturnValue(tableChain) as unknown as Knex.Transaction;
  (trx as unknown as { raw: jest.Mock }).raw = jest.fn().mockResolvedValue({ rows: [] });

  return { trx, tableChain };
}

function makeMockDb(transactionImpl?: (cb: (trx: Knex.Transaction) => Promise<unknown>) => Promise<unknown>) {
  const { trx, tableChain } = makeMockTrx();

  const db = {
    transaction: jest.fn().mockImplementation(async (cb: (trx: Knex.Transaction) => Promise<unknown>) => {
      if (transactionImpl) return transactionImpl(cb);
      return cb(trx);
    }),
  } as unknown as Knex;

  return { db, trx, tableChain };
}

function makeSearchingTrip(overrides: Partial<SearchingTrip> = {}): SearchingTrip {
  return {
    scheduledTripId: 'st-1',
    tripId: 'trip-1',
    passengerId: 'pax-1',
    scheduledFor: new Date(Date.now() + 10 * 60 * 1000), // T-10 from now
    ...overrides,
  };
}

function makeMockSchedulerRepo(): jest.Mocked<SchedulerRepository> {
  return {
    getDueTrips: jest.fn().mockResolvedValue([]),
    getPendingReminders: jest.fn().mockResolvedValue([]),
    markNotifSent: jest.fn().mockResolvedValue(undefined),
    markActivated: jest.fn().mockResolvedValue(undefined),
    markSearchStarted: jest.fn().mockResolvedValue(undefined),
    getTripsNeedingSearchingNotification: jest.fn().mockResolvedValue([]),
    markPassengerNotifiedSearching: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SchedulerRepository>;
}

function makeMockNotificationQueue(): jest.Mocked<NotificationQueue> {
  return {
    enqueue: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationQueue>;
}

function makeMockTripsRepo(trip?: Trip): jest.Mocked<TripsRepository> {
  return {
    findByIdForUpdate: jest.fn().mockResolvedValue(trip ?? makeTrip()),
    update: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<TripsRepository>;
}

function makeMockStateMachine(): jest.Mocked<TripStateMachine> {
  return {
    transition: jest.fn().mockResolvedValue({
      success: true,
      newStatus: 'REQUESTED',
      cancellationFee: 0,
      historyEntry: {},
    }),
    canTransition: jest.fn().mockReturnValue(true),
    getCancellationFee: jest.fn().mockReturnValue(0),
  } as unknown as jest.Mocked<TripStateMachine>;
}

// ---------------------------------------------------------------------------
// SchedulerService — activateDueTrips()
// ---------------------------------------------------------------------------

describe('SchedulerService', () => {
  describe('activateDueTrips() via tick()', () => {
    it('does nothing when no due trips are found', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      schedulerRepo.getDueTrips.mockResolvedValue([]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      // Access private tick() via casting
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(tripsRepo.findByIdForUpdate).not.toHaveBeenCalled();
      expect(machine.transition).not.toHaveBeenCalled();
    });

    it('activates a SCHEDULED trip → REQUESTED when scheduled_for has passed', async () => {
      const trip = makeTrip({ status: 'SCHEDULED' });
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo(trip);
      const machine = makeMockStateMachine();

      schedulerRepo.getDueTrips.mockResolvedValue([
        { scheduledTripId: 'st-1', tripId: 'trip-1', passengerId: 'pax-1' },
      ]);

      const { db } = makeMockDb();
      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(schedulerRepo.markSearchStarted).toHaveBeenCalledWith(expect.anything(), 'st-1');
      expect(machine.transition).toHaveBeenCalledWith(
        expect.objectContaining({ toStatus: 'REQUESTED', actor: 'system' }),
      );
      expect(tripsRepo.update).toHaveBeenCalledWith('trip-1', { status: 'REQUESTED' }, expect.anything());
      expect(schedulerRepo.markActivated).toHaveBeenCalled();
    });

    it('skips a trip that is no longer in SCHEDULED status (concurrent activation)', async () => {
      const trip = makeTrip({ status: 'REQUESTED' }); // already transitioned
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo(trip);
      const machine = makeMockStateMachine();

      schedulerRepo.getDueTrips.mockResolvedValue([
        { scheduledTripId: 'st-1', tripId: 'trip-1', passengerId: 'pax-1' },
      ]);

      const { db } = makeMockDb();
      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(machine.transition).not.toHaveBeenCalled();
      expect(schedulerRepo.markActivated).not.toHaveBeenCalled();
    });

    it('skips a trip when findByIdForUpdate returns null (race condition)', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();

      tripsRepo.findByIdForUpdate.mockResolvedValue(null);
      schedulerRepo.getDueTrips.mockResolvedValue([
        { scheduledTripId: 'st-1', tripId: 'trip-1', passengerId: 'pax-1' },
      ]);

      const { db } = makeMockDb();
      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(machine.transition).not.toHaveBeenCalled();
    });

    it('catches errors during tick without crashing the process', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();

      const { db } = makeMockDb();
      (db.transaction as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      // Should not throw
      await expect((svc as unknown as { tick(): Promise<void> }).tick()).resolves.toBeUndefined();

      consoleSpy.mockRestore();
    });
  });

  // --------------------------------------------------------------------------
  // Task 2: Notify passenger that search is active at T-15
  // --------------------------------------------------------------------------

  describe('notifyPassengerSearching() via tick()', () => {
    it('does nothing when no trips need searching notification', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      schedulerRepo.getTripsNeedingSearchingNotification.mockResolvedValue([]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(schedulerRepo.markPassengerNotifiedSearching).not.toHaveBeenCalled();
      expect(notifQueue.enqueue).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'scheduled_trip_searching' }),
      );
    });

    it('stamps passenger_notified_searching_at and enqueues push when trip is SEARCHING at T-15', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      const searchingTrip = makeSearchingTrip();
      schedulerRepo.getTripsNeedingSearchingNotification.mockResolvedValue([searchingTrip]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(schedulerRepo.markPassengerNotifiedSearching).toHaveBeenCalledWith('st-1');
      expect(notifQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: 'pax-1',
          type: 'scheduled_trip_searching',
          tripId: 'trip-1',
        }),
      );
    });

    it('sends notification to all trips needing it in a single tick', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      schedulerRepo.getTripsNeedingSearchingNotification.mockResolvedValue([
        makeSearchingTrip({ scheduledTripId: 'st-1', tripId: 'trip-1', passengerId: 'pax-1' }),
        makeSearchingTrip({ scheduledTripId: 'st-2', tripId: 'trip-2', passengerId: 'pax-2' }),
      ]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(schedulerRepo.markPassengerNotifiedSearching).toHaveBeenCalledTimes(2);
      expect(notifQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ recipientUserId: 'pax-1', type: 'scheduled_trip_searching' }),
      );
      expect(notifQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ recipientUserId: 'pax-2', type: 'scheduled_trip_searching' }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // sendReminders()
  // --------------------------------------------------------------------------

  describe('sendReminders() via tick()', () => {
    it('does nothing when there are no pending reminders', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      schedulerRepo.getPendingReminders.mockResolvedValue([]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(notifQueue.enqueue).not.toHaveBeenCalled();
    });

    it('sends 24h notification when in the 23.5h-24.5h window and notif24hSent=false', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000); // exactly 24h from now
      schedulerRepo.getPendingReminders.mockResolvedValue([
        makePendingReminder({ scheduledFor, notif24hSent: false }),
      ]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(schedulerRepo.markNotifSent).toHaveBeenCalledWith(expect.anything(), 'st-1', 'notif_24h_sent');
      expect(notifQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trip_reminder_24h', tripId: 'trip-1' }),
      );
    });

    it('does NOT send 24h notification when notif24hSent=true', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      const scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000);
      schedulerRepo.getPendingReminders.mockResolvedValue([
        makePendingReminder({ scheduledFor, notif24hSent: true }),
      ]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(notifQueue.enqueue).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trip_reminder_24h' }),
      );
    });

    it('sends 1h notification when in the 50min-70min window and notif1hSent=false', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      const scheduledFor = new Date(Date.now() + 60 * 60 * 1000); // exactly 1h from now
      schedulerRepo.getPendingReminders.mockResolvedValue([
        makePendingReminder({ scheduledFor, notif24hSent: true, notif1hSent: false }),
      ]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(notifQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trip_reminder_1h', tripId: 'trip-1' }),
      );
    });

    it('sends 15m notification when in the 10min-20min window and notif15mSent=false', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      const scheduledFor = new Date(Date.now() + 15 * 60 * 1000); // 15min from now
      schedulerRepo.getPendingReminders.mockResolvedValue([
        makePendingReminder({ scheduledFor, notif24hSent: true, notif1hSent: true, notif15mSent: false }),
      ]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(notifQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'trip_reminder_15m', tripId: 'trip-1' }),
      );
    });

    it('does NOT send 15m notification when outside the window', async () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      const scheduledFor = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h from now — outside all windows
      schedulerRepo.getPendingReminders.mockResolvedValue([
        makePendingReminder({ scheduledFor, notif24hSent: true, notif1hSent: false, notif15mSent: false }),
      ]);

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      await (svc as unknown as { tick(): Promise<void> }).tick();

      expect(notifQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // TripStateMachine — SCHEDULED transitions
  // --------------------------------------------------------------------------

  describe('TripStateMachine — SCHEDULED transitions', () => {
    let machine: TripStateMachine;

    beforeEach(() => {
      machine = new TripStateMachine();
    });

    it('SCHEDULED → REQUESTED is a valid transition for actor "system"', () => {
      expect(machine.canTransition('SCHEDULED', 'REQUESTED', 'system')).toBe(true);
    });

    it('SCHEDULED → CANCELLED is a valid transition for actor "passenger"', () => {
      expect(machine.canTransition('SCHEDULED', 'CANCELLED', 'passenger')).toBe(true);
    });

    it('SCHEDULED → ACCEPTED is NOT a valid transition', () => {
      expect(machine.canTransition('SCHEDULED', 'ACCEPTED', 'driver')).toBe(false);
      expect(machine.canTransition('SCHEDULED', 'ACCEPTED', 'system')).toBe(false);
      expect(machine.canTransition('SCHEDULED', 'ACCEPTED', 'passenger')).toBe(false);
    });

    it('passenger cannot perform SCHEDULED → REQUESTED (only system can)', () => {
      expect(machine.canTransition('SCHEDULED', 'REQUESTED', 'passenger')).toBe(false);
    });

    it('system cannot perform SCHEDULED → CANCELLED (only passenger can)', () => {
      expect(machine.canTransition('SCHEDULED', 'CANCELLED', 'system')).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // start() — smoke test
  // --------------------------------------------------------------------------

  describe('start()', () => {
    it('starts without throwing and can be stopped cleanly', () => {
      const schedulerRepo = makeMockSchedulerRepo();
      const notifQueue = makeMockNotificationQueue();
      const tripsRepo = makeMockTripsRepo();
      const machine = makeMockStateMachine();
      const { db } = makeMockDb();

      const svc = new SchedulerService(db, schedulerRepo, notifQueue, machine, tripsRepo);
      expect(() => svc.start()).not.toThrow();
      svc.stop();
    });
  });
});
