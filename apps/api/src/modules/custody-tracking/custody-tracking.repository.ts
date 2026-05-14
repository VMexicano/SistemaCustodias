// ---------------------------------------------------------------------------
// custody-tracking.repository.ts — DB access for location_readings (TimescaleDB)
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import type {
  LocationReading,
  InsertReadingData,
  LocationHistoryQuery,
} from './custody-tracking.types.js';

export class CustodyTrackingRepository {
  constructor(private readonly db: Knex) {}

  /**
   * Insert a new GPS reading into the TimescaleDB hypertable.
   * Uses db.raw to explicitly set the `time` column (required by TimescaleDB).
   */
  async insertReading(data: InsertReadingData): Promise<void> {
    await this.db.raw(
      `INSERT INTO location_readings
        (time, order_id, operator_id, vehicle_id, lat, lng, speed_kmh, accuracy_m, heading)
       VALUES
        (NOW(), ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.order_id,
        data.operator_id,
        data.vehicle_id,
        data.lat,
        data.lng,
        data.speed_kmh ?? null,
        data.accuracy_m ?? null,
        data.heading ?? null,
      ],
    );
  }

  /**
   * Fetch the most recent location for a given order.
   * Uses the (order_id, time DESC) index for efficiency.
   */
  async getCurrentLocation(orderId: string): Promise<LocationReading | null> {
    const result = await this.db.raw<{ rows: LocationReading[] }>(
      `SELECT time, order_id, operator_id, vehicle_id, lat, lng, speed_kmh, accuracy_m, heading
       FROM location_readings
       WHERE order_id = ?
       ORDER BY time DESC
       LIMIT 1`,
      [orderId],
    );

    return result.rows[0] ?? null;
  }

  /**
   * Fetch location history for an order, optionally filtered by time range.
   */
  async getHistory(
    orderId: string,
    query: LocationHistoryQuery,
  ): Promise<LocationReading[]> {
    const limit = Math.min(query.limit ?? 100, 1000);

    const parts: string[] = [
      `SELECT time, order_id, operator_id, vehicle_id, lat, lng, speed_kmh, accuracy_m, heading
       FROM location_readings
       WHERE order_id = ?`,
    ];
    const bindings: unknown[] = [orderId];

    if (query.from) {
      parts.push('AND time >= ?');
      bindings.push(query.from);
    }

    if (query.to) {
      parts.push('AND time <= ?');
      bindings.push(query.to);
    }

    parts.push('ORDER BY time DESC LIMIT ?');
    bindings.push(limit);

    const result = await this.db.raw<{ rows: LocationReading[] }>(
      parts.join(' '),
      bindings as string[],
    );

    return result.rows;
  }
}
