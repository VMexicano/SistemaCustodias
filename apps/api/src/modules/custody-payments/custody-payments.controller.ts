// ---------------------------------------------------------------------------
// custody-payments.controller.ts — GET /orders/:id/payment
// ---------------------------------------------------------------------------

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { CustodyPaymentService } from './custody-payments.service.js';

export class CustodyPaymentsController {
  constructor(private readonly service: CustodyPaymentService) {}

  async getByOrderId(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const payment = await this.service.getByOrderId(id);
    return reply.send(payment);
  }
}
