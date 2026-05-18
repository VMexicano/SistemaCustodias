// ---------------------------------------------------------------------------
// custody-events.controller.ts — thin HTTP adapter, no business logic
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { JWTPayload } from '../../shared/middleware/authenticate.js';
import type { CustodyEventService } from './custody-events.service.js';
import type { CreateCustodyEventPayload } from './custody-events.types.js';

interface OrderIdParam {
  id: string;
}

interface GetEventsQuerystring {
  limit?: number;
  offset?: number;
  include_evidence?: boolean;
}

export class CustodyEventsController {
  constructor(private readonly service: CustodyEventService) {}

  async getCatalog(
    request: FastifyRequest<{ Params: OrderIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const catalog = await this.service.getCatalog(request.params.id);
    await reply.status(200).send({
      orderId: request.params.id,
      catalog,
    });
  }

  async createEvent(
    request: FastifyRequest<{
      Params: OrderIdParam;
      Body: CreateCustodyEventPayload;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    const actorId = (request.user as JWTPayload).sub;
    const event = await this.service.createEvent(request.params.id, actorId, request.body);
    await reply.status(201).send({
      id: event.id,
      orderId: event.orderId,
      eventType: event.eventType,
      sequenceNo: event.sequenceNo,
      createdAt: event.createdAt,
    });
  }

  async getEvents(
    request: FastifyRequest<{
      Params: OrderIdParam;
      Querystring: GetEventsQuerystring;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    const limit = Math.min(request.query.limit ?? 50, 100);
    const offset = request.query.offset ?? 0;
    const includeEvidence = request.query.include_evidence ?? false;

    const result = await this.service.getEvents(
      request.params.id,
      limit,
      offset,
      includeEvidence,
    );

    await reply.status(200).send({
      orderId: request.params.id,
      events: result.events,
      total: result.total,
      limit,
      offset,
    });
  }
}
