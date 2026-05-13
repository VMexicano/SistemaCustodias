import type { Knex } from 'knex';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { ScheduledTripsRepository, ScheduledTripRow } from './scheduled-trips.repository.js';
import type { TripsRepository } from '../trips/trips.repository.js';
import type { PricingEngine } from '../pricing/pricing-engine.js';
import type { PricingRepository } from '../pricing/pricing.repository.js';
import { TripStateMachine } from '../trips/trip-state-machine.js';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ScheduleTripInput {
  passengerId: string;
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  tripTypeId: string;
  scheduledFor: string; // ISO 8601
}

export interface ScheduleTripResult {
  tripId: string;
  scheduledFor: Date;
  estimatedFare: number;
}

// ---------------------------------------------------------------------------
// ScheduledTripsService
// ---------------------------------------------------------------------------

export class ScheduledTripsService {
  constructor(
    private readonly db: Knex,
    private readonly scheduledRepo: ScheduledTripsRepository,
    private readonly tripsRepo: TripsRepository,
    private readonly pricingEngine: PricingEngine,
    private readonly pricingRepo: PricingRepository,
  ) {}

  async schedule(input: ScheduleTripInput): Promise<ScheduleTripResult> {
    // 1. Validate scheduledFor >= NOW + 30 minutes
    const scheduledFor = new Date(input.scheduledFor);
    if (isNaN(scheduledFor.getTime())) {
      throw new BusinessError('VALIDATION_ERROR', 'scheduledFor must be a valid ISO 8601 date');
    }
    const minScheduledFor = new Date(Date.now() + 30 * 60 * 1000);
    if (scheduledFor < minScheduledFor) {
      throw new BusinessError('SCHEDULED_TOO_SOON', 'Trip must be scheduled at least 30 minutes in advance');
    }

    // 2. Validate origin !== destination
    if (
      input.origin.lat === input.destination.lat &&
      input.origin.lng === input.destination.lng
    ) {
      throw new BusinessError('ORIGIN_EQUALS_DESTINATION', 'Origin and destination cannot be the same');
    }

    // 3. Verify no active trip for this passenger (R-TRIP-001)
    const activeStatuses = ['PENDING_APPROVAL', 'APPROVED', 'REQUESTED', 'SEARCHING', 'ACCEPTED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'SCHEDULED'];
    const existingActive = await this.db('trips')
      .where({ passenger_id: input.passengerId })
      .whereIn('status', activeStatuses)
      .whereNull('deleted_at')
      .first();
    if (existingActive) {
      throw new BusinessError('PASSENGER_HAS_ACTIVE_TRIP', 'Passenger already has an active trip');
    }

    // 4. Load trip type and pricing data
    const tripType = await this.pricingRepo.findTripTypeById(input.tripTypeId);
    if (!tripType) {
      throw new BusinessError('TRIP_TYPE_NOT_FOUND', `Trip type ${input.tripTypeId} not found or inactive`);
    }

    const activeFactors = await this.pricingRepo.findActiveFactors(tripType.region_id);
    const regionConfig = await this.pricingRepo.findRegionConfig(tripType.region_id);
    const taxPct = regionConfig ? Number(regionConfig.tax_rate) : 0;

    // 5. Calculate estimated fare via PricingEngine
    const estimate = this.pricingEngine.estimate({
      origin: input.origin,
      destination: input.destination,
      tripType,
      activeFactors,
      regionTaxPct: taxPct,
    });

    if (estimate.estimated_distance_km > 200) {
      throw new BusinessError('DISTANCE_EXCEEDS_LIMIT', 'Distance exceeds the 200km limit');
    }

    // 6. Create trip in SCHEDULED state (in transaction)
    const tripId = await this.db.transaction(async (trx: Knex.Transaction) => {
      const newTrip = await this.tripsRepo.create(
        {
          region_id: tripType.region_id,
          passenger_id: input.passengerId,
          trip_type_id: input.tripTypeId,
          status: 'SCHEDULED',
          origin_lat: input.origin.lat,
          origin_lng: input.origin.lng,
          origin_address: input.origin.address,
          destination_lat: input.destination.lat,
          destination_lng: input.destination.lng,
          destination_address: input.destination.address,
          estimated_distance_km: estimate.estimated_distance_km,
          estimated_duration_min: estimate.estimated_duration_min,
          estimated_fare: estimate.final_fare,
          pricing_snapshot: estimate.pricing_snapshot,
        },
        trx,
      );

      // Record initial status history
      await this.tripsRepo.insertStatusHistory(
        {
          trip_id: newTrip.id,
          from_status: null,
          to_status: 'SCHEDULED',
          changed_by: input.passengerId,
          actor_type: 'passenger',
          notes: `Scheduled for ${scheduledFor.toISOString()}`,
        },
        trx,
      );

      // Create scheduled_trips record (inside trx to maintain FK consistency)
      await this.scheduledRepo.create(newTrip.id, scheduledFor, trx);

      return newTrip.id;
    });

    return { tripId, scheduledFor, estimatedFare: estimate.final_fare };
  }

  async getScheduled(passengerId: string): Promise<ScheduledTripRow[]> {
    return this.scheduledRepo.findByPassenger(passengerId);
  }

  async cancel(passengerId: string, tripId: string): Promise<void> {
    // 1. Verify trip exists and belongs to the passenger
    const trip = await this.db('trips').where({ id: tripId }).whereNull('deleted_at').first();
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
    }
    if ((trip.passenger_id as string) !== passengerId) {
      throw new BusinessError('FORBIDDEN', 'Not the passenger of this trip');
    }
    if ((trip.status as string) !== 'SCHEDULED') {
      throw new BusinessError('TRIP_NOT_SCHEDULED', 'Trip is not in SCHEDULED status');
    }

    // 2. Transition SCHEDULED → CANCELLED
    const machine = new TripStateMachine();
    if (!machine.canTransition('SCHEDULED', 'CANCELLED', 'passenger')) {
      throw new BusinessError('INVALID_TRIP_TRANSITION', 'Transition SCHEDULED→CANCELLED is not allowed');
    }

    await this.db.transaction(async (trx: Knex.Transaction) => {
      await trx('trips')
        .where({ id: tripId })
        .update({ status: 'CANCELLED', cancelled_at: new Date(), updated_at: new Date() });

      await trx('trip_status_history').insert({
        trip_id: tripId,
        from_status: 'SCHEDULED',
        to_status: 'CANCELLED',
        changed_by: passengerId,
        actor_type: 'passenger',
      });
    });
  }
}
