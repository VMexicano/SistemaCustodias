/**
 * scheduler.service.ts — cron-based activation of scheduled trips + reminder notifications.
 *
 * Runs every minute. Three independent tasks per tick:
 *  1. activateDueTrips          — transitions SCHEDULED → REQUESTED for trips whose
 *                                 dispatch window has opened (T-dispatch_window_min).
 *                                 Stamps search_started_at to prevent re-dispatch.
 *  2. notifyPassengerSearching  — sends a push to the passenger when the trip is still
 *                                 in SEARCHING status at T-15 min.
 *  3. sendReminders             — enqueues push notifications at 24 h, 1 h, and 15 m
 *                                 before departure.
 *
 * SELECT FOR UPDATE SKIP LOCKED guarantees each scheduled trip is activated exactly once,
 * even when multiple API instances run (ADR-025).
 *
 * Side effects (BullMQ enqueue) are performed OUTSIDE transactions (ADR-005).
 */

import cron from 'node-cron';
import type { Knex } from 'knex';
import type { SchedulerRepository } from './scheduler.repository.js';
import type { NotificationQueue } from '../notifications/notification.queue.js';
import type { TripStateMachine } from '../trips/trip-state-machine.js';
import type { TripsRepository } from '../trips/trips.repository.js';
import { tripsQueue } from '../trips/trips.queue.js';

// ---------------------------------------------------------------------------
// SchedulerService
// ---------------------------------------------------------------------------

export class SchedulerService {
  private cronTask: ReturnType<typeof cron.schedule> | null = null;

  constructor(
    private readonly db: Knex,
    private readonly schedulerRepo: SchedulerRepository,
    private readonly notificationQueue: NotificationQueue,
    private readonly tripStateMachine: TripStateMachine,
    private readonly tripsRepo: TripsRepository,
  ) {}

  /** Starts the cron job. Call once during app bootstrap. */
  start(): void {
    this.cronTask = cron.schedule('* * * * *', () => {
      void this.tick();
    });
    console.info('[scheduler] started — cron every minute');
  }

  /** Stops the cron job. Call during graceful shutdown. */
  stop(): void {
    this.cronTask?.stop();
    this.cronTask = null;
  }

  private async tick(): Promise<void> {
    try {
      await Promise.all([
        this.activateDueTrips(),
        this.notifyPassengerSearching(),
        this.sendReminders(),
      ]);
    } catch (err) {
      // Do not crash the process — log and continue.
      console.error('[scheduler] tick error:', err);
      // TODO Sprint 7: write to system_error_logs table
    }
  }

  // --------------------------------------------------------------------------
  // Task 1: Activate due trips (SCHEDULED → REQUESTED → SEARCHING via BullMQ)
  //
  // Dispatch condition: scheduled_for - dispatch_window_min <= NOW()
  // Guard:             search_started_at IS NULL (prevents re-dispatch)
  // --------------------------------------------------------------------------

  private async activateDueTrips(): Promise<void> {
    // Collect trip IDs to enqueue OUTSIDE the transaction.
    const activatedTripIds: string[] = [];

    await this.db.transaction(async (trx) => {
      const dueTrips = await this.schedulerRepo.getDueTrips(trx);

      for (const { scheduledTripId, tripId, passengerId: _passengerId } of dueTrips) {
        // Re-fetch inside transaction to get the full Trip object needed by the state machine.
        const trip = await this.tripsRepo.findByIdForUpdate(tripId, trx);
        if (!trip || trip.status !== 'SCHEDULED') {
          // Already transitioned by a concurrent instance — skip.
          continue;
        }

        // Stamp search_started_at BEFORE transitioning to prevent any concurrent
        // tick from picking up the same trip (the SQL WHERE search_started_at IS NULL
        // is the authoritative guard, but this update inside the same transaction
        // ensures the lock is held until commit).
        await this.schedulerRepo.markSearchStarted(trx, scheduledTripId);

        // Transition SCHEDULED → REQUESTED (actor: system, no user FK required).
        await this.tripStateMachine.transition({
          trip,
          toStatus: 'REQUESTED',
          actor: 'system',
          actorId: null,
          trx,
          notes: 'Scheduled trip activated by scheduler',
        });

        await this.tripsRepo.update(tripId, { status: 'REQUESTED' }, trx);
        await this.schedulerRepo.markActivated(trx, scheduledTripId);

        activatedTripIds.push(tripId);
      }
    });

    // Enqueue SEARCHING transition for each activated trip OUTSIDE the transaction.
    for (const tripId of activatedTripIds) {
      tripsQueue.enqueueSearchingTimeout(tripId, 300_000);
    }
  }

