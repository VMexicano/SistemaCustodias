import type { Knex } from 'knex';
import type { Database } from '../../config/database.js';
import { env } from '../../config/environment.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { DriversRepository } from '../drivers/drivers.repository.js';
import type { PricingEngine } from '../pricing/pricing-engine.js';
import type { PricingService } from '../pricing/pricing.service.js';
import type { LatLng, PricingSnapshot } from '../pricing/pricing.types.js';
import type { TripStateMachine } from './trip-state-machine.js';
import type { TripsRepository } from './trips.repository.js';
import type { Trip, TripActor, TripStatus } from './trips.types.js';
import { tripsQueue } from './trips.queue.js';
import { paymentQueue } from '../payments/payment.queue.js';
import { notificationQueue } from '../notifications/notification.queue.js';
import { emitTripStatusChanged, emitTripRequested } from '../realtime/realtime.events.js';
import { getIO } from '../realtime/realtime.plugin.js';
import type { TrackingService, LocationPoint } from '../tracking/tracking.service.js';
import type { VerticalsService } from '../verticals/verticals.service.js';

// ---------------------------------------------------------------------------
// DTOs / input shapes
// ---------------------------------------------------------------------------

export interface CreateTripDto {
  origin: LatLng & { address: string };
  destination: LatLng & { address: string };
  trip_type_id: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateStatusDto {
  status: TripStatus;
  notes?: string;
}

export interface ChangeDestinationDto {
  destination: LatLng & { address: string };
}

// ---------------------------------------------------------------------------
// TripsService
// ---------------------------------------------------------------------------

export class TripsService {
  private readonly searchingTimeoutMs = env.TRIP_SEARCHING_TIMEOUT_MS;
  private verticalService: VerticalsService | undefined;

  constructor(
    private readonly tripsRepo: TripsRepository,
    private readonly pricingService: PricingService,
    private readonly pricingEngine: PricingEngine,
    private readonly tripStateMachine: TripStateMachine,
    private readonly db: Database,
    private readonly driversRepo: DriversRepository,
    private readonly trackingService?: TrackingService,
    initialVerticalService?: VerticalsService,
  ) {
    this.verticalService = initialVerticalService;
  }

  /** Allow late-binding of VerticalsService to avoid circular construction order in app.ts */
  setVerticalService(service: VerticalsService): void {
    this.verticalService = service;
  }

  // --------------------------------------------------------------------------
  // GET /trips/:id/track
  // --------------------------------------------------------------------------

  async getTripTrack(
    tripId: string,
    userId: string,
    userRole: string,
  ): Promise<{ locations: LocationPoint[]; count: number }> {
    const trip = await this.tripsRepo.findById(tripId);
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', 'Trip not found');
    }

    if (userRole === 'admin') {
      // admin can see any trip
    } else if (userRole === 'passenger') {
      if (trip.passenger_id !== userId) {
        throw new BusinessError('FORBIDDEN', 'You do not have access to this trip');
      }
    } else if (userRole === 'driver') {
      const driver = await this.driversRepo.findByUserId(userId);
      if (!driver || trip.driver_id !== driver.id) {
        throw new BusinessError('FORBIDDEN', 'You do not have access to this trip');
      }
    }

    if (!this.trackingService) {
      return { locations: [], count: 0 };
    }

    const locations = await this.trackingService.getTripLocations(tripId);
    return { locations, count: locations.length };
  }

  // --------------------------------------------------------------------------
  // POST /trips
  // --------------------------------------------------------------------------

