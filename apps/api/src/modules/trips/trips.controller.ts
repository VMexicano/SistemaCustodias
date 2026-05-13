import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TripsService } from './trips.service.js';
import type { TripStatus, TripActor } from './trips.types.js';

// ---------------------------------------------------------------------------
// Request body / param shapes
// ---------------------------------------------------------------------------

interface CreateTripBody {
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  trip_type_id: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

interface TripIdParams {
  id: string;
}

interface UpdateStatusBody {
  status: TripStatus;
  notes?: string;
}

interface CancelTripBody {
  reason?: string;
}

interface ChangeDestinationBody {
  destination: { lat: number; lng: number; address: string };
}

interface GetHistoryQuery {
  page?: number;
  limit?: number;
}

interface GetTrackQuery {
  limit?: number;
}

interface ApproveTripBody {
  assigned_driver_id?: string;
}

interface RejectTripBody {
  reason: string;
}

// ---------------------------------------------------------------------------
// TripsController
// ---------------------------------------------------------------------------

export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  // POST /trips
  async create(
    request: FastifyRequest<{ Body: CreateTripBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const passengerId = request.user!.sub;
    const { origin, destination, trip_type_id, notes, metadata } = request.body;

    const result = await this.tripsService.createTrip(passengerId, {
      origin,
      destination,
      trip_type_id,
      notes,
      metadata,
    });

    await reply.status(201).send(result);
  }

  // PATCH /trips/:id/accept
  async accept(
    request: FastifyRequest<{ Params: TripIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const driverId = request.user!.sub;
    const { id } = request.params;

    const result = await this.tripsService.acceptTrip(id, driverId);

    await reply.status(200).send(result);
  }

  // PATCH /trips/:id/status
  async updateStatus(
    request: FastifyRequest<{ Params: TripIdParams; Body: UpdateStatusBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const driverId = request.user!.sub;
    const { id } = request.params;
    const { status, notes } = request.body;

    const result = await this.tripsService.updateStatus(id, driverId, status, notes);

    await reply.status(200).send(result);
  }

  // PATCH /trips/:id/cancel
  async cancel(
    request: FastifyRequest<{ Params: TripIdParams; Body: CancelTripBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = request.user!.sub;
    const roles = request.user!.roles;
    const { id } = request.params;
    const { reason } = request.body ?? {};

    // Determine actor type from JWT roles
    const actorType: TripActor = roles.includes('driver') ? 'driver' : 'passenger';

    const { trip, cancellationFee } = await this.tripsService.cancelTrip(
      id,
      actorId,
      actorType,
      reason,
    );

    await reply.status(200).send({
      id: trip.id,
      status: trip.status,
      cancellation_fee: cancellationFee,
      cancelled_at: trip.cancelled_at!.toISOString(),
    });
  }

  // PATCH /trips/:id/destination
  async changeDestination(
    request: FastifyRequest<{ Params: TripIdParams; Body: ChangeDestinationBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const passengerId = request.user!.sub;
    const { id } = request.params;
    const { destination } = request.body;

    const result = await this.tripsService.changeDestination(id, passengerId, destination);

    await reply.status(200).send({
      trip_id: result.tripId,
      new_destination: result.newDestination,
      new_estimated_fare: result.newEstimatedFare,
      delta_km: result.deltaKm,
      currency: result.currency,
    });
  }

  // GET /trips/:id
  async getById(
    request: FastifyRequest<{ Params: TripIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const requesterId = request.user!.sub;
    const roles = request.user!.roles;
    const requesterRole = roles.includes('admin') ? 'admin' : roles[0] ?? 'passenger';
    const { id } = request.params;

    const trip = await this.tripsService.getTripById(id, requesterId, requesterRole);

    await reply.status(200).send(trip);
  }

  // GET /trips/active
  async getActive(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const passengerId = request.user!.sub;
    const trip = await this.tripsService.getActiveTrip(passengerId);
    await reply.status(200).send(trip ?? null);
  }

  // GET /trips/driver/active
  async getActiveForDriver(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user!.sub;
    const trip = await this.tripsService.getActiveTripForDriver(userId);
    await reply.status(200).send(trip ?? null);
  }

  // GET /trips
  async getHistory(
    request: FastifyRequest<{ Querystring: GetHistoryQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const passengerId = request.user!.sub;
    const page = Number(request.query.page ?? 1);
    const rawLimit = Number(request.query.limit ?? 20);
    const limit = Math.min(rawLimit, 50);

    const result = await this.tripsService.getTripHistory(passengerId, page, limit);

    await reply.status(200).send(result);
  }

  // POST /trips/:id/approve
  async approve(
    request: FastifyRequest<{ Params: TripIdParams; Body: ApproveTripBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const dispatcherUserId = request.user!.sub;
    const { id } = request.params;
    const { assigned_driver_id } = request.body ?? {};

    const result = await this.tripsService.approveTrip(id, dispatcherUserId, assigned_driver_id);

    await reply.status(200).send(result);
  }

  // POST /trips/:id/reject
  async reject(
    request: FastifyRequest<{ Params: TripIdParams; Body: RejectTripBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const dispatcherUserId = request.user!.sub;
    const { id } = request.params;
    const { reason } = request.body;

    const result = await this.tripsService.rejectTrip(id, dispatcherUserId, reason);

    await reply.status(200).send(result);
  }

  // GET /trips/:id/track
  async getTrack(
    request: FastifyRequest<{ Params: TripIdParams; Querystring: GetTrackQuery }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { id } = request.params;
    const userId = request.user!.sub;
    const userRole = request.user!.roles[0] ?? 'passenger';

    const result = await this.tripsService.getTripTrack(id, userId, userRole);
    await reply.status(200).send(result);
  }
}
