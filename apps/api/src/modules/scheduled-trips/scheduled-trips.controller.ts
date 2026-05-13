import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ScheduledTripsService } from './scheduled-trips.service.js';

// ---------------------------------------------------------------------------
// Request shapes
// ---------------------------------------------------------------------------

interface ScheduleTripBody {
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  tripTypeId: string;
  scheduledFor: string; // ISO 8601
}

interface TripIdParams {
  tripId: string;
}

// ---------------------------------------------------------------------------
// ScheduledTripsController
// ---------------------------------------------------------------------------

export class ScheduledTripsController {
  constructor(private readonly scheduledTripsService: ScheduledTripsService) {}

  // POST /trips/schedule
  async schedule(
    request: FastifyRequest<{ Body: ScheduleTripBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const passengerId = request.user!.sub;
    const { origin, destination, tripTypeId, scheduledFor } = request.body;

    const result = await this.scheduledTripsService.schedule({
      passengerId,
      origin,
      destination,
      tripTypeId,
      scheduledFor,
    });

    await reply.status(201).send({
      trip_id: result.tripId,
      scheduled_for: result.scheduledFor.toISOString(),
      estimated_fare: result.estimatedFare,
      currency: 'MXN',
    });
  }

  // GET /trips/scheduled
  async getScheduled(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const passengerId = request.user!.sub;
    const trips = await this.scheduledTripsService.getScheduled(passengerId);
    await reply.status(200).send({ data: trips });
  }

  // DELETE /trips/scheduled/:tripId
  async cancel(
    request: FastifyRequest<{ Params: TripIdParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const passengerId = request.user!.sub;
    const { tripId } = request.params;

    await this.scheduledTripsService.cancel(passengerId, tripId);

    await reply.status(204).send();
  }
}
