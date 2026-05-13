import type { Knex } from 'knex';
import { BusinessError } from '../../shared/errors/business-error.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminStats {
  active_trips: number;
  online_drivers: number;
  today_revenue: number;
  pending_errors: number;
}

export interface AdminTripRow {
  id: string;
  status: string;
  passenger_name: string;
  origin_lat: number;
  origin_lng: number;
  origin_address: string;
  destination_lat: number;
  destination_lng: number;
  destination_address: string;
  origin: {
    lat: number;
    lng: number;
    address: string;
  };
  destinations: Array<{
    sequence: number;
    lat: number;
    lng: number;
    address: string;
  }>;
  created_at: Date;
  fare_amount: number | null;
  scheduled_for?: string | null;
  search_started_at?: string | null;
}

interface AdminTripDbRow {
  id: string;
  status: string;
  passenger_name: string;
  origin_lat: number;
  origin_lng: number;
  origin_address: string;
  destination_lat: number;
  destination_lng: number;
  destination_address: string;
  created_at: Date;
  fare_amount: number | null;
  scheduled_for?: string | null;
  search_started_at?: string | null;
}

export interface AdminDriverRow {
  id: string;
  full_name: string;
  phone: string;
  online: boolean;
  status: string;
  created_at: Date;
}

export interface AdminUserRow {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  status: string;
  created_at: Date;
  company_name: string | null;
}

export interface SystemErrorLog {
  id: string;
  message: string;
  context: unknown;
  resolved_at: Date | null;
  created_at: Date;
}

export interface GetListFilters {
  status?: string;
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// AdminRepository
// ---------------------------------------------------------------------------

export class AdminRepository {
  constructor(private readonly db: Knex) {}

  async getStats(): Promise<AdminStats> {
    const rawResult = await this.db.raw(
      `SELECT
        COUNT(*) FILTER (WHERE t.status IN ('SEARCHING','ACCEPTED','DRIVER_ARRIVED','IN_PROGRESS')) AS active_trips,
        (SELECT COUNT(*) FROM drivers WHERE online = true AND deleted_at IS NULL) AS online_drivers,
        COALESCE(SUM(p.amount) FILTER (WHERE p.charged_at::date = CURRENT_DATE), 0) AS today_revenue,
        (SELECT COUNT(*) FROM system_error_logs WHERE resolved_at IS NULL) AS pending_errors
      FROM trips t
      LEFT JOIN payments p ON p.trip_id = t.id
      WHERE t.deleted_at IS NULL`,
    ) as { rows: Array<Record<string, string>> };

    const result: Record<string, string> = rawResult.rows[0] ?? {};

    return {
      active_trips: parseInt(result['active_trips'] ?? '0', 10),
      online_drivers: parseInt(result['online_drivers'] ?? '0', 10),
      today_revenue: parseFloat(result['today_revenue'] ?? '0'),
      pending_errors: parseInt(result['pending_errors'] ?? '0', 10),
    };
  }

  async getTrips(filters: GetListFilters): Promise<PaginatedResult<AdminTripRow>> {
    const offset = (filters.page - 1) * filters.limit;

    let query = this.db('trips as t')
      .join('users as u', 'u.id', 't.passenger_id')
      .leftJoin('scheduled_trips as scht', 'scht.trip_id', 't.id')
      .whereNull('t.deleted_at');

    if (filters.status) {
      query = query.where('t.status', filters.status);
    }

    const countQuery = query.clone().count<Array<{ count: string }>>('t.id as count').first();
    const dataQuery = query
      .clone()
      .select<AdminTripDbRow[]>([
        't.id',
        't.status',
        this.db.raw("u.full_name AS passenger_name"),
        't.origin_lat',
        't.origin_lng',
        't.origin_address',
        't.destination_lat',
        't.destination_lng',
        't.destination_address',
        't.created_at',
        this.db.raw('NULL::numeric AS fare_amount'),
        this.db.raw('scht.scheduled_for::text AS scheduled_for'),
        this.db.raw("scht.search_started_at::text AS search_started_at"),
      ])
      .orderBy('t.created_at', 'desc')
      .limit(filters.limit)
      .offset(offset);

    const [countResult, data] = await Promise.all([countQuery, dataQuery]);
    const total = parseInt(countResult?.count ?? '0', 10);

    const mappedData: AdminTripRow[] = data.map((trip) => {
      const originLat = Number(trip.origin_lat);
      const originLng = Number(trip.origin_lng);
      const destinationLat = Number(trip.destination_lat);
      const destinationLng = Number(trip.destination_lng);
      return {
        ...trip,
        origin_lat: originLat,
        origin_lng: originLng,
        destination_lat: destinationLat,
        destination_lng: destinationLng,
        fare_amount: trip.fare_amount !== null ? Number(trip.fare_amount) : null,
        scheduled_for: trip.scheduled_for ?? null,
        search_started_at: trip.search_started_at ?? null,
        origin: {
          lat: originLat,
          lng: originLng,
          address: trip.origin_address,
        },
        destinations: [
          {
            sequence: 1,
            lat: destinationLat,
            lng: destinationLng,
            address: trip.destination_address,
          },
        ],
      };
    });

    return { data: mappedData, total, page: filters.page, limit: filters.limit };
  }

