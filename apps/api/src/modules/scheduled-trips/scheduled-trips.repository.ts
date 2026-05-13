import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ScheduledTripRow {
  id: string;
  trip_id: string;
  scheduled_for: Date;
  notif_24h_sent: boolean;
  notif_1h_sent: boolean;
  notif_15m_sent: boolean;
  created_at: Date;
  updated_at: Date;
  origin_address: string;
  destination_address: string;
  estimated_fare: number | null;
  trip_type_name: string;
  // Dispatch fields (migration 033)
  dispatch_window_min: number;
  search_started_at: Date | null;
  passenger_notified_searching_at: Date | null;
  pre_assigned_driver_id: string | null;
  pre_assigned_at: Date | null;
}

// ---------------------------------------------------------------------------
// ScheduledTripsRepository
// ---------------------------------------------------------------------------

export class ScheduledTripsRepository {
  constructor(private readonly db: Knex) {}

  async create(tripId: string, scheduledFor: Date, trx?: Knex.Transaction): Promise<void> {
    const qb = trx ?? this.db;
    await qb('scheduled_trips').insert({
      trip_id: tripId,
      scheduled_for: scheduledFor,
    });
  }

  async findByPassenger(passengerId: string): Promise<ScheduledTripRow[]> {
    const rows = await this.db('scheduled_trips as st')
      .join('trips as t', 't.id', 'st.trip_id')
      .join('trip_types as tt', 'tt.id', 't.trip_type_id')
      .where('t.passenger_id', passengerId)
      .where('t.status', 'SCHEDULED')
      .whereNull('t.deleted_at')
      .orderBy('st.scheduled_for', 'asc')
      .select<ScheduledTripRow[]>(
        'st.id',
        'st.trip_id',
        'st.scheduled_for',
        'st.notif_24h_sent',
        'st.notif_1h_sent',
        'st.notif_15m_sent',
        'st.created_at',
        'st.updated_at',
        't.origin_address',
        't.destination_address',
        't.estimated_fare',
        'tt.name as trip_type_name',
      );
    return rows;
  }

  async findByTripId(tripId: string): Promise<ScheduledTripRow | null> {
    const row = await this.db('scheduled_trips as st')
      .join('trips as t', 't.id', 'st.trip_id')
      .join('trip_types as tt', 'tt.id', 't.trip_type_id')
      .where('st.trip_id', tripId)
      .select<ScheduledTripRow>(
        'st.id',
        'st.trip_id',
        'st.scheduled_for',
        'st.notif_24h_sent',
        'st.notif_1h_sent',
        'st.notif_15m_sent',
        'st.created_at',
        'st.updated_at',
        't.origin_address',
        't.destination_address',
        't.estimated_fare',
        'tt.name as trip_type_name',
      )
      .first();
    return row ?? null;
  }
}
