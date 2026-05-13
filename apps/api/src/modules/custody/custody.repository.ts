import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustodyEventRow {
  id: string;
  trip_id: string;
  event_type: 'pick_up' | 'handoff' | 'delivery';
  actor_id: string;
  actor_name: string | null;
  signature_url: string | null;
  photo_url: string | null;
  declared_value: number | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  occurred_at: string;
  sequence: number;
}

export interface CreateCustodyEventInput {
  tripId: string;
  eventType: 'pick_up' | 'handoff' | 'delivery';
  actorId: string;
  signatureUrl?: string;
  photoUrl?: string;
  declaredValue?: number;
  notes?: string;
  lat?: number;
  lng?: number;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class CustodyRepository {
  constructor(private readonly db: Knex) {}

  async createEvent(data: CreateCustodyEventInput): Promise<CustodyEventRow> {
    const lastSeq = await this.db('custody_events')
      .where({ trip_id: data.tripId })
      .max('sequence as seq')
      .first();
    const nextSeq = ((lastSeq?.seq as number | null) ?? 0) + 1;

    const [row] = await this.db('custody_events')
      .insert({
        trip_id: data.tripId,
        event_type: data.eventType,
        actor_id: data.actorId,
        signature_url: data.signatureUrl ?? null,
        photo_url: data.photoUrl ?? null,
        declared_value: data.declaredValue ?? null,
        notes: data.notes ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        occurred_at: new Date(),
        sequence: nextSeq,
      })
      .returning('*');

    return { ...(row as CustodyEventRow), actor_name: null };
  }

  async getEventsByTrip(tripId: string): Promise<CustodyEventRow[]> {
    const rows = await this.db('custody_events')
      .leftJoin('users', 'custody_events.actor_id', 'users.id')
      .where('custody_events.trip_id', tripId)
      .select(
        'custody_events.id',
        'custody_events.trip_id',
        'custody_events.event_type',
        'custody_events.actor_id',
        'users.full_name as actor_name',
        'custody_events.signature_url',
        'custody_events.photo_url',
        'custody_events.declared_value',
        'custody_events.notes',
        'custody_events.lat',
        'custody_events.lng',
        'custody_events.occurred_at',
        'custody_events.sequence',
      )
      .orderBy('custody_events.sequence', 'asc');

    return rows as CustodyEventRow[];
  }
}
