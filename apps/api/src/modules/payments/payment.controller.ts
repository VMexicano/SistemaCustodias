import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PaymentService } from './payment.service.js';

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  async getPaymentByTripId(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const { tripId } = request.params as { tripId: string };
    const requesterId = request.user!.sub;

    const payment = await this.paymentService.getPaymentByTripId(tripId, requesterId);

    reply.status(200).send({
      id: payment.id,
      tripId: payment.trip_id,
      status: payment.status,
      amount: Number(payment.amount),
      taxAmount: Number(payment.tax_amount),
      platformFee: Number(payment.platform_fee),
      driverEarnings: Number(payment.driver_earnings),
      currency: payment.currency,
      stripePaymentIntentId: payment.stripe_payment_intent_id,
      chargedAt: payment.charged_at?.toISOString() ?? null,
      failureReason: payment.failure_reason,
      retryCount: payment.retry_count,
      createdAt: payment.created_at.toISOString(),
    });
  }
}
