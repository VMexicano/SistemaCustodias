import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemperatureReadingRow {
  trip_id: string;
  recorded_at: string;
  celsius: number;
  sensor_id: string | null;
  lat: number | null;
  lng: number | null;
}

export interface TemperatureSummary {
  min: number;
  max: number;
  avg: number;
  out_of_range_count: number;
  total_readings: number;
}

export interface CreateTemperatureInput {
  tripId: string;
  celsius: number;
  sensorId?: string;
  lat?: number;
  lng?: number;
}

export interface GetReadingsFilter {
  from?: string;
  to?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class TemperatureRepository {
  constructor(private readonly db: Knex) {}

  async createReading(data: CreateTemperatureInput): Promise<void> {
    await this.db('temperature_readings').insert({
      trip_id: data.tripId,
      recorded_at: new Date(),
      celsius: data.celsius,        // DECIMAL(5,2) — number JS directly, no conversion
      sensor_id: data.sensorId ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    });
  }

  async getReadings(
    tripId: string,
    filter: GetReadingsFilter = {},
  ): Promise<TemperatureReadingRow[]> {
    const query = this.db('temperature_readings').where({ trip_id: tripId });

    if (filter.from) {
      query.where('recorded_at', '>=', filter.from);
    }
    if (filter.to) {
      query.where('recorded_at', '<=', filter.to);
    }

    return query
      .orderBy('recorded_at', 'desc')
      .limit(filter.limit ?? 100)
      .select('trip_id', 'recorded_at', 'celsius', 'sensor_id', 'lat', 'lng');
  }

  async getSummary(
    tripId: string,
    setpoints?: { min_celsius: number; max_celsius: number },
  ): Promise<TemperatureSummary> {
    const result = await this.db('temperature_readings')
      .where({ trip_id: tripId })
      .select(
        this.db.raw('MIN(celsius) as min_val'),
        this.db.raw('MAX(celsius) as max_val'),
        this.db.raw('AVG(celsius) as avg_val'),
        this.db.raw('COUNT(*) as total'),
        setpoints
          ? this.db.raw(
              'SUM(CASE WHEN celsius < ? OR celsius > ? THEN 1 ELSE 0 END) as out_of_range',
              [setpoints.min_celsius, setpoints.max_celsius],
            )
          : this.db.raw('0 as out_of_range'),
      )
      .first();

    return {
      min: Number(result?.min_val ?? 0),
      max: Number(result?.max_val ?? 0),
      avg: Number(result?.avg_val ?? 0),
      out_of_range_count: Number(result?.out_of_range ?? 0),
      total_readings: Number(result?.total ?? 0),
    };
  }
}
