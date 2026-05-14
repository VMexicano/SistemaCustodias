// ---------------------------------------------------------------------------
// custody-tracking.controller.ts — thin HTTP adapter, no business logic
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CustodyTrackingService } from './custody-tracking.service.js';
import type { CreateLocationPayload, LocationHistoryQuery } from './custody-tracking.types.js';
import type { JWTPayload } from '../../shared/middleware/authenticate.js';

interface RecordLocationBody {
  order_id: string;
  lat: number;
  lng: number;
  speed_kmh?: number;
  accuracy_m?: number;
  heading?: number;
}

interface OrderIdParam {
  orderId: string;
}

interface HistoryQuerystring {
  limit?: number;
  from?: string;
  to?: string;
}

export class CustodyTrackingController {
  constructor(private readonly service: CustodyTrackingService) {}

  async recordLocation(
    request: FastifyRequest<{ Body: RecordLocationBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = (request.user as JWTPayload).sub;

    const dto: CreateLocationPayload = {
      order_id: request.body.order_id,
      lat: request.body.lat,
      lng: request.body.lng,
      speed_kmh: request.body.speed_kmh,
      accuracy_m: request.body.accuracy_m,
      heading: request.body.heading,
    };

    const result = await this.service.recordLocation(userId, dto);
    await reply.status(201).send(result);
  }

  async getCurrentLocation(
    request: FastifyRequest<{ Params: OrderIdParam }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await this.service.getCurrentLocation(request.params.orderId);
    await reply.status(200).send(result);
  }

  async getHistory(
    request: FastifyRequest<{
      Params: OrderIdParam;
      Querystring: HistoryQuerystring;
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    const query: LocationHistoryQuery = {
      limit: request.query.limit,
      from: request.query.from,
      to: request.query.to,
    };

    const result = await this.service.getHistory(request.params.orderId, query);
    await reply.status(200).send(result);
  }
}
