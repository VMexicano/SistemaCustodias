import type { Knex } from 'knex';
import type { CustodyRoute, Waypoint } from './custody-routing.types.js';

interface RouteRow {
  id: string;
  order_id: string;
  waypoints: Waypoint[];
  total_distance_km: string | null;
  estimated_duration_minutes: number | null;
  approved_by: string | null;
  approved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toDTO(row: RouteRow): CustodyRoute {
  return {
    id: row.id,
    orderId: row.order_id,
    waypoints: row.waypoints,
    totalDistanceKm: row.total_distance_km !== null ? parseFloat(row.total_distance_km) : null,
    estimatedDurationMinutes: row.estimated_duration_minutes,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class CustodyRoutingRepository {
  constructor(private readonly db: Knex) {}

  async findByOrderId(orderId: string): Promise<CustodyRoute | null> {
    const row = await this.db<RouteRow>('custody_routes')
      .where({ order_id: orderId })
      .first();
    return row ? toDTO(row) : null;
  }

  async upsert(payload: {
    orderId: string;
    waypoints: Waypoint[];
    totalDistanceKm: number | null;
    estimatedDurationMinutes: number | null;
  }): Promise<CustodyRoute> {
    const existing = await this.findByOrderId(payload.orderId);

    if (existing) {
      const [row] = await this.db('custody_routes')
        .where({ order_id: payload.orderId })
        .update({
          waypoints: JSON.stringify(payload.waypoints),
          total_distance_km: payload.totalDistanceKm,
          estimated_duration_minutes: payload.estimatedDurationMinutes,
          updated_at: this.db.fn.now(),
        })
        .returning<RouteRow[]>('*');
      return toDTO(row!);
    }

    const [row] = await this.db('custody_routes')
      .insert({
        order_id: payload.orderId,
        waypoints: JSON.stringify(payload.waypoints),
        total_distance_km: payload.totalDistanceKm,
        estimated_duration_minutes: payload.estimatedDurationMinutes,
      })
      .returning<RouteRow[]>('*');
    return toDTO(row!);
  }

  async approve(orderId: string, approvedBy: string): Promise<CustodyRoute | null> {
    const [row] = await this.db('custody_routes')
      .where({ order_id: orderId })
      .update({
        approved_by: approvedBy,
        approved_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      })
      .returning<RouteRow[]>('*');
    return row ? toDTO(row) : null;
  }
}
