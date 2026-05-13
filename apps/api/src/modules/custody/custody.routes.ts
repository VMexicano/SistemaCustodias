import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { CustodyController } from './custody.controller.js';
import type { CustodyService } from './custody.service.js';

export interface CustodyRoutesOptions extends FastifyPluginOptions {
  custodyService: CustodyService;
}

export async function custodyRoutes(
  app: FastifyInstance,
  options: CustodyRoutesOptions,
): Promise<void> {
  const controller = new CustodyController(options.custodyService);

  // POST /trips/:id/custody/events — driver only (verified in service)
  app.post('/trips/:id/custody/events', {
    preHandler: [authenticate],
    handler: controller.createEvent.bind(controller) as RouteHandlerMethod,
  });

  // GET /trips/:id/custody — driver | passenger | admin (verified in service)
  app.get('/trips/:id/custody', {
    preHandler: [authenticate],
    handler: controller.getEvents.bind(controller) as RouteHandlerMethod,
  });
}