  async createTrip(
    passengerId: string,
    dto: CreateTripDto,
  ): Promise<{
    id: string;
    status: TripStatus;
    estimated_fare: number;
    currency: 'MXN';
    created_at: string;
  }> {
    // R-TRIP-001: passenger cannot have two active trips
    const existingActive = await this.tripsRepo.findActiveByPassengerId(passengerId);
    if (existingActive) {
      throw new BusinessError('PASSENGER_HAS_ACTIVE_TRIP', 'Passenger already has an active trip');
    }

    // Delegate to PricingService for estimate (includes validation: same origin/dest, distance, trip type)
    const estimate = await this.pricingService.estimate({
      origin: dto.origin,
      destination: dto.destination,
      trip_type_id: dto.trip_type_id,
    });

    // Determine initial status based on vertical config (ADR-047)
    let requiresApproval = false;
    if (this.verticalService) {
      const config = await this.verticalService.getConfig();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      requiresApproval = (config.features as any)?.requiresApproval === true;
    }
    const initialStatus: TripStatus = requiresApproval ? 'PENDING_APPROVAL' : 'SEARCHING';

    const trip = await this.db.transaction(async (trx: Knex.Transaction) => {
      // Create in REQUESTED state with pricing_snapshot (written once — ADR-009)
      const newTrip = await this.tripsRepo.create(
        {
          region_id: estimate.pricing_snapshot.region_id,
          passenger_id: passengerId,
          trip_type_id: dto.trip_type_id,
          status: 'REQUESTED',
          origin_lat: dto.origin.lat,
          origin_lng: dto.origin.lng,
          origin_address: dto.origin.address,
          destination_lat: dto.destination.lat,
          destination_lng: dto.destination.lng,
          destination_address: dto.destination.address,
          estimated_distance_km: estimate.estimated_distance_km,
          estimated_duration_min: estimate.estimated_duration_min,
          estimated_fare: estimate.final_fare,
          pricing_snapshot: estimate.pricing_snapshot,
          metadata: dto.metadata ?? {},
        },
        trx,
      );

      // Transition REQUESTED → PENDING_APPROVAL or REQUESTED → SEARCHING
      await this.tripStateMachine.transition({
        trip: newTrip,
        toStatus: initialStatus,
        actor: 'system',
        actorId: null,
        trx,
        notes: requiresApproval
          ? 'Trip created — pending dispatcher approval'
          : 'Trip created — searching for driver',
      });

      // Update status in DB
      const updatedTrip = await this.tripsRepo.update(
        newTrip.id,
        { status: initialStatus },
        trx,
      );

      return updatedTrip;
    });

    // Enqueue searching-timeout OUTSIDE the transaction only when searching immediately (ADR-005)
    if (!requiresApproval) {
      await tripsQueue.enqueueSearchingTimeout(trip.id, this.searchingTimeoutMs);
    }

    // Broadcast new trip to all online drivers (only when immediately searching)
    if (!requiresApproval) {
      try {
        const io = getIO();
        emitTripRequested(io, trip.id, {
          id: trip.id,
          originAddress: trip.origin_address,
          destinationAddress: trip.destination_address,
          estimatedDistanceKm: trip.estimated_distance_km ?? 0,
          estimatedTotal: trip.estimated_fare ?? 0,
          passengerId: trip.passenger_id,
          originLat: trip.origin_lat,
          originLng: trip.origin_lng,
          destinationLat: trip.destination_lat,
          destinationLng: trip.destination_lng,
        });
      } catch {
        // Socket.io not initialized (tests) — skip silently
      }
    }

    return {
      id: trip.id,
      status: trip.status,
      estimated_fare: trip.estimated_fare!,
      currency: 'MXN',
      created_at: trip.created_at.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Internal: resolve driver profile ID from user ID
  // --------------------------------------------------------------------------

  private async resolveDriverId(userId: string): Promise<string> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', `No driver profile for user ${userId}`);
    }
    if (driver.status !== 'approved') {
      throw new BusinessError('DRIVER_NOT_APPROVED', 'Driver must be approved to accept trips');
    }
    return driver.id;
  }

  // --------------------------------------------------------------------------
  // PATCH /trips/:id/accept
  // --------------------------------------------------------------------------

