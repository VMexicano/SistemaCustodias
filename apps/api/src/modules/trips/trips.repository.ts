import type { Knex } from 'knex';
import type { Database } from '../../config/database.js';
import type { Trip, TripStatus, TripStatusHistory } from './trips.types.js';

// ---------------------------------------------------------------------------
// CreateTripData
// ---------------------------------------------------------------------------

export interface CreateTripData {
  region_id: string;
  passenger_id: string;
  trip_type_id: string;
  origin_lat: number;
  origin_lng: number;
  origin_address: string;
  destination_lat: number;
  destination_lng: number;
  destination_address: string;
  estimated_distance_km: number;
  estimated_duration_min: number;
  estimated_fare: number;
  pricing_snapshot: unknown;
  status: TripStatus;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// TripWithWait — used by findPendingApproval
// ---------------------------------------------------------------------------

export interface TripWithWait extends Trip {
  passenger_phone: string | null;
  wait_minutes: number;
}

// ---------------------------------------------------------------------------
// TripsRepository
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES: TripStatus[] = [
  'PENDING_APPROVAL',
  'APPROVED',
  'REQUESTED',
  'SEARCHING',
  'ACCEPTED',
  'DRIVER_EN_ROUTE',
  'DRIVER_ARRIVED',
  'IN_PROGRESS',
];

export class TripsRepository {
  constructor(private readonly db: Database) {}

  async create(data: CreateTripData, trx?: Knex.Transaction): Promise<Trip> {
    const qb = trx ? trx('trips') : this.db('trips');
    const [row] = await qb
      .insert({
        region_id: data.region_id,
        passenger_id: data.passenger_id,
        trip_type_id: data.trip_type_id,
        status: data.status,
        origin_address: data.origin_address,
        origin_lat: data.origin_lat,
        origin_lng: data.origin_lng,
        destination_address: data.destination_address,
        destination_lat: data.destination_lat,
        destination_lng: data.destination_lng,
        estimated_distance_km: data.estimated_distance_km,
        estimated_duration_min: data.estimated_duration_min,
        estimated_fare: data.estimated_fare,
        pricing_snapshot: JSON.stringify(data.pricing_snapshot),
        metadata: JSON.stringify(data.metadata ?? {}),
      })
      .returning('*');
    return this.mapRow(row);
  }

  async findById(id: string, trx?: Knex.Transaction): Promise<Trip | null> {
    const qb = trx ? trx('trips') : this.db('trips');
    const row = await qb
      .where({ id })
      .whereNull('deleted_at')
      .first();
    return row ? this.mapRow(row) : null;
  }

  async findActiveByPassengerId(passengerId: string): Promise<Trip | null> {
    const row = await this.db('trips')
      .where('passenger_id', passengerId)
      .whereIn('status', ACTIVE_STATUSES)
      .whereNull('deleted_at')
      .first();
    return row ? this.mapRow(row) : null;
  }

  async findActiveByDriverId(driverId: string): Promise<Trip | null> {
    const row = await this.db('trips')
      .where('driver_id', driverId)
      .whereIn('status', ACTIVE_STATUSES)
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc')
      .first();
    return row ? this.mapRow(row) : null;
  }

  async findAllActiveByDriverId(driverId: string): Promise<Trip[]> {
    const rows = await this.db('trips')
      .where('driver_id', driverId)
      .whereIn('status', ACTIVE_STATUSES)
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');
    return rows.map((r: Record<string, unknown>) => this.mapRow(r));
  }

  async findByPassengerId(
    passengerId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Trip[]; total: number }> {
    const offset = (page - 1) * limit;

    const [countResult, rows] = await Promise.all([
      this.db('trips')
        .where('passenger_id', passengerId)
        .whereNull('deleted_at')
        .count('id as count')
        .first(),
      this.db('trips')
        .where('passenger_id', passengerId)
        .whereNull('deleted_at')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .select('*'),
    ]);

    const total = Number((countResult as { count: string }).count);
    return { data: rows.map((r) => this.mapRow(r)), total };
  }

  async update(id: string, data: Partial<Trip>, trx: Knex.Transaction): Promise<Trip> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = { updated_at: new Date() };

    if (data.status !== undefined) updateData['status'] = data.status;
    if (data.driver_id !== undefined) updateData['driver_id'] = data.driver_id;
    if (data.accepted_at !== undefined) updateData['accepted_at'] = data.accepted_at;
    if (data.started_at !== undefined) updateData['started_at'] = data.started_at;
    if (data.completed_at !== undefined) updateData['completed_at'] = data.completed_at;
    if (data.cancelled_at !== undefined) updateData['cancelled_at'] = data.cancelled_at;
    if (data.cancellation_reason !== undefined) updateData['cancellation_reason'] = data.cancellation_reason;
    if (data.final_fare !== undefined) updateData['final_fare'] = data.final_fare;
    if (data.actual_distance_km !== undefined) updateData['actual_distance_km'] = data.actual_distance_km;
    if (data.actual_duration_min !== undefined) updateData['actual_duration_min'] = data.actual_duration_min;
    if (data.destination_lat !== undefined) updateData['destination_lat'] = data.destination_lat;
    if (data.destination_lng !== undefined) updateData['destination_lng'] = data.destination_lng;
    if (data.destination_address !== undefined) updateData['destination_address'] = data.destination_address;
    if (data.approved_at !== undefined) updateData['approved_at'] = data.approved_at;
    if (data.approved_by !== undefined) updateData['approved_by'] = data.approved_by;

