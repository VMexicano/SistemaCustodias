import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { PaymentMethodsController } from './payment-methods.controller.js';
import type { PaymentMethodsService } from './payment-methods.service.js';

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface PaymentMethodsRoutesOptions extends FastifyPluginOptions {
  paymentMethodsService: PaymentMethodsService;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

/**
 * Registers payment method routes under the prefix provided at registration
 * time (expected: /users/me).
 *
 *   POST /users/me/payment-methods  — create a Stripe SetupIntent
 *   GET  /users/me/payment-methods  — list saved payment methods
 */
export async function paymentMethodsRoutes(
  app: FastifyInstance,
  options: PaymentMethodsRoutesOptions,
): Promise<void> {
  const controller = new PaymentMethodsController(options.paymentMethodsService);

  /**
   * POST /users/me/payment-methods
   * Returns a Stripe SetupIntent client_secret for frontend card collection.
   */
  app.post('/payment-methods', {
    preHandler: authenticate,
    handler: controller.create.bind(controller),
  });

  /**
   * GET /users/me/payment-methods
   * Lists all saved payment methods for the authenticated user.
   */
  app.get('/payment-methods', {
    preHandler: authenticate,
    handler: controller.list.bind(controller),
  });
}
