import { BusinessError } from '../../shared/errors/business-error.js';
import type { CustodyRepository, CustodyEventRow, CreateCustodyEventInput } from './custody.repository.js';
import type { TripsRepository } from '../trips/trips.repository.js';
import type { DriversRepository } from '../drivers/drivers.repository.js';

// ---------------------------------------------------------------------------
// Input DTOs
// ---------------------------------------------------------------------------

export interface CreateCustodyEventDto {
  tripId: string;
  eventType: 'pick_up' | 'handoff' | 'delivery';
  actorUserId: string;  // JWT.sub
  signatureUrl?: string;
  photoUrl?: string;
  declaredValue?: number;
  notes?: string;
  lat?: number;
  lng?: number;
}

export interface GetCustodyEventsDto {
  tripId: string;
  requestingUserId: string;
  requestingUserRoles: string[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CustodyService {
  constructor(
    private readonly custodyRepo: CustodyRepository,
    private readonly tripsRepo: TripsRepository,
    private readonly driversRepo: DriversRepository,
  ) {}

  async createEvent(dto: CreateCustodyEventDto): Promise<CustodyEventRow> {
    // 1. Trip must exist
    const trip = await this.tripsRepo.findById(dto.tripId);
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', `Trip '${dto.tripId}' not found`);
    }

    // 2. Trip must be in ACCEPTED or IN_PROGRESS
    if (trip.status !== 'ACCEPTED' && trip.status !== 'IN_PROGRESS') {
      throw new BusinessError('TRIP_NOT_ACTIVE', `Trip is not active (status: ${trip.status})`);
    }

    // 3. Actor must be the trip driver
    const driver = await this.driversRepo.findByUserId(dto.actorUserId);
    if (!driver || driver.id !== trip.driver_id) {
      throw new BusinessError('FORBIDDEN', 'Only the assigned driver can create custody events');
    }

    const input: CreateCustodyEventInput = {
      tripId: dto.tripId,
      eventType: dto.eventType,
      actorId: dto.actorUserId,
      signatureUrl: dto.signatureUrl,
      photoUrl: dto.photoUrl,
      declaredValue: dto.declaredValue,
      notes: dto.notes,
      lat: dto.lat,
      lng: dto.lng,
    };

    return this.custodyRepo.createEvent(input);
  }

  async getEventsByTrip(dto: GetCustodyEventsDto): Promise<CustodyEventRow[]> {
    // 1. Trip must exist
    const trip = await this.tripsRepo.findById(dto.tripId);
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', `Trip '${dto.tripId}' not found`);
    }

    // 2. Requester must be driver, passenger, or admin
    const isAdmin = dto.requestingUserRoles.includes('admin');

    if (!isAdmin) {
      const driver = await this.driversRepo.findByUserId(dto.requestingUserId);
      const isDriver = driver !== undefined && driver.id === trip.driver_id;
      const isPassenger = trip.passenger_id === dto.requestingUserId;

      if (!isDriver && !isPassenger) {
        throw new BusinessError('FORBIDDEN', 'Access denied to custody events');
      }
    }

    return this.custodyRepo.getEventsByTrip(dto.tripId);
  }
}
