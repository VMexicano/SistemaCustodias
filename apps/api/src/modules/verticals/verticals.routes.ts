import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { VerticalsController } from './verticals.controller.js';
import type { VerticalsService } from './verticals.service.js';

export interface VerticalsRoutesOptions extends FastifyPluginOptions {
  verticalsService: VerticalsService;
}

export async function verticalsRoutes(
  app: FastifyInstance,
  options: VerticalsRoutesOptions,
): Promise<void> {
  const controller = new VerticalsController(options.verticalsService);

  // GET /config — public, no auth required
  app.get('/config', {
    handler: controller.getConfig.bind(controller) as RouteHandlerMethod,
  });

  // GET /admin/verticals
  app.get('/admin/verticals', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.getAll.bind(controller) as RouteHandlerMethod,
  });

  // PATCH /admin/verticals/:slug
  app.patch('/admin/verticals/:slug', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.updateVertical.bind(controller) as RouteHandlerMethod,
  });
}
