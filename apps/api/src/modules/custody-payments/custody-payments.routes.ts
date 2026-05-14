// ---------------------------------------------------------------------------
// custody-payments.routes.ts — payment routes under /orders/:id/payment
// ---------------------------------------------------------------------------

import type { FastifyInstance } from 'fastify';
import type { CustodyPaymentsController } from './custody-payments.controller.js';

interface CustodyPaymentsRouteOptions {
  controller: CustodyPaymentsController;
}

export async function custodyPaymentsRoutes(
  app: FastifyInstance,
  opts: CustodyPaymentsRouteOptions,
): Promise<void> {
  app.get('/', async (request, reply) => {
    return opts.controller.getByOrderId(request, reply);
  });
}
