import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Queue } from 'bullmq';
import type { CustodyOrdersService } from './custody-orders.service.js';
import type { OrderStatus } from './custody-orders.types.js';
import type { CustodyNotificationJobData } from '../custody-notifications/custody-notifications.types.js';
import type { CustodyPaymentJobData } from '../custody-payments/custody-payments.types.js';

export class CustodyOrdersController {
  constructor(
    private readonly service: CustodyOrdersService,
    private readonly notificationsQueue?: Queue<CustodyNotificationJobData>,
    private readonly paymentsQueue?: Queue<CustodyPaymentJobData>,
  ) {}

  private actor(request: FastifyRequest) {
    return { userId: request.user!.sub, role: request.user!.roles[0] ?? 'unknown' };
  }

  private enqueueTransitionNotification(
    request: FastifyRequest,
    result: { id: string; status: string; clientId?: string | null; custodioId?: string | null; copilotoId?: string | null },
  ): void {
    if (!this.notificationsQueue) return;
    this.notificationsQueue
      .add('notification', {
        type: 'order-transition',
        payload: {
          order_id: result.id,
          to_status: result.status,
          client_id: result.clientId ?? null,
          custodio_id: result.custodioId ?? null,
          copiloto_id: result.copilotoId ?? null,
          tenant_id: request.user!.tenant_id ?? 'default',
        },
      })
      .catch(() => { /* non-fatal */ });
  }

  async getMyOrders(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user!.sub;
    const tenantId = request.user!.tenant_id!;
    const orders = await this.service.getMyOrders(userId, tenantId);
    return reply.send({ data: orders });
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
    const result = await this.service.submit(id, this.actor(request));
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async approve(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as { notes?: string } | undefined;
    const result = await this.service.approve(id, this.actor(request), { notes: body?.notes });
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async reject(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };
    const result = await this.service.reject(id, this.actor(request), reason);
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as { notes?: string } | undefined;
    return reply.send(await this.service.cancel(id, this.actor(request), { notes: body?.notes }));
  }

  async assign(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { custodioId, copilotoId } = request.body as { custodioId: string; copilotoId: string };
    const result = await this.service.assignCrew(id, this.actor(request), custodioId, copilotoId);
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async confirmCrew(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await this.service.confirmCrew(id, this.actor(request));
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async reassign(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { custodioId, copilotoId } = request.body as { custodioId: string; copilotoId: string };
    const result = await this.service.reassignCrew(id, this.actor(request), custodioId, copilotoId);
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async depart(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await this.service.depart(id, this.actor(request));
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async arrivePickup(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await this.service.arrivePickup(id, this.actor(request));
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async pickup(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { digitalSignature } = request.body as { digitalSignature: string };
    const result = await this.service.pickup(id, this.actor(request), digitalSignature);
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async arriveDelivery(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await this.service.arriveDelivery(id, this.actor(request));
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async deliver(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { digitalSignature } = request.body as { digitalSignature: string };
    const result = await this.service.deliver(id, this.actor(request), digitalSignature);
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async complete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await this.service.complete(id, this.actor(request));
    this.enqueueTransitionNotification(request, result);
    if (this.paymentsQueue) {
      this.paymentsQueue
        .add('process-payment', {
          orderId: result.id,
          tenantId: request.user!.tenant_id ?? 'default',
        })
        .catch(() => { /* non-fatal */ });
    }
    return reply.send(result);
  }

  async reportIncident(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { description } = request.body as { description: string };
    const result = await this.service.reportIncident(id, this.actor(request), description);
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
  }

  async resolveIncident(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const { transitTo, notes } = request.body as { transitTo: 'IN_TRANSIT' | 'RESOLVED'; notes?: string };
    const result = await this.service.resolveIncident(id, this.actor(request), transitTo, { notes });
    this.enqueueTransitionNotification(request, result);
    return reply.send(result);
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

  async schedule(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as {
      scheduledAt: string;
      pickupWindowStart?: string;
      pickupWindowEnd?: string;
    };
    const result = await this.service.scheduleOrder(id, this.actor(request), body);
    return reply.send(result);
  }

  async unschedule(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const result = await this.service.unscheduleOrder(id, this.actor(request));
    return reply.send(result);
  }
}