  async acceptTrip(
    tripId: string,
    userIdFromJwt: string,
  ): Promise<{ id: string; status: TripStatus; accepted_at: string }> {
    // Resolve driver profile ID from JWT user ID
    const driverId = await this.resolveDriverId(userIdFromJwt);

    // R-TRIP-002: trip stacking — máximo 2 viajes, segundo solo si el actual está IN_PROGRESS con ≤10 min restantes
    const activeTrips = await this.tripsRepo.findAllActiveByDriverId(driverId);
    if (activeTrips.length >= 2) {
      throw new BusinessError('DRIVER_TRIP_QUEUE_FULL', 'Driver already has 2 trips in queue');
    }
    if (activeTrips.length === 1) {
      const current = activeTrips[0]!;
      if (current.status !== 'IN_PROGRESS') {
        throw new BusinessError('DRIVER_HAS_ACTIVE_TRIP', 'Driver already has an active trip');
      }
      const startedAt = current.started_at ? new Date(current.started_at).getTime() : null;
      const estimatedMs = (current.estimated_duration_min ?? 30) * 60 * 1000;
      const remainingMs = startedAt ? (startedAt + estimatedMs) - Date.now() : Infinity;
      if (remainingMs > 10 * 60 * 1000) {
        const remainingMin = Math.ceil(remainingMs / 60000);
        throw new BusinessError('DRIVER_NOT_NEAR_COMPLETION', `Current trip has ~${remainingMin} min remaining. Trip stacking allowed only within 10 min of completion`);
      }
    }

    const trip = await this.db.transaction(async (trx: Knex.Transaction) => {
      // SELECT FOR UPDATE (R-TRIP-004)
      const locked = await this.tripsRepo.findByIdForUpdate(tripId, trx);
      if (!locked) {
        throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
      }

      if (locked.status !== 'SEARCHING') {
        throw new BusinessError('TRIP_NOT_IN_SEARCHING', 'Trip is not in SEARCHING status');
      }

      const now = new Date();

      // Transition SEARCHING → ACCEPTED
      // actorId must be a users.id (FK constraint on trip_status_history.changed_by)
      await this.tripStateMachine.transition({
        trip: locked,
        toStatus: 'ACCEPTED',
        actor: 'driver',
        actorId: userIdFromJwt,
        trx,
        notes: `Driver ${driverId} accepted`,
      });

      return await this.tripsRepo.update(
        tripId,
        {
          status: 'ACCEPTED',
          driver_id: driverId,
          accepted_at: now,
        },
        trx,
      );
    });

    // Cancel the searching-timeout job — trip was accepted
    tripsQueue.cancelSearchingTimeout(tripId);

    // Notify driver if this is a scheduled trip (side effect OUTSIDE transaction — ADR-005)
    const scheduledTrip = await this.db('scheduled_trips')
      .where({ trip_id: tripId })
      .first();

    if (scheduledTrip) {
      const scheduledFor: Date = scheduledTrip.scheduled_for;
      const driver = await this.driversRepo.findById(driverId);
      if (driver) {
        await notificationQueue.enqueue({
          recipientUserId: driver.user_id,
          type: 'trip_scheduled_accepted',
          tripId,
          scheduledFor: scheduledFor.toISOString(),
        });
      }
    }

    return {
      id: trip.id,
      status: trip.status,
      accepted_at: trip.accepted_at!.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // PATCH /trips/:id/status
  // --------------------------------------------------------------------------

  async updateStatus(
    tripId: string,
    userIdFromJwt: string,
    toStatus: TripStatus,
    notes?: string,
  ): Promise<{ id: string; status: TripStatus; updated_at: string; final_fare?: number }> {
    // Resolve driver profile ID (also validates approved status)
    const driver = await this.driversRepo.findByUserId(userIdFromJwt);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', `No driver profile for user ${userIdFromJwt}`);
    }
    const driverId = driver.id;

    const trip = await this.db.transaction(async (trx: Knex.Transaction) => {
      // SELECT FOR UPDATE
      const locked = await this.tripsRepo.findByIdForUpdate(tripId, trx);
      if (!locked) {
        throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
      }

      // Transition via state machine (validates actor & route)
      // actorId must be users.id (FK constraint on trip_status_history.changed_by)
      await this.tripStateMachine.transition({
        trip: locked,
        toStatus,
        actor: 'driver',
        actorId: userIdFromJwt,
        trx,
        notes,
      });

      const updateData: Partial<Trip> = { status: toStatus };

      if (toStatus === 'IN_PROGRESS') {
        updateData.started_at = new Date();
      }

      if (toStatus === 'COMPLETED') {
        const now = new Date();
        updateData.completed_at = now;

        // Calculate final_fare using PricingEngine.recalculate() with the
        // immutable snapshot. Use haversine distance for actual_distance_km.
        const snapshot = locked.pricing_snapshot as PricingSnapshot;
        const actualDistanceKm = this.pricingEngine.calculateDistanceKm(
          { lat: locked.origin_lat, lng: locked.origin_lng },
          { lat: locked.destination_lat, lng: locked.destination_lng },
        );
        const actualDurationMin = (actualDistanceKm / 30) * 60;

        const recalc = this.pricingEngine.recalculate({
          newDestination: { lat: locked.destination_lat, lng: locked.destination_lng },
          currentOrigin: { lat: locked.origin_lat, lng: locked.origin_lng },
          snapshot,
          regionTaxPct: snapshot.tax_pct,
        });

        updateData.actual_distance_km = actualDistanceKm;
        updateData.actual_duration_min = actualDurationMin;
        updateData.final_fare = recalc.final_fare;
      }

      return await this.tripsRepo.update(tripId, updateData, trx);
    });

    // Side effects OUTSIDE transaction (ADR-005)
    if (toStatus === 'COMPLETED') {
      // Enqueue payment job (async — passenger gets charged via BullMQ worker)
      await paymentQueue.enqueue({ tripId, passengerId: trip.passenger_id });

      // Enqueue trip_completed notification to both actors
      await notificationQueue.enqueue({
        recipientUserId: trip.passenger_id,
        type: 'trip_completed',
        tripId,
        finalFare: trip.final_fare != null ? String(trip.final_fare) : undefined,
      });

      if (trip.driver_id) {
        await notificationQueue.enqueue({
          recipientUserId: userIdFromJwt,
          type: 'trip_completed',
          tripId,
        });
      }
    }

    // Emit WebSocket status change to trip room (passenger + driver)
    try {
      const io = getIO();
      emitTripStatusChanged(io, tripId, toStatus);
    } catch {
      // Socket.io not initialized (tests) — skip silently
    }

    const result: { id: string; status: TripStatus; updated_at: string; final_fare?: number } = {
      id: trip.id,
      status: trip.status,
      updated_at: trip.updated_at.toISOString(),
    };

    if (toStatus === 'COMPLETED' && trip.final_fare !== null) {
      result.final_fare = trip.final_fare;
    }

    return result;
  }

  // --------------------------------------------------------------------------
  // PATCH /trips/:id/cancel
  // --------------------------------------------------------------------------

  async cancelTrip(
    tripId: string,
    userIdFromJwt: string,
    actorType: TripActor,
    reason?: string,
  ): Promise<{ trip: Trip; cancellationFee: number }> {
    // For driver actor, resolve driver profile ID
    let resolvedActorId = userIdFromJwt;
    if (actorType === 'driver') {
      const driver = await this.driversRepo.findByUserId(userIdFromJwt);
      if (!driver) {
        throw new BusinessError('DRIVER_NOT_FOUND', `No driver profile for user ${userIdFromJwt}`);
      }
      resolvedActorId = driver.id;
    }

    const { trip, cancellationFee } = await this.db.transaction(async (trx: Knex.Transaction) => {
      // SELECT FOR UPDATE
      const locked = await this.tripsRepo.findByIdForUpdate(tripId, trx);
      if (!locked) {
        throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
      }

      // Validate actor ownership
      if (actorType === 'passenger' && locked.passenger_id !== userIdFromJwt) {
        throw new BusinessError('FORBIDDEN', 'Not the passenger of this trip');
      }
      if (actorType === 'driver' && locked.driver_id !== resolvedActorId) {
        throw new BusinessError('FORBIDDEN', 'Not the driver of this trip');
      }

      // State machine validates transition; if trip is already in a terminal state,
      // translate INVALID_TRIP_TRANSITION → TRIP_CANNOT_BE_CANCELLED
      let result;
      try {
        // actorId must be users.id (FK constraint on trip_status_history.changed_by)
        result = await this.tripStateMachine.transition({
          trip: locked,
          toStatus: 'CANCELLED',
          actor: actorType,
          actorId: userIdFromJwt,
          trx,
          notes: reason,
        });
      } catch (err) {
        if (
          err instanceof BusinessError &&
          err.code === 'INVALID_TRIP_TRANSITION' &&
          (locked.status === 'COMPLETED' || locked.status === 'CANCELLED')
        ) {
          throw new BusinessError('TRIP_CANNOT_BE_CANCELLED', `Trip is already in state ${locked.status}`);
        }
        throw err;
      }

      const updatedTrip = await this.tripsRepo.update(
        tripId,
        {
          status: 'CANCELLED',
          cancelled_at: new Date(),
          cancellation_reason: reason,
        },
        trx,
      );

      return { trip: updatedTrip, cancellationFee: result.cancellationFee };
    });

    // Cancel any searching timeout if applicable
    tripsQueue.cancelSearchingTimeout(tripId);

    return { trip, cancellationFee };
  }

  // --------------------------------------------------------------------------
  // PATCH /trips/:id/destination
  // --------------------------------------------------------------------------

  async changeDestination(
    tripId: string,
    passengerId: string,
    newDestination: LatLng & { address: string },
  ): Promise<{
    tripId: string;
    newDestination: LatLng & { address: string };
    newEstimatedFare: number;
    deltaKm: number;
    currency: 'MXN';
  }> {
    const trip = await this.tripsRepo.findById(tripId);
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
    }

    if (trip.status !== 'IN_PROGRESS') {
      throw new BusinessError('TRIP_NOT_IN_PROGRESS', 'Trip must be IN_PROGRESS to change destination');
    }

    if (trip.passenger_id !== passengerId) {
      throw new BusinessError('ONLY_PASSENGER_CAN_CHANGE_DESTINATION', 'Only the trip passenger can change the destination');
    }

    const snapshot = trip.pricing_snapshot as PricingSnapshot;

    const originalDistanceKm = this.pricingEngine.calculateDistanceKm(
      { lat: trip.origin_lat, lng: trip.origin_lng },
      { lat: trip.destination_lat, lng: trip.destination_lng },
    );

    const recalc = this.pricingEngine.recalculate({
      newDestination,
      currentOrigin: { lat: trip.origin_lat, lng: trip.origin_lng },
      snapshot,
      regionTaxPct: snapshot.tax_pct,
    });

    const deltaKm = recalc.estimated_distance_km - originalDistanceKm;

    await this.db.transaction(async (trx: Knex.Transaction) => {
      await this.tripsRepo.update(
        tripId,
        {
          destination_lat: newDestination.lat,
          destination_lng: newDestination.lng,
          destination_address: newDestination.address,
        },
        trx,
      );
    });

    return {
      tripId: trip.id,
      newDestination,
      newEstimatedFare: recalc.final_fare,
      deltaKm,
      currency: 'MXN',
    };
  }

