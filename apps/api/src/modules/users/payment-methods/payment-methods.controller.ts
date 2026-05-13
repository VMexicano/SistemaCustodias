import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PaymentMethodsService } from './payment-methods.service.js';

/**
 * PaymentMethodsController — HTTP layer for payment method endpoints.
 *
 * Delegates all business logic to PaymentMethodsService.
 */
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  /**
   * POST /users/me/payment-methods
   * Creates a Stripe SetupIntent and returns the client_secret to the frontend.
   * The frontend uses this with Stripe.js to securely collect card details.
   */
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.sub;
    const result = await this.paymentMethodsService.createSetupIntent(userId);

    await reply.status(200).send({
      setupIntentId: result.setupIntentId,
      clientSecret: result.clientSecret,
    });
  }

  /**
   * GET /users/me/payment-methods
   * Returns all saved payment methods for the authenticated user.
   */
  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.sub;
    const methods = await this.paymentMethodsService.listPaymentMethods(userId);

    await reply.status(200).send(methods);
  }
}
