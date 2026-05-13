import type { Knex } from 'knex';
import type { Redis } from 'ioredis';

export interface LocationPoint {
  lat: number;
  lng: number;
  recorded_at: string;
}

export class TrackingService {
  constructor(
    private readonly db: Knex,
    private readonly redis: Redis,
  ) {}

  /**
   * Records a GPS location point for a driver.
   * Only inserts if the driver has an active trip in Redis.
   * Also updates the driver's current location in Redis with a 5-minute TTL.
   */
  async recordLocation(driverId: string, lat: number, lng: number): Promise<void> {
    const activeTripRaw = await this.redis.get(`driver:${driverId}:active_trip`);
    if (!activeTripRaw) return;

    const activeTrip = JSON.parse(activeTripRaw) as { id: string };

    // TimescaleDB hypertable — use knex.raw for compatibility
    await this.db.raw(
      `INSERT INTO trip_locations (trip_id, driver_id, lat, lng, recorded_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [activeTrip.id, driverId, lat, lng],
    );

    await this.redis.set(
      `driver:${driverId}:location`,
      JSON.stringify({ lat, lng, updated_at: new Date().toISOString() }),
      'EX',
      300, // 5 minutes TTL
    );
  }

  /**
   * Returns the last N GPS locations for a trip, ordered most-recent first.
   */
  async getTripLocations(tripId: string, limit = 100): Promise<LocationPoint[]> {
    const rows = await this.db('trip_locations')
      .where({ trip_id: tripId })
      .orderBy('recorded_at', 'desc')
      .limit(limit)
      .select('lat', 'lng', 'recorded_at');

    return rows.map((r: { lat: string | number; lng: string | number; recorded_at: Date | string }) => ({
      lat: typeof r.lat === 'string' ? parseFloat(r.lat) : r.lat,
      lng: typeof r.lng === 'string' ? parseFloat(r.lng) : r.lng,
      recorded_at: r.recorded_at instanceof Date ? r.recorded_at.toISOString() : String(r.recorded_at),
    }));
  }
}