  // --------------------------------------------------------------------------
  // GET /trips/:id
  // --------------------------------------------------------------------------

  async getTripById(
    tripId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<Trip & { status_history: unknown[] }> {
    const trip = await this.tripsRepo.findById(tripId);
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
    }

    const isAdmin = requesterRole === 'admin';
    const isPassenger = trip.passenger_id === requesterId;
    const isDriver = trip.driver_id !== null && trip.driver_id === requesterId;

    if (!isAdmin && !isPassenger && !isDriver) {
      throw new BusinessError('FORBIDDEN', 'Not authorized to view this trip');
    }

    const history = await this.tripsRepo.findStatusHistory(tripId);

    return { ...trip, status_history: history };
  }

  // --------------------------------------------------------------------------
  // GET /trips/active
  // --------------------------------------------------------------------------

  async getActiveTrip(passengerId: string): Promise<Trip | null> {
    return this.tripsRepo.findActiveByPassengerId(passengerId);
  }

  async getActiveTripForDriver(userId: string): Promise<Trip | null> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) return null;
    return this.tripsRepo.findActiveByDriverId(driver.id);
  }

  // --------------------------------------------------------------------------
  // GET /admin/trips/pending-approval
  // --------------------------------------------------------------------------

  async getPendingApproval(
    limit: number,
    offset: number,
  ): Promise<{ data: import('./trips.repository.js').TripWithWait[]; total: number }> {
    return this.tripsRepo.findPendingApproval(limit, offset);
  }

  // --------------------------------------------------------------------------
  // GET /trips
  // --------------------------------------------------------------------------

  async getTripHistory(
    passengerId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Trip[]; total: number; page: number }> {
    const { data, total } = await this.tripsRepo.findByPassengerId(passengerId, page, limit);
    return { data, total, page };
  }

  // --------------------------------------------------------------------------
  // Internal: searching-timeout handler (called by worker)
  // --------------------------------------------------------------------------

  async handleSearchingTimeout(tripId: string): Promise<void> {
    const trip = await this.tripsRepo.findById(tripId);
    if (!trip || trip.status !== 'SEARCHING') {
      // Already transitioned — nothing to do
      return;
    }

    await this.db.transaction(async (trx: Knex.Transaction) => {
      const locked = await this.tripsRepo.findByIdForUpdate(tripId, trx);
      if (!locked || locked.status !== 'SEARCHING') {
        return;
      }

      await this.tripStateMachine.transition({
        trip: locked,
        toStatus: 'CANCELLED',
        actor: 'system',
        actorId: null,
        trx,
        notes: `No driver found within ${this.searchingTimeoutMs}ms - auto-cancelled`,
      });

      await this.tripsRepo.update(
        tripId,
        {
          status: 'CANCELLED',
          cancelled_at: new Date(),
          cancellation_reason: 'No driver accepted the trip in time',
        },
        trx,
      );
    });

    // Notify passenger clients subscribed to this trip room.
    try {
      const io = getIO();
      emitTripStatusChanged(io, tripId, 'CANCELLED');
    } catch {
      // Realtime delivery should not fail the timeout worker.
    }
  }

  // --------------------------------------------------------------------------
  // POST /trips/:id/approve  (dispatcher / admin)
  // --------------------------------------------------------------------------

  async approveTrip(
    tripId: string,
    dispatcherUserId: string,
    assignedDriverId?: string,
  ): Promise<{ id: string; status: TripStatus; approved_at: string; approved_by: string }> {
    // If assignedDriverId provided, verify driver exists and is online
    if (assignedDriverId) {
      const driver = await this.driversRepo.findById(assignedDriverId);
      if (!driver) {
        throw new BusinessError('DRIVER_NOT_FOUND', `Driver ${assignedDriverId} not found`);
      }
      if (!driver.online || driver.status !== 'approved') {
        throw new BusinessError('DRIVER_NOT_AVAILABLE', `Driver ${assignedDriverId} is not available`);
      }
    }

    const now = new Date();

    const trip = await this.db.transaction(async (trx: Knex.Transaction) => {
      const locked = await this.tripsRepo.findByIdForUpdate(tripId, trx);
      if (!locked) {
        throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
      }
      if (locked.status !== 'PENDING_APPROVAL') {
        throw new BusinessError('INVALID_TRIP_TRANSITION', `Trip is not in PENDING_APPROVAL status (current: ${locked.status})`);
      }

      if (assignedDriverId) {
        // Dispatcher assigns a driver directly → PENDING_APPROVAL → ACCEPTED
        // actorId: null because admin_users.id is not in users table (FK on changed_by → users.id)
        await this.tripStateMachine.transition({
          trip: locked,
          toStatus: 'APPROVED',
          actor: 'dispatcher',
          actorId: null,
          trx,
          notes: `Dispatcher ${dispatcherUserId} approved and assigned driver ${assignedDriverId}`,
        });
        const approvedTrip = { ...locked, status: 'APPROVED' as TripStatus };
        await this.tripStateMachine.transition({
          trip: approvedTrip,
          toStatus: 'SEARCHING',
          actor: 'system',
          actorId: null,
          trx,
          notes: 'Auto-promoted from APPROVED to SEARCHING for driver assignment',
        });
        const searchingTrip = { ...approvedTrip, status: 'SEARCHING' as TripStatus };
        await this.tripStateMachine.transition({
          trip: searchingTrip,
          toStatus: 'ACCEPTED',
          actor: 'driver',
          actorId: null,
          trx,
          notes: `Driver ${assignedDriverId} assigned by dispatcher ${dispatcherUserId}`,
        });

        return await this.tripsRepo.update(
          tripId,
          {
            status: 'ACCEPTED',
            driver_id: assignedDriverId,
            accepted_at: now,
            approved_at: now,
            approved_by: dispatcherUserId,
          },
          trx,
        );
      } else {
        // No driver assigned → PENDING_APPROVAL → APPROVED, then BullMQ promotes to SEARCHING
        // actorId: null because admin_users.id is not in users table (FK on changed_by → users.id)
        await this.tripStateMachine.transition({
          trip: locked,
          toStatus: 'APPROVED',
          actor: 'dispatcher',
          actorId: null,
          trx,
          notes: `Dispatcher ${dispatcherUserId} approved — queued for driver search`,
        });

        return await this.tripsRepo.update(
          tripId,
          {
            status: 'APPROVED',
            approved_at: now,
            approved_by: dispatcherUserId,
          },
          trx,
        );
      }
    });

    // Enqueue BullMQ job to promote APPROVED → SEARCHING (only when no direct driver assignment)
    if (!assignedDriverId) {
      await tripsQueue.enqueuePromoteApproved(tripId);
    }

    // Emit realtime status update
    try {
      const io = getIO();
      emitTripStatusChanged(io, tripId, trip.status);
    } catch {
      // Silently ignore if socket.io not available
    }

    return {
      id: trip.id,
      status: trip.status,
      approved_at: trip.approved_at!.toISOString(),
      approved_by: trip.approved_by!,
    };
  }

  // --------------------------------------------------------------------------
  // POST /trips/:id/reject  (dispatcher / admin)
  // --------------------------------------------------------------------------

  async rejectTrip(
    tripId: string,
    dispatcherUserId: string,
    reason: string,
  ): Promise<{ id: string; status: TripStatus; cancellation_reason: string; cancelled_at: string }> {
    if (!reason || reason.trim().length === 0) {
      throw new BusinessError('VALIDATION_ERROR', 'reason is required and cannot be empty');
    }

    const trip = await this.db.transaction(async (trx: Knex.Transaction) => {
      const locked = await this.tripsRepo.findByIdForUpdate(tripId, trx);
      if (!locked) {
        throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
      }
      if (locked.status !== 'PENDING_APPROVAL') {
        throw new BusinessError('INVALID_TRIP_TRANSITION', `Trip is not in PENDING_APPROVAL status (current: ${locked.status})`);
      }

      // actorId: null because admin_users.id is not in users table (FK on changed_by → users.id)
      await this.tripStateMachine.transition({
        trip: locked,
        toStatus: 'CANCELLED',
        actor: 'dispatcher',
        actorId: null,
        trx,
        notes: `[dispatcher:${dispatcherUserId}] ${reason}`,
      });

      return await this.tripsRepo.update(
        tripId,
        {
          status: 'CANCELLED',
          cancelled_at: new Date(),
          cancellation_reason: reason,
        },
        trx,
      );
    });

    // Emit realtime update
    try {
      const io = getIO();
      emitTripStatusChanged(io, tripId, 'CANCELLED');
    } catch {
      // Silently ignore
    }

    return {
      id: trip.id,
      status: trip.status,
      cancellation_reason: trip.cancellation_reason!,
      cancelled_at: trip.cancelled_at!.toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Handler for BullMQ job 'trip.promote-approved'
  // --------------------------------------------------------------------------

  async handlePromoteApproved(tripId: string): Promise<void> {
    const trip = await this.tripsRepo.findById(tripId);
    if (!trip || trip.status !== 'APPROVED') {
      // Idempotent — already promoted or cancelled
      return;
    }

    await this.db.transaction(async (trx: Knex.Transaction) => {
      const locked = await this.tripsRepo.findByIdForUpdate(tripId, trx);
      if (!locked || locked.status !== 'APPROVED') {
        return;
      }

      await this.tripStateMachine.transition({
        trip: locked,
        toStatus: 'SEARCHING',
        actor: 'system',
        actorId: null,
        trx,
        notes: 'Auto-promoted from APPROVED to SEARCHING',
      });

      await this.tripsRepo.update(tripId, { status: 'SEARCHING' }, trx);
    });

    // Enqueue searching-timeout now that it's in SEARCHING
    await tripsQueue.enqueueSearchingTimeout(tripId, this.searchingTimeoutMs);

    // Broadcast to drivers
    try {
      const io = getIO();
      const updatedTrip = await this.tripsRepo.findById(tripId);
      if (io && updatedTrip) {
        emitTripRequested(io, tripId, {
          id: updatedTrip.id,
          originAddress: updatedTrip.origin_address,
          destinationAddress: updatedTrip.destination_address,
          estimatedDistanceKm: updatedTrip.estimated_distance_km ?? 0,
          estimatedTotal: updatedTrip.estimated_fare ?? 0,
          passengerId: updatedTrip.passenger_id,
          originLat: updatedTrip.origin_lat,
          originLng: updatedTrip.origin_lng,
          destinationLat: updatedTrip.destination_lat,
          destinationLng: updatedTrip.destination_lng,
        });
      }
    } catch {
      // Silently ignore
    }
  }
}
