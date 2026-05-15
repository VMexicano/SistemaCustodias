import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CustodyRoutingService } from './custody-routing.service.js';
import type { Waypoint } from './custody-routing.types.js';

export class CustodyRoutingController {
  constructor(private readonly service: CustodyRoutingService) {}

  async planRoute(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { waypoints } = request.body as { waypoints: Waypoint[] };
    const route = await this.service.planRoute(id, waypoints);
    return reply.status(200).send(route);
  }

  async getRoute(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const route = await this.service.getRoute(id);
    return reply.send(route);
  }

  async approveRoute(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorId = request.user!.sub;
    const route = await this.service.approveRoute(id, actorId);
    return reply.send(route);
  }
}
