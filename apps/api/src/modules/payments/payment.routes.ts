import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import type { PaymentController } from './payment.controller.js';

export interface PaymentRoutesOptions extends FastifyPluginOptions {
  paymentController: PaymentController;
}

export async function paymentRoutes(
  app: FastifyInstance,
  options: PaymentRoutesOptions,
): Promise<void> {
  const { paymentController } = options;

  // GET /trips/:tripId/payment
  app.get('/trips/:tripId/payment', {
    schema: {
      params: {
        type: 'object',
        required: ['tripId'],
        properties: {
          tripId: { type: 'string', minLength: 1 },
        },
      },
    },
    preHandler: [authenticate],
    handler: paymentController.getPaymentByTripId.bind(paymentController) as RouteHandlerMethod,
  });
}
