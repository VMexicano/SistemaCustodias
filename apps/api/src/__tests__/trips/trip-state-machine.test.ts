/**
 * TripStateMachine — unit tests (100% coverage required)
 *
 * No real database is needed. The Knex transaction is mocked so that
 * trip_status_history inserts are captured by jest spies.
 */

import type { Knex } from 'knex';
import { TripStateMachine } from '../../modules/trips/trip-state-machine.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { Trip } from '../../modules/trips/trips.types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock Knex transaction that records insert calls.
 * The chain is: trx('table').insert(data).returning('*')
 */
function makeMockTrx() {
  const insertMock = jest.fn().mockResolvedValue([{ id: 'hist-1', created_at: new Date() }]);
  const returningMock = jest.fn().mockImplementation(() => insertMock());
  const insertChain = { insert: jest.fn().mockReturnValue({ returning: returningMock }) };
  const trx = jest.fn().mockReturnValue(insertChain) as unknown as Knex.Transaction;
  return { trx, insertChain, returningMock };
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip-1',
    region_id: 'region-mx',
    passenger_id: 'pax-1',
    driver_id: null,
    trip_type_id: 'tt-1',
    status: 'REQUESTED',
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

/** Returns an accepted_at Date that is `seconds` ago from now. */
function acceptedSecondsAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TripStateMachine', () => {
  let machine: TripStateMachine;

  beforeEach(() => {
    machine = new TripStateMachine();
  });

  // -------------------------------------------------------------------------
  // canTransition() — valid transitions
  // -------------------------------------------------------------------------
  describe('canTransition() — valid transitions', () => {
    it('sistema: REQUESTED → SEARCHING', () => {
      expect(machine.canTransition('REQUESTED', 'SEARCHING', 'system')).toBe(true);
    });

    it('sistema: SEARCHING → CANCELLED (timeout)', () => {
      expect(machine.canTransition('SEARCHING', 'CANCELLED', 'system')).toBe(true);
    });

    it('driver: SEARCHING → ACCEPTED', () => {
      expect(machine.canTransition('SEARCHING', 'ACCEPTED', 'driver')).toBe(true);
    });

    it('driver: ACCEPTED → DRIVER_EN_ROUTE', () => {
      expect(machine.canTransition('ACCEPTED', 'DRIVER_EN_ROUTE', 'driver')).toBe(true);
    });

    it('driver: ACCEPTED → CANCELLED', () => {
      expect(machine.canTransition('ACCEPTED', 'CANCELLED', 'driver')).toBe(true);
    });

    it('passenger: ACCEPTED → CANCELLED', () => {
      expect(machine.canTransition('ACCEPTED', 'CANCELLED', 'passenger')).toBe(true);
    });

    it('driver: DRIVER_EN_ROUTE → DRIVER_ARRIVED', () => {
      expect(machine.canTransition('DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'driver')).toBe(true);
    });

    it('driver: DRIVER_EN_ROUTE → CANCELLED', () => {
      expect(machine.canTransition('DRIVER_EN_ROUTE', 'CANCELLED', 'driver')).toBe(true);
    });

    it('passenger: DRIVER_EN_ROUTE → CANCELLED', () => {
      expect(machine.canTransition('DRIVER_EN_ROUTE', 'CANCELLED', 'passenger')).toBe(true);
    });

    it('driver: DRIVER_ARRIVED → IN_PROGRESS', () => {
      expect(machine.canTransition('DRIVER_ARRIVED', 'IN_PROGRESS', 'driver')).toBe(true);
    });

    it('driver: DRIVER_ARRIVED → CANCELLED (no_show)', () => {
      expect(machine.canTransition('DRIVER_ARRIVED', 'CANCELLED', 'driver')).toBe(true);
    });

    it('driver: IN_PROGRESS → COMPLETED', () => {
      expect(machine.canTransition('IN_PROGRESS', 'COMPLETED', 'driver')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // canTransition() — invalid transitions
  // -------------------------------------------------------------------------
  describe('canTransition() — invalid transitions', () => {
    it('returns false: REQUESTED → COMPLETED', () => {
      expect(machine.canTransition('REQUESTED', 'COMPLETED', 'driver')).toBe(false);
    });

    it('returns false: COMPLETED → CANCELLED (final state)', () => {
      expect(machine.canTransition('COMPLETED', 'CANCELLED', 'driver')).toBe(false);
    });

    it('returns false: COMPLETED → REQUESTED (final state)', () => {
      expect(machine.canTransition('COMPLETED', 'REQUESTED', 'system')).toBe(false);
    });

    it('returns false: CANCELLED → SEARCHING (final state)', () => {
      expect(machine.canTransition('CANCELLED', 'SEARCHING', 'system')).toBe(false);
    });

    it('returns false: CANCELLED → ACCEPTED (final state)', () => {
      expect(machine.canTransition('CANCELLED', 'ACCEPTED', 'driver')).toBe(false);
    });

    it('returns false: IN_PROGRESS → ACCEPTED (backwards)', () => {
      expect(machine.canTransition('IN_PROGRESS', 'ACCEPTED', 'driver')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // canTransition() — actor not authorized
  // -------------------------------------------------------------------------
  describe('canTransition() — actor not authorized', () => {
    it('returns false: passenger tries DRIVER_EN_ROUTE → DRIVER_ARRIVED', () => {
      expect(machine.canTransition('DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'passenger')).toBe(false);
    });

    it('returns false: system tries SEARCHING → ACCEPTED', () => {
      expect(machine.canTransition('SEARCHING', 'ACCEPTED', 'system')).toBe(false);
    });

    it('returns false: passenger tries ACCEPTED → DRIVER_EN_ROUTE', () => {
      expect(machine.canTransition('ACCEPTED', 'DRIVER_EN_ROUTE', 'passenger')).toBe(false);
    });

    it('returns false: driver tries REQUESTED → SEARCHING', () => {
      expect(machine.canTransition('REQUESTED', 'SEARCHING', 'driver')).toBe(false);
    });

    it('returns false: system tries ACCEPTED → CANCELLED (system not listed)', () => {
      expect(machine.canTransition('ACCEPTED', 'CANCELLED', 'system')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getCancellationFee()
  // -------------------------------------------------------------------------
  describe('getCancellationFee()', () => {
    it('passenger cancels < 120s after ACCEPTED: fee = 0', () => {
      const trip = makeTrip({ accepted_at: acceptedSecondsAgo(90) });
      expect(machine.getCancellationFee(trip, 'passenger')).toBe(0);
    });

    it('passenger cancels exactly at 120s after ACCEPTED: fee = 50 MXN', () => {
      // Use 121 s to avoid flakiness at exact boundary
      const trip = makeTrip({ accepted_at: acceptedSecondsAgo(121) });
      expect(machine.getCancellationFee(trip, 'passenger')).toBe(50);
    });

    it('passenger cancels >= 120s after ACCEPTED: fee = 50 MXN', () => {
      const trip = makeTrip({ accepted_at: acceptedSecondsAgo(300) });
      expect(machine.getCancellationFee(trip, 'passenger')).toBe(50);
    });

    it('passenger with no accepted_at: fee = 0', () => {
      const trip = makeTrip({ accepted_at: null });
      expect(machine.getCancellationFee(trip, 'passenger')).toBe(0);
    });

    it('driver cancels: fee = 0 always', () => {
      const trip = makeTrip({ accepted_at: acceptedSecondsAgo(300) });
      expect(machine.getCancellationFee(trip, 'driver')).toBe(0);
    });

    it('system cancels (timeout): fee = 0', () => {
      const trip = makeTrip({ accepted_at: acceptedSecondsAgo(300) });
      expect(machine.getCancellationFee(trip, 'system')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // transition() — happy paths
  // -------------------------------------------------------------------------
  describe('transition()', () => {
    it('writes to trip_status_history with correct from/to/actor/notes', async () => {
      const { trx, insertChain } = makeMockTrx();
      const trip = makeTrip({ status: 'REQUESTED' });

      const result = await machine.transition({
        trip,
        toStatus: 'SEARCHING',
        actor: 'system',
        actorId: 'sys',
        trx,
        notes: 'auto-transition',
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('SEARCHING');
      expect(result.cancellationFee).toBe(0);
      expect(result.historyEntry).toMatchObject({
        trip_id: 'trip-1',
        from_status: 'REQUESTED',
        to_status: 'SEARCHING',
        changed_by: 'sys',
        actor_type: 'system',
        notes: 'auto-transition',
      });

      // Verify DB insert was called
      expect(trx).toHaveBeenCalledWith('trip_status_history');
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ trip_id: 'trip-1', from_status: 'REQUESTED', to_status: 'SEARCHING' }),
      );
    });

    it('returns historyEntry with null notes when none provided', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'SEARCHING' });

      const result = await machine.transition({
        trip,
        toStatus: 'ACCEPTED',
        actor: 'driver',
        actorId: 'driver-1',
        trx,
      });

      expect(result.historyEntry.notes).toBeNull();
    });

    it('returns cancellationFee = 50 when passenger cancels >= 120s after ACCEPTED', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({
        status: 'ACCEPTED',
        accepted_at: acceptedSecondsAgo(200),
      });

      const result = await machine.transition({
        trip,
        toStatus: 'CANCELLED',
        actor: 'passenger',
        actorId: 'pax-1',
        trx,
      });

      expect(result.cancellationFee).toBe(50);
    });

    it('returns cancellationFee = 0 when passenger cancels < 120s after ACCEPTED', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({
        status: 'ACCEPTED',
        accepted_at: acceptedSecondsAgo(60),
      });

      const result = await machine.transition({
        trip,
        toStatus: 'CANCELLED',
        actor: 'passenger',
        actorId: 'pax-1',
        trx,
      });

      expect(result.cancellationFee).toBe(0);
    });

    it('returns cancellationFee = 0 when driver cancels (always free)', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({
        status: 'ACCEPTED',
        accepted_at: acceptedSecondsAgo(500),
      });

      const result = await machine.transition({
        trip,
        toStatus: 'CANCELLED',
        actor: 'driver',
        actorId: 'driver-1',
        trx,
      });

      expect(result.cancellationFee).toBe(0);
    });

    it('returns cancellationFee = 0 for non-CANCELLED toStatus', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'ACCEPTED' });

      const result = await machine.transition({
        trip,
        toStatus: 'DRIVER_EN_ROUTE',
        actor: 'driver',
        actorId: 'driver-1',
        trx,
      });

      expect(result.cancellationFee).toBe(0);
    });

    it('progresses full lifecycle: REQUESTED → SEARCHING → ACCEPTED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED', async () => {
      const steps: Array<{
        from: import('../../modules/trips/trips.types.js').TripStatus;
        to: import('../../modules/trips/trips.types.js').TripStatus;
        actor: import('../../modules/trips/trips.types.js').TripActor;
        actorId: string;
      }> = [
        { from: 'REQUESTED', to: 'SEARCHING', actor: 'system', actorId: 'sys' },
        { from: 'SEARCHING', to: 'ACCEPTED', actor: 'driver', actorId: 'driver-1' },
        { from: 'ACCEPTED', to: 'DRIVER_EN_ROUTE', actor: 'driver', actorId: 'driver-1' },
        { from: 'DRIVER_EN_ROUTE', to: 'DRIVER_ARRIVED', actor: 'driver', actorId: 'driver-1' },
        { from: 'DRIVER_ARRIVED', to: 'IN_PROGRESS', actor: 'driver', actorId: 'driver-1' },
        { from: 'IN_PROGRESS', to: 'COMPLETED', actor: 'driver', actorId: 'driver-1' },
      ];

      for (const step of steps) {
        const { trx } = makeMockTrx();
        const trip = makeTrip({ status: step.from });
        const result = await machine.transition({
          trip,
          toStatus: step.to,
          actor: step.actor,
          actorId: step.actorId,
          trx,
        });
        expect(result.success).toBe(true);
        expect(result.newStatus).toBe(step.to);
      }
    });
  });

  // -------------------------------------------------------------------------
  // transition() — error paths
  // -------------------------------------------------------------------------
  describe('transition() — error paths', () => {
    it('throws INVALID_TRIP_TRANSITION for an unknown route', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'REQUESTED' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'COMPLETED',
          actor: 'driver',
          actorId: 'driver-1',
          trx,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_TRIP_TRANSITION',
      });
    });

    it('throws INVALID_TRIP_TRANSITION when transitioning from a final state (COMPLETED)', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'COMPLETED' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'CANCELLED',
          actor: 'driver',
          actorId: 'driver-1',
          trx,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_TRIP_TRANSITION',
      });
    });

    it('throws INVALID_TRIP_TRANSITION when transitioning from a final state (CANCELLED)', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'CANCELLED' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'ACCEPTED',
          actor: 'driver',
          actorId: 'driver-1',
          trx,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_TRIP_TRANSITION',
      });
    });

    it('throws INVALID_TRIP_TRANSITION for IN_PROGRESS → ACCEPTED (backwards)', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'IN_PROGRESS' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'ACCEPTED',
          actor: 'driver',
          actorId: 'driver-1',
          trx,
        }),
      ).rejects.toMatchObject({
        code: 'INVALID_TRIP_TRANSITION',
      });
    });

    it('throws NOT_AUTHORIZED_FOR_TRANSITION: passenger tries DRIVER_EN_ROUTE → DRIVER_ARRIVED', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'DRIVER_EN_ROUTE' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'DRIVER_ARRIVED',
          actor: 'passenger',
          actorId: 'pax-1',
          trx,
        }),
      ).rejects.toMatchObject({
        code: 'NOT_AUTHORIZED_FOR_TRANSITION',
      });
    });

    it('throws NOT_AUTHORIZED_FOR_TRANSITION: system tries ACCEPTED → CANCELLED', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'ACCEPTED' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'CANCELLED',
          actor: 'system',
          actorId: 'sys',
          trx,
        }),
      ).rejects.toMatchObject({
        code: 'NOT_AUTHORIZED_FOR_TRANSITION',
      });
    });

    it('throws NOT_AUTHORIZED_FOR_TRANSITION: passenger tries IN_PROGRESS → COMPLETED', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'IN_PROGRESS' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'COMPLETED',
          actor: 'passenger',
          actorId: 'pax-1',
          trx,
        }),
      ).rejects.toMatchObject({
        code: 'NOT_AUTHORIZED_FOR_TRANSITION',
      });
    });

    it('thrown error is an instance of BusinessError', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'REQUESTED' });

      const err = await machine
        .transition({ trip, toStatus: 'COMPLETED', actor: 'driver', actorId: 'driver-1', trx })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(BusinessError);
    });
  });

  // -------------------------------------------------------------------------
  // DRIVER_ARRIVED → CANCELLED (no_show) — driver only
  // -------------------------------------------------------------------------
  describe('DRIVER_ARRIVED → CANCELLED (no_show)', () => {
    it('driver can cancel in DRIVER_ARRIVED state (no_show, fee = 0)', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'DRIVER_ARRIVED', accepted_at: acceptedSecondsAgo(400) });

      const result = await machine.transition({
        trip,
        toStatus: 'CANCELLED',
        actor: 'driver',
        actorId: 'driver-1',
        trx,
        notes: 'no_show',
      });

      expect(result.success).toBe(true);
      expect(result.cancellationFee).toBe(0);
      expect(result.historyEntry.notes).toBe('no_show');
    });

    it('passenger cannot cancel in DRIVER_ARRIVED state (not authorized)', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'DRIVER_ARRIVED' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'CANCELLED',
          actor: 'passenger',
          actorId: 'pax-1',
          trx,
        }),
      ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED_FOR_TRANSITION' });
    });
  });

  // -------------------------------------------------------------------------
  // SEARCHING → CANCELLED (system timeout)
  // -------------------------------------------------------------------------
  describe('SEARCHING → CANCELLED (system timeout)', () => {
    it('system cancels SEARCHING trip with fee = 0', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'SEARCHING' });

      const result = await machine.transition({
        trip,
        toStatus: 'CANCELLED',
        actor: 'system',
        actorId: 'sys',
        trx,
        notes: 'search_timeout',
      });

      expect(result.success).toBe(true);
      expect(result.cancellationFee).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // New dispatcher approval flow — valid transitions
  // -------------------------------------------------------------------------
  describe('dispatcher approval flow — valid transitions', () => {
    it('should allow REQUESTED→PENDING_APPROVAL by system', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'REQUESTED' });

      const result = await machine.transition({
        trip,
        toStatus: 'PENDING_APPROVAL',
        actor: 'system',
        actorId: null,
        trx,
      });

      expect(result.newStatus).toBe('PENDING_APPROVAL');
      expect(result.cancellationFee).toBe(0);
    });

    it('should allow PENDING_APPROVAL→APPROVED by dispatcher', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'PENDING_APPROVAL' });

      const result = await machine.transition({
        trip,
        toStatus: 'APPROVED',
        actor: 'dispatcher',
        actorId: 'disp-1',
        trx,
      });

      expect(result.newStatus).toBe('APPROVED');
      expect(result.cancellationFee).toBe(0);
    });

    it('should allow PENDING_APPROVAL→CANCELLED by dispatcher (fee = 0)', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'PENDING_APPROVAL' });

      const result = await machine.transition({
        trip,
        toStatus: 'CANCELLED',
        actor: 'dispatcher',
        actorId: 'disp-1',
        trx,
      });

      expect(result.newStatus).toBe('CANCELLED');
      expect(result.cancellationFee).toBe(0);
    });

    it('should allow PENDING_APPROVAL→CANCELLED by passenger (fee = 0, no accepted_at)', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'PENDING_APPROVAL', accepted_at: null });

      const result = await machine.transition({
        trip,
        toStatus: 'CANCELLED',
        actor: 'passenger',
        actorId: 'pax-1',
        trx,
      });

      expect(result.newStatus).toBe('CANCELLED');
      expect(result.cancellationFee).toBe(0);
    });

    it('should allow APPROVED→SEARCHING by system', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'APPROVED' });

      const result = await machine.transition({
        trip,
        toStatus: 'SEARCHING',
        actor: 'system',
        actorId: null,
        trx,
      });

      expect(result.newStatus).toBe('SEARCHING');
      expect(result.cancellationFee).toBe(0);
    });

    it('should allow APPROVED→CANCELLED by dispatcher', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'APPROVED' });

      const result = await machine.transition({
        trip,
        toStatus: 'CANCELLED',
        actor: 'dispatcher',
        actorId: 'disp-1',
        trx,
      });

      expect(result.newStatus).toBe('CANCELLED');
      expect(result.cancellationFee).toBe(0);
    });

    it('should allow APPROVED→CANCELLED by passenger', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'APPROVED', accepted_at: null });

      const result = await machine.transition({
        trip,
        toStatus: 'CANCELLED',
        actor: 'passenger',
        actorId: 'pax-1',
        trx,
      });

      expect(result.newStatus).toBe('CANCELLED');
      expect(result.cancellationFee).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // New dispatcher approval flow — invalid transitions
  // -------------------------------------------------------------------------
  describe('dispatcher approval flow — invalid transitions', () => {
    it('throws INVALID_TRIP_TRANSITION: PENDING_APPROVAL→SEARCHING (no direct path)', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'PENDING_APPROVAL' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'SEARCHING',
          actor: 'system',
          actorId: null,
          trx,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_TRIP_TRANSITION' });
    });

    it('throws NOT_AUTHORIZED_FOR_TRANSITION: PENDING_APPROVAL→APPROVED by passenger', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'PENDING_APPROVAL' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'APPROVED',
          actor: 'passenger',
          actorId: 'pax-1',
          trx,
        }),
      ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED_FOR_TRANSITION' });
    });

    it('throws NOT_AUTHORIZED_FOR_TRANSITION: PENDING_APPROVAL→APPROVED by driver', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'PENDING_APPROVAL' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'APPROVED',
          actor: 'driver',
          actorId: 'driver-1',
          trx,
        }),
      ).rejects.toMatchObject({ code: 'NOT_AUTHORIZED_FOR_TRANSITION' });
    });

    it('throws INVALID_TRIP_TRANSITION: APPROVED→ACCEPTED directly', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'APPROVED' });

      await expect(
        machine.transition({
          trip,
          toStatus: 'ACCEPTED',
          actor: 'driver',
          actorId: 'driver-1',
          trx,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_TRIP_TRANSITION' });
    });
  });

  // -------------------------------------------------------------------------
  // Regression tests — taxi flow unchanged
  // -------------------------------------------------------------------------
  describe('regression — taxi flow unaffected', () => {
    it('REQUESTED→SEARCHING by system still works', async () => {
      const { trx } = makeMockTrx();
      const trip = makeTrip({ status: 'REQUESTED' });

      const result = await machine.transition({
        trip,
        toStatus: 'SEARCHING',
        actor: 'system',
        actorId: 'sys',
        trx,
      });

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('SEARCHING');
    });

    it('full taxi lifecycle completes without errors', async () => {
      const steps: Array<{
        from: import('../../modules/trips/trips.types.js').TripStatus;
        to: import('../../modules/trips/trips.types.js').TripStatus;
        actor: import('../../modules/trips/trips.types.js').TripActor;
        actorId: string;
      }> = [
        { from: 'SEARCHING', to: 'ACCEPTED', actor: 'driver', actorId: 'driver-1' },
        { from: 'ACCEPTED', to: 'DRIVER_EN_ROUTE', actor: 'driver', actorId: 'driver-1' },
        { from: 'DRIVER_EN_ROUTE', to: 'DRIVER_ARRIVED', actor: 'driver', actorId: 'driver-1' },
        { from: 'DRIVER_ARRIVED', to: 'IN_PROGRESS', actor: 'driver', actorId: 'driver-1' },
        { from: 'IN_PROGRESS', to: 'COMPLETED', actor: 'driver', actorId: 'driver-1' },
      ];

      for (const step of steps) {
        const { trx } = makeMockTrx();
        const trip = makeTrip({ status: step.from });
        const result = await machine.transition({
          trip,
          toStatus: step.to,
          actor: step.actor,
          actorId: step.actorId,
          trx,
        });
        expect(result.success).toBe(true);
        expect(result.newStatus).toBe(step.to);
      }
    });
  });
});