    const [row] = await trx('trips')
      .where({ id })
      .update(updateData)
      .returning('*');

    return this.mapRow(row);
  }

  async insertStatusHistory(
    entry: Omit<TripStatusHistory, 'id' | 'created_at'>,
    trx: Knex.Transaction,
  ): Promise<void> {
    await trx('trip_status_history').insert({
      trip_id: entry.trip_id,
      from_status: entry.from_status,
      to_status: entry.to_status,
      changed_by: entry.changed_by,
      actor_type: entry.actor_type,
      notes: entry.notes,
    });
  }

  async findStatusHistory(tripId: string): Promise<TripStatusHistory[]> {
    const rows = await this.db('trip_status_history')
      .where('trip_id', tripId)
      .orderBy('created_at', 'asc')
      .select('*');
    return rows.map((r) => ({
      id: r.id as string,
      trip_id: r.trip_id as string,
      from_status: r.from_status ?? null,
      to_status: r.to_status as TripStatusHistory['to_status'],
      changed_by: r.changed_by as string,
      actor_type: r.actor_type as TripStatusHistory['actor_type'],
      notes: r.notes ?? null,
      created_at: r.created_at as Date,
    }));
  }

  // --------------------------------------------------------------------------
  // findPendingApproval — paginated list for dispatcher backoffice
  // --------------------------------------------------------------------------

  async findPendingApproval(
    limit: number,
    offset: number,
  ): Promise<{ data: TripWithWait[]; total: number }> {
    const [countResult, rows] = await Promise.all([
      this.db('trips')
        .where('trips.status', 'PENDING_APPROVAL')
        .whereNull('trips.deleted_at')
        .count('trips.id as count')
        .first(),
      this.db('trips')
        .leftJoin('users', 'trips.passenger_id', 'users.id')
        .where('trips.status', 'PENDING_APPROVAL')
        .whereNull('trips.deleted_at')
        .orderBy('trips.created_at', 'asc')
        .limit(limit)
        .offset(offset)
        .select(
          'trips.*',
          'users.phone as passenger_phone',
          this.db.raw(
            `EXTRACT(EPOCH FROM (NOW() - trips.created_at)) / 60 AS wait_minutes`,
          ),
        ),
    ]);

    const total = Number((countResult as { count: string }).count);
    return {
      data: rows.map((r: Record<string, unknown>) => ({
        ...this.mapRow(r),
        passenger_phone: (r['passenger_phone'] as string | null) ?? null,
        wait_minutes: Number(r['wait_minutes'] ?? 0),
      })),
      total,
    };
  }

  // --------------------------------------------------------------------------
  // SELECT FOR UPDATE — returns trip row locked within a transaction
  // --------------------------------------------------------------------------

  async findByIdForUpdate(id: string, trx: Knex.Transaction): Promise<Trip | null> {
    const row = await trx('trips')
      .where({ id })
      .whereNull('deleted_at')
      .forUpdate()
      .first();
    return row ? this.mapRow(row) : null;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRow(row: any): Trip {
    return {
      id: row.id as string,
      region_id: row.region_id as string,
      passenger_id: row.passenger_id as string,
      driver_id: row.driver_id ?? null,
      trip_type_id: row.trip_type_id as string,
      status: row.status as Trip['status'],
      origin_lat: Number(row.origin_lat),
      origin_lng: Number(row.origin_lng),
      origin_address: row.origin_address as string,
      destination_lat: Number(row.destination_lat),
      destination_lng: Number(row.destination_lng),
      destination_address: row.destination_address as string,
      estimated_distance_km: row.estimated_distance_km !== null ? Number(row.estimated_distance_km) : null,
      estimated_duration_min: row.estimated_duration_min !== null ? Number(row.estimated_duration_min) : null,
      estimated_fare: row.estimated_fare !== null ? Number(row.estimated_fare) : null,
      actual_distance_km: row.actual_distance_km !== null ? Number(row.actual_distance_km) : null,
      actual_duration_min: row.actual_duration_min !== null ? Number(row.actual_duration_min) : null,
      final_fare: row.final_fare !== null ? Number(row.final_fare) : null,
      pricing_snapshot: typeof row.pricing_snapshot === 'string'
        ? JSON.parse(row.pricing_snapshot)
        : row.pricing_snapshot ?? null,
      accepted_at: row.accepted_at ? new Date(row.accepted_at) : null,
      approved_at: row.approved_at ? new Date(row.approved_at) : null,
      approved_by: row.approved_by ?? null,
      started_at: row.started_at ? new Date(row.started_at) : null,
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
      cancelled_at: row.cancelled_at ? new Date(row.cancelled_at) : null,
      cancellation_reason: row.cancellation_reason ?? null,
      metadata: typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : (row.metadata ?? {}),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }
}