  async getDrivers(filters: GetListFilters): Promise<PaginatedResult<AdminDriverRow>> {
    const offset = (filters.page - 1) * filters.limit;

    let query = this.db('drivers as d')
      .join('users as u', 'u.id', 'd.user_id')
      .whereNull('d.deleted_at');

    if (filters.status) {
      query = query.where('d.status', filters.status);
    }

    const countQuery = query.clone().count<Array<{ count: string }>>('d.id as count').first();
    const dataQuery = query
      .clone()
      .select<AdminDriverRow[]>([
        'd.id',
        'u.full_name',
        'u.phone',
        'd.online',
        'd.status',
        'd.created_at',
      ])
      .orderBy('d.created_at', 'desc')
      .limit(filters.limit)
      .offset(offset);

    const [countResult, data] = await Promise.all([countQuery, dataQuery]);
    const total = parseInt(countResult?.count ?? '0', 10);

    return { data, total, page: filters.page, limit: filters.limit };
  }

  async updateDriverStatus(driverId: string, status: string): Promise<void> {
    const updated = await this.db('drivers').where({ id: driverId }).whereNull('deleted_at').update({ status });
    if (updated === 0) {
      throw new BusinessError('DRIVER_NOT_FOUND', `Driver ${driverId} not found`);
    }
  }

  async getUsers(filters: GetListFilters): Promise<PaginatedResult<AdminUserRow>> {
    const offset = (filters.page - 1) * filters.limit;

    const query = this.db('users as u')
      .leftJoin('company_users as cu', 'cu.user_id', 'u.id')
      .leftJoin('companies as c', 'c.id', 'cu.company_id')
      .whereNull('u.deleted_at');

    const countQuery = query.clone().count<Array<{ count: string }>>('u.id as count').first();
    const dataQuery = query
      .clone()
      .select<AdminUserRow[]>([
        'u.id',
        'u.full_name',
        'u.phone',
        'u.email',
        'u.status',
        'u.created_at',
        this.db.raw('c.name AS company_name'),
      ])
      .orderBy('u.created_at', 'desc')
      .limit(filters.limit)
      .offset(offset);

    const [countResult, data] = await Promise.all([countQuery, dataQuery]);
    const total = parseInt(countResult?.count ?? '0', 10);

    return { data, total, page: filters.page, limit: filters.limit };
  }

  async searchUserByPhone(phone: string): Promise<AdminUserRow[]> {
    return this.db('users as u')
      .leftJoin('company_users as cu', 'cu.user_id', 'u.id')
      .leftJoin('companies as c', 'c.id', 'cu.company_id')
      .whereNull('u.deleted_at')
      .whereILike('u.phone', `%${phone}%`)
      .select<AdminUserRow[]>([
        'u.id',
        'u.full_name',
        'u.phone',
        'u.email',
        'u.status',
        'u.created_at',
        this.db.raw('c.name AS company_name'),
      ])
      .limit(10);
  }

  async getErrors(resolved: boolean): Promise<SystemErrorLog[]> {
    return this.db<SystemErrorLog>('system_error_logs')
      .modify((qb) => {
        if (resolved) {
          qb.whereNotNull('resolved_at');
        } else {
          qb.whereNull('resolved_at');
        }
      })
      .orderBy('created_at', 'desc')
      .limit(100);
  }

  async resolveError(id: string): Promise<SystemErrorLog> {
    const existing = await this.db<SystemErrorLog>('system_error_logs').where({ id }).first();

    if (!existing) {
      throw new BusinessError('ADMIN_ERROR_NOT_FOUND', `Error log ${id} not found`);
    }

    if (existing.resolved_at !== null) {
      throw new BusinessError('ADMIN_ERROR_ALREADY_RESOLVED', `Error log ${id} is already resolved`);
    }

    const [updated] = await this.db<SystemErrorLog>('system_error_logs')
      .where({ id })
      .update({ resolved_at: new Date() })
      .returning('*');

    return updated!;
  }
}
