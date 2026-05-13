import type { Knex } from 'knex';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { Trip, TripActor, TripStatus, TransitionResult } from './trips.types.js';

// ---------------------------------------------------------------------------
// Transition map: "<fromStatus>→<toStatus>" → allowed actors
// ---------------------------------------------------------------------------
const VALID_TRANSITIONS: Map<string, TripActor[]> = new Map([
  ['SCHEDULED→REQUESTED', ['system']],
  ['SCHEDULED→CANCELLED', ['passenger']],
  ['REQUESTED→SEARCHING', ['system']],
  ['REQUESTED→PENDING_APPROVAL', ['system']],
  ['PENDING_APPROVAL→APPROVED', ['dispatcher']],
  ['PENDING_APPROVAL→CANCELLED', ['dispatcher', 'passenger']],
  ['APPROVED→SEARCHING', ['system']],
  ['APPROVED→CANCELLED', ['dispatcher', 'passenger']],
  ['SEARCHING→CANCELLED', ['system', 'passenger']],
  ['SEARCHING→ACCEPTED', ['driver']],
  ['ACCEPTED→DRIVER_EN_ROUTE', ['driver']],
  ['ACCEPTED→CANCELLED', ['driver', 'passenger']],
  ['DRIVER_EN_ROUTE→DRIVER_ARRIVED', ['driver']],
  ['DRIVER_EN_ROUTE→CANCELLED', ['driver', 'passenger']],
  ['DRIVER_ARRIVED→IN_PROGRESS', ['driver']],
  ['DRIVER_ARRIVED→CANCELLED', ['driver']],
  ['IN_PROGRESS→COMPLETED', ['driver']],
]);

const CANCELLATION_FEE_MXN = 50;
const CANCELLATION_FREE_WINDOW_SECONDS = 120;

export class TripStateMachine {
  /**
   * Returns true if the transition from `from` to `to` is in the valid
   * transitions map AND the given actor is allowed to perform it.
   *
   * Returns false for completely unknown transitions (not in the map) or when
   * the actor is not listed for an otherwise valid route.
   */
  canTransition(from: TripStatus, to: TripStatus, actor: TripActor): boolean {
    const key = `${from}→${to}`;
    const allowedActors = VALID_TRANSITIONS.get(key);
    if (allowedActors === undefined) {
      return false;
    }
    return allowedActors.includes(actor);
  }

  /**
   * Calculates the cancellation fee that applies when a trip is cancelled.
   *
   * Policy (ADR-026 / MVP):
   *  - driver:    always $0
   *  - system:    always $0
   *  - passenger: $0 if < 120 s have elapsed since accepted_at
   *               $50 MXN otherwise (covers ACCEPTED and DRIVER_EN_ROUTE states)
   */
  getCancellationFee(trip: Trip, actor: TripActor): number {
    if (actor !== 'passenger') {
      return 0;
    }

    if (trip.accepted_at === null) {
      // No accepted_at recorded — charge applies only after driver accepted.
      return 0;
    }

    const elapsedSeconds = (Date.now() - trip.accepted_at.getTime()) / 1000;
    return elapsedSeconds >= CANCELLATION_FREE_WINDOW_SECONDS ? CANCELLATION_FEE_MXN : 0;
  }

  /**
   * Validates the requested transition, writes a row to trip_status_history,
   * and returns a TransitionResult.
   *
   * Contract:
   *  - The caller is responsible for calling SELECT FOR UPDATE on the trip row
   *    before invoking this method (ADR-025).
   *  - This method does NOT update the `trips` table — that is done by
   *    trips.service.ts (TRIP-003).
   *
   * @throws BusinessError('INVALID_TRIP_TRANSITION')       — route not in map
   * @throws BusinessError('NOT_AUTHORIZED_FOR_TRANSITION') — actor not allowed
   */
  async transition(params: {
    trip: Trip;
    toStatus: TripStatus;
    actor: TripActor;
    actorId: string | null;
    trx: Knex.Transaction;
    notes?: string;
  }): Promise<TransitionResult> {
    const { trip, toStatus, actor, actorId, trx, notes } = params;
    const fromStatus = trip.status;
    const key = `${fromStatus}→${toStatus}`;

    // 1. Validate that the route exists.
    const allowedActors = VALID_TRANSITIONS.get(key);
    if (allowedActors === undefined) {
      throw new BusinessError(
        'INVALID_TRIP_TRANSITION',
        `Transition ${key} is not allowed`,
      );
    }

    // 2. Validate that this actor is permitted to perform the transition.
    if (!allowedActors.includes(actor)) {
      throw new BusinessError(
        'NOT_AUTHORIZED_FOR_TRANSITION',
        `Actor '${actor}' is not authorized for transition ${key}`,
      );
    }

    // 3. Calculate cancellation fee (0 when toStatus is not CANCELLED).
    const cancellationFee =
      toStatus === 'CANCELLED' ? this.getCancellationFee(trip, actor) : 0;

    // 4. Build the history entry payload (without id / created_at — DB generates them).
    const historyPayload: Omit<
      import('./trips.types.js').TripStatusHistory,
      'id' | 'created_at'
    > = {
      trip_id: trip.id,
      from_status: fromStatus,
      to_status: toStatus,
      changed_by: actorId,
      actor_type: actor,
      notes: notes ?? null,
    };

    // 5. Persist to trip_status_history inside the caller's transaction.
    await trx('trip_status_history').insert(historyPayload).returning('*');

    // 6. Return the result — the service will use this to update the trip row.
    return {
      success: true,
      newStatus: toStatus,
      cancellationFee,
      historyEntry: historyPayload,
    };
  }
}
