import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface DueScheduledTrip {
  scheduledTripId: string;
  tripId: string;
  passengerId: string;
}

export interface PendingReminder {
  scheduledTripId: string;
  tripId: string;
  passengerId: string;
  scheduledFor: Date;
  notif24hSent: boolean;
  notif1hSent: boolean;
  notif15mSent: boolean;
}

export interface SearchingTrip {
  scheduledTripId: string;
  tripId: string;
  passengerId: string;
  scheduledFor: Date;
}

// ---------------------------------------------------------------------------
// SchedulerRepository
// ---------------------------------------------------------------------------

export class SchedulerRepository {
  constructor(private readonly db: Knex) {}

  /**
   * Returns all SCHEDULED trips whose dispatch window has opened:
   *   scheduled_for - dispatch_window_min minutes <= NOW()
   *
   * The search_started_at IS NULL guard prevents re-dispatching trips that
   * have already been queued for driver search in a previous tick.
   *
   * Uses FOR UPDATE SKIP LOCKED to prevent double-processing under concurrent
   * cron ticks (ADR-025).
   * Must be called inside an existing transaction.
   */
  async getDueTrips(trx: Knex.Transaction): Promise<DueScheduledTrip[]> {
    const rows = await trx.raw<{ rows: Array<{ scheduled_trip_id: string; trip_id: string; passenger_id: string }> }>(
      `
      SELECT st.id AS scheduled_trip_id,
             st.trip_id,
             t.passenger_id
      FROM   scheduled_trips st
      JOIN   trips t ON t.id = st.trip_id
      WHERE  (st.scheduled_for - (st.dispatch_window_min * INTERVAL '1 minute')) <= NOW()
        AND  t.status = 'SCHEDULED'
        AND  st.search_started_at IS NULL
        AND  t.deleted_at IS NULL
      FOR UPDATE SKIP LOCKED
      `,
    );

    return rows.rows.map((r) => ({
      scheduledTripId: r.scheduled_trip_id,
      tripId: r.trip_id,
      passengerId: r.passenger_id,
    }));
  }

  /**
   * Records the moment at which the scheduler started searching for a driver.
   * Must be called inside an existing transaction, before transitioning
   * the trip to REQUESTED.
   */
  async markSearchStarted(trx: Knex.Transaction, scheduledTripId: string): Promise<void> {
    await trx('scheduled_trips')
      .where({ id: scheduledTripId })
      .update({ search_started_at: new Date(), updated_at: new Date() });
  }

  /**
   * Returns trips that are currently SEARCHING for a driver and whose
   * scheduled departure is within 15 minutes, but have not yet received a
   * "we are searching" push notification.
   *
   * Condition: search_started_at IS NOT NULL (dispatch has happened)
   *            AND status = 'SEARCHING'
   *            AND scheduled_for - 15 min <= NOW()  (T-15 threshold)
   *            AND passenger_notified_searching_at IS NULL (not yet notified)
   */
  async getTripsNeedingSearchingNotification(): Promise<SearchingTrip[]> {
    const rows = await this.db.raw<{
      rows: Array<{
        scheduled_trip_id: string;
        trip_id: string;
        passenger_id: string;
        scheduled_for: Date;
      }>;
    }>(
      `
      SELECT st.id          AS scheduled_trip_id,
             st.trip_id,
             t.passenger_id,
             st.scheduled_for
      FROM   scheduled_trips st
      JOIN   trips t ON t.id = st.trip_id
      WHERE  st.search_started_at IS NOT NULL
        AND  t.status = 'SEARCHING'
        AND  (st.scheduled_for - INTERVAL '15 minutes') <= NOW()
        AND  st.passenger_notified_searching_at IS NULL
        AND  t.deleted_at IS NULL
      `,
    );

    return rows.rows.map((r) => ({
      scheduledTripId: r.scheduled_trip_id,
      tripId: r.trip_id,
      passengerId: r.passenger_id,
      scheduledFor: r.scheduled_for,
    }));
  }

  /**
   * Stamps passenger_notified_searching_at so the T-15 push is sent exactly once.
   */
  async markPassengerNotifiedSearching(scheduledTripId: string): Promise<void> {
    await this.db('scheduled_trips')
      .where({ id: scheduledTripId })
      .update({ passenger_notified_searching_at: new Date(), updated_at: new Date() });
  }

  /**
   * Returns trips that have at least one pending reminder within the applicable
   * time window:
   *   - 24 h reminder: scheduled_for is between NOW()+23h30m and NOW()+24h30m
   *   - 1 h reminder:  scheduled_for is between NOW()+50m   and NOW()+1h10m
   *   - 15 m reminder: scheduled_for is between NOW()+10m   and NOW()+20m
   */
  async getPendingReminders(): Promise<PendingReminder[]> {
    const rows = await this.db.raw<{
      rows: Array<{
        scheduled_trip_id: string;
        trip_id: string;
        passenger_id: string;
        scheduled_for: Date;
        notif_24h_sent: boolean;
        notif_1h_sent: boolean;
        notif_15m_sent: boolean;
      }>;
    }>(
      `
      SELECT st.id          AS scheduled_trip_id,
             st.trip_id,
             t.passenger_id,
             st.scheduled_for,
             st.notif_24h_sent,
             st.notif_1h_sent,
             st.notif_15m_sent
      FROM   scheduled_trips st
      JOIN   trips t ON t.id = st.trip_id
      WHERE  t.deleted_at IS NULL
        AND  t.status NOT IN ('CANCELLED', 'COMPLETED')
        AND (
              (st.notif_24h_sent = false AND st.scheduled_for BETWEEN NOW() + INTERVAL '23 hours 30 minutes' AND NOW() + INTERVAL '24 hours 30 minutes')
           OR (st.notif_1h_sent  = false AND st.scheduled_for BETWEEN NOW() + INTERVAL '50 minutes'          AND NOW() + INTERVAL '70 minutes')
           OR (st.notif_15m_sent = false AND st.scheduled_for BETWEEN NOW() + INTERVAL '10 minutes'          AND NOW() + INTERVAL '20 minutes')
        )
      ORDER BY st.scheduled_for ASC
      `,
    );

    return rows.rows.map((r) => ({
      scheduledTripId: r.scheduled_trip_id,
      tripId: r.trip_id,
      passengerId: r.passenger_id,
      scheduledFor: r.scheduled_for,
      notif24hSent: r.notif_24h_sent,
      notif1hSent: r.notif_1h_sent,
      notif15mSent: r.notif_15m_sent,
    }));
  }

  /**
   * Marks a specific notification flag as sent for the given scheduled trip.
   * Must be called inside an existing transaction.
   */
  async markNotifSent(
    trx: Knex.Transaction,
    scheduledTripId: string,
    field: 'notif_24h_sent' | 'notif_1h_sent' | 'notif_15m_sent',
  ): Promise<void> {
    await trx('scheduled_trips')
      .where({ id: scheduledTripId })
      .update({ [field]: true, updated_at: new Date() });
  }

  /**
   * Marks the scheduled trip row as processed (trip has been activated).
   * The authoritative state is on trips.status (SCHEDULED → REQUESTED).
   * Must be called inside an existing transaction.
   */
  async markActivated(trx: Knex.Transaction, scheduledTripId: string): Promise<void> {
    await trx('scheduled_trips')
      .where({ id: scheduledTripId })
      .update({ updated_at: new Date() });
  }
}
