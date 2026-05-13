import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { ConfigurationsController } from './configurations.controller.js';
import type { ConfigurationsService } from './configurations.service.js';

export interface ConfigurationsRoutesOptions extends FastifyPluginOptions {
  configurationsService: ConfigurationsService;
}

export async function configurationsRoutes(
  app: FastifyInstance,
  options: ConfigurationsRoutesOptions,
): Promise<void> {
  const controller = new ConfigurationsController(options.configurationsService);
  const pre = [authenticate, authorize('admin')];

  // GET /config/entity/:entityType/:entityId
  app.get('/entity/:entityType/:entityId', {
    preHandler: pre,
    handler: controller.getGrouped.bind(controller) as RouteHandlerMethod,
  });

  // PUT /config/entity/:entityType/:entityId/:namespace/:key
  app.put('/entity/:entityType/:entityId/:namespace/:key', {
    preHandler: pre,
    handler: controller.upsert.bind(controller) as RouteHandlerMethod,
  });

  // DELETE /config/entity/:entityType/:entityId/:namespace/:key
  app.delete('/entity/:entityType/:entityId/:namespace/:key', {
    preHandler: pre,
    handler: controller.delete.bind(controller) as RouteHandlerMethod,
  });
}
