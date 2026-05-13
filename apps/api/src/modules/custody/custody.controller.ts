import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CustodyService } from './custody.service.js';

// ---------------------------------------------------------------------------
// Param / Body interfaces
// ---------------------------------------------------------------------------

interface CustodyParams {
  id: string; // trip id
}

interface CreateCustodyBody {
  event_type: 'pick_up' | 'handoff' | 'delivery';
  signature_url?: string;
  photo_url?: string;
  declared_value?: number;
  notes?: string;
  lat?: number;
  lng?: number;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class CustodyController {
  constructor(private readonly custodyService: CustodyService) {}

  async createEvent(
    request: FastifyRequest<{ Params: CustodyParams; Body: CreateCustodyBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const event = await this.custodyService.createEvent({
      tripId: request.params.id,
      eventType: request.body.event_type,
      actorUserId: request.user!.sub,
      signatureUrl: request.body.signature_url,
      photoUrl: request.body.photo_url,
      declaredValue: request.body.declared_value,
      notes: request.body.notes,
      lat: request.body.lat,
      lng: request.body.lng,
    });
    await reply.status(201).send({ success: true, data: event });
  }

  async getEvents(
    request: FastifyRequest<{ Params: CustodyParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const events = await this.custodyService.getEventsByTrip({
      tripId: request.params.id,
      requestingUserId: request.user!.sub,
      requestingUserRoles: request.user!.roles,
    });
    await reply.status(200).send({ success: true, data: events });
  }
}
