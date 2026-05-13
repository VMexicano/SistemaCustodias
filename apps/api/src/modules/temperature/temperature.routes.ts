import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { TemperatureController } from './temperature.controller.js';
import type { TemperatureService } from './temperature.service.js';

export interface TemperatureRoutesOptions extends FastifyPluginOptions {
  temperatureService: TemperatureService;
}

export async function temperatureRoutes(
  app: FastifyInstance,
  options: TemperatureRoutesOptions,
): Promise<void> {
  const controller = new TemperatureController(options.temperatureService);

  // POST /trips/:id/temperature — only the assigned driver can post readings
  app.post('/:id/temperature', {
    preHandler: [authenticate, authorize('driver')],
    handler: controller.create.bind(controller) as RouteHandlerMethod,
  });

  // GET /trips/:id/temperature — driver, passenger, or admin can read
  app.get('/:id/temperature', {
    preHandler: [authenticate, authorize('driver', 'passenger', 'admin')],
    handler: controller.getTemperature.bind(controller) as RouteHandlerMethod,
  });
}
