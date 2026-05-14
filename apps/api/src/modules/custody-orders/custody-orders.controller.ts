import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CustodyOrdersService } from './custody-orders.service.js';
import type { OrderStatus } from './custody-orders.types.js';

export class CustodyOrdersController {
  constructor(private readonly service: CustodyOrdersService) {}

  private actor(request: FastifyRequest) {
    return { userId: request.user!.sub, role: request.user!.roles[0] ?? 'unknown' };
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      clientId: string;
      custodyTypeId: string;
      pickupAddress: object;
      deliveryAddress: object;
      scheduledAt?: string;
      pickupWindowStart?: string;
      pickupWindowEnd?: string;
      notes?: string;
    };
    const order = await this.service.create({
      ...body,
      tenantId: request.user!.tenant_id!,
      pickupAddress: body.pickupAddress as any,
      deliveryAddress: body.deliveryAddress as any,
    });
    return reply.status(201).send(order);
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.user!.tenant_id!;
    const q = request.query as { status?: string; clientId?: string; page?: string; limit?: string };
    const page = Math.max(0, parseInt(q.page ?? '0', 10));
    const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '20', 10)));
    const result = await this.service.list(
      tenantId,
      { status: q.status as OrderStatus | undefined, clientId: q.clientId },
      page,
      limit,
    );
    return reply.send(result);
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const order = await this.service.getById(id);
    return reply.send(order);
  }

  async getTransitions(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const transitions = await this.service.getTransitions(id);
    return reply.send({ data: transitions });
  }

  async submit(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    return reply.send(await this.service.submit(id, this.actor(request)));
  }

  async approve(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as { notes?: string } | undefined;
    return reply.send(await this.service.approve(id, this.actor(request), { notes: body?.notes }));
  }

  async reject(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };
    return reply.send(await this.service.reject(id, this.actor(request), reason));
  }

  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as { notes?: string } | undefined;
    return reply.send(await this.service.cancel(id, this.actor(request), { notes: body?.notes }));
  }

  async assign(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { custodioId, copilotoId } = request.body as { custodioId: string; copilotoId: string };
    return reply.send(await this.service.assignCrew(id, this.actor(request), custodioId, copilotoId));
  }

  async confirmCrew(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    return reply.send(await this.service.confirmCrew(id, this.actor(request)));
  }

  async reassign(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { custodioId, copilotoId } = request.body as { custodioId: string; copilotoId: string };
    return reply.send(await this.service.reassignCrew(id, this.actor(request), custodioId, copilotoId));
  }

  async depart(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    return reply.send(await this.service.depart(id, this.actor(request)));
  }

  async arrivePickup(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    return reply.send(await this.service.arrivePickup(id, this.actor(request)));
  }

  async pickup(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { digitalSignature } = request.body as { digitalSignature: string };
    return reply.send(await this.service.pickup(id, this.actor(request), digitalSignature));
  }

  async arriveDelivery(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    return reply.send(await this.service.arriveDelivery(id, this.actor(request)));
  }

  async deliver(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { digitalSignature } = request.body as { digitalSignature: string };
    return reply.send(await this.service.deliver(id, this.actor(request), digitalSignature));
  }

  async complete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    return reply.send(await this.service.complete(id, this.actor(request)));
  }

  async reportIncident(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { description } = request.body as { description: string };
    return reply.send(await this.service.reportIncident(id, this.actor(request), description));
  }

  async resolveIncident(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { transitTo, notes } = request.body as { transitTo: 'IN_TRANSIT' | 'RESOLVED'; notes?: string };
    return reply.send(await this.service.resolveIncident(id, this.actor(request), transitTo, { notes }));
  }

  async pickupFailed(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { notes } = request.body as { notes: string };
    return reply.send(await this.service.markPickupFailed(id, this.actor(request), notes));
  }

  async deliveryFailed(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { notes } = request.body as { notes: string };
    return reply.send(await this.service.markDeliveryFailed(id, this.actor(request), notes));
  }
}