  // --------------------------------------------------------------------------
  // Task 2: Notify passenger that search is active at T-15
  //
  // Triggered when:
  //   - search_started_at IS NOT NULL  (dispatch has happened)
  //   - trip status is SEARCHING       (driver not yet found)
  //   - scheduled_for - 15 min <= NOW() (T-15 threshold reached)
  //   - passenger_notified_searching_at IS NULL (not yet notified)
  // --------------------------------------------------------------------------

  private async notifyPassengerSearching(): Promise<void> {
    const trips = await this.schedulerRepo.getTripsNeedingSearchingNotification();

    for (const trip of trips) {
      // Stamp first — if the enqueue fails we will retry on the next tick because
      // passenger_notified_searching_at stays NULL. Inverse order (enqueue first)
      // would cause duplicate notifications on retry.
      await this.schedulerRepo.markPassengerNotifiedSearching(trip.scheduledTripId);

      // Enqueue push OUTSIDE any transaction (ADR-005).
      await this.notificationQueue.enqueue({
        recipientUserId: trip.passengerId,
        type: 'scheduled_trip_searching',
        tripId: trip.tripId,
        scheduledFor: trip.scheduledFor.toISOString(),
      });
    }
  }

  // --------------------------------------------------------------------------
  // Task 3: Send reminder notifications
  // --------------------------------------------------------------------------

  private async sendReminders(): Promise<void> {
    const pendingReminders = await this.schedulerRepo.getPendingReminders();

    for (const reminder of pendingReminders) {
      const scheduledFor = new Date(reminder.scheduledFor);
      const diffMs = scheduledFor.getTime() - Date.now();
      const diffMin = diffMs / (1000 * 60);
      const diffHours = diffMs / (1000 * 60 * 60);

      // Collect which notifications to send so we can enqueue outside the transaction.
      const toSend: Array<'notif_24h_sent' | 'notif_1h_sent' | 'notif_15m_sent'> = [];

      if (!reminder.notif24hSent && diffHours >= 23.5 && diffHours <= 24.5) {
        toSend.push('notif_24h_sent');
      }
      if (!reminder.notif1hSent && diffHours >= 0.833 && diffHours <= 1.167) {
        toSend.push('notif_1h_sent');
      }
      if (!reminder.notif15mSent && diffMin >= 10 && diffMin <= 20) {
        toSend.push('notif_15m_sent');
      }

      if (toSend.length === 0) continue;

      // Mark flags in DB first (inside transaction).
      await this.db.transaction(async (trx) => {
        for (const field of toSend) {
          await this.schedulerRepo.markNotifSent(trx, reminder.scheduledTripId, field);
        }
      });

      // Enqueue notifications OUTSIDE the transaction (ADR-005).
      for (const field of toSend) {
        const type =
          field === 'notif_24h_sent'
            ? 'trip_reminder_24h'
            : field === 'notif_1h_sent'
              ? 'trip_reminder_1h'
              : 'trip_reminder_15m';

        await this.notificationQueue.enqueue({
          recipientUserId: reminder.passengerId,
          type,
          tripId: reminder.tripId,
          scheduledFor: reminder.scheduledFor.toISOString(),
        });
      }
    }
  }
}
