import { BusinessError } from '../../shared/errors/business-error.js';
import type { TripsRepository } from '../trips/trips.repository.js';
import type { DriversRepository } from '../drivers/drivers.repository.js';
import type {
  TemperatureRepository,
  TemperatureReadingRow,
  TemperatureSummary,
  GetReadingsFilter,
} from './temperature.repository.js';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface CreateTemperatureDto {
  tripId: string;
  actorUserId: string;   // JWT sub — must be the trip driver's user_id
  celsius: number;
  sensorId?: string;
  lat?: number;
  lng?: number;
}

export interface GetTemperatureDto {
  tripId: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface TemperatureResult {
  readings: TemperatureReadingRow[];
  summary: TemperatureSummary;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TemperatureService {
  constructor(
    private readonly temperatureRepo: TemperatureRepository,
    private readonly tripsRepo: TripsRepository,
    private readonly driversRepo: DriversRepository,
  ) {}

  // --------------------------------------------------------------------------
  // POST /trips/:id/temperature
  // --------------------------------------------------------------------------

  async createReading(dto: CreateTemperatureDto): Promise<void> {
    // 1. Trip must exist
    const trip = await this.tripsRepo.findById(dto.tripId);
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', `Trip '${dto.tripId}' not found`);
    }

    // 2. Trip must be IN_PROGRESS
    if (trip.status !== 'IN_PROGRESS') {
      throw new BusinessError('TRIP_NOT_IN_PROGRESS', 'Temperature readings can only be added to trips in progress');
    }

    // 3. Temperature must be in valid range [-100, 200]
    if (dto.celsius < -100 || dto.celsius > 200) {
      throw new BusinessError('INVALID_TEMPERATURE', 'Temperature must be between -100 and 200 celsius');
    }

    // 4. Actor must be the trip's driver (JWT.sub → drivers.user_id → driver.id === trip.driver_id)
    const driver = await this.driversRepo.findByUserId(dto.actorUserId);
    if (!driver || driver.id !== trip.driver_id) {
      throw new BusinessError('FORBIDDEN', 'Only the assigned driver can record temperature readings');
    }

    // 5. Create reading
    await this.temperatureRepo.createReading({
      tripId: dto.tripId,
      celsius: dto.celsius,
      sensorId: dto.sensorId,
      lat: dto.lat,
      lng: dto.lng,
    });
  }

  // --------------------------------------------------------------------------
  // GET /trips/:id/temperature
  // --------------------------------------------------------------------------

  async getTemperature(dto: GetTemperatureDto): Promise<TemperatureResult> {
    // 1. Trip must exist
    const trip = await this.tripsRepo.findById(dto.tripId);
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', `Trip '${dto.tripId}' not found`);
    }

    // 2. Gather readings
    const filter: GetReadingsFilter = {
      from: dto.from,
      to: dto.to,
      limit: dto.limit,
    };
    const readings = await this.temperatureRepo.getReadings(dto.tripId, filter);

    // 3. Extract setpoints from trip metadata (if any)
    const metadata = trip.metadata as Record<string, unknown> | undefined;
    const rawSetpoints = metadata?.setpoints as
      | { min_celsius: number; max_celsius: number }
      | undefined;

    const setpoints =
      rawSetpoints !== undefined &&
      typeof rawSetpoints.min_celsius === 'number' &&
      typeof rawSetpoints.max_celsius === 'number'
        ? rawSetpoints
        : undefined;

    const summary = await this.temperatureRepo.getSummary(dto.tripId, setpoints);

    return { readings, summary };
  }
}
