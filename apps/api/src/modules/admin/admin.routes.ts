import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { AdminController } from './admin.controller.js';
import type { AdminService } from './admin.service.js';

export interface AdminRoutesOptions extends FastifyPluginOptions {
  adminService: AdminService;
}

export async function adminRoutes(
  app: FastifyInstance,
  options: AdminRoutesOptions,
): Promise<void> {
  const controller = new AdminController(options.adminService);

  // GET /admin/stats
  app.get('/stats', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.getStats.bind(controller) as RouteHandlerMethod,
  });

  // GET /admin/trips
  app.get('/trips', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.getTrips.bind(controller) as RouteHandlerMethod,
  });

  // GET /admin/drivers
  app.get('/drivers', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.getDrivers.bind(controller) as RouteHandlerMethod,
  });

  // GET /admin/errors
  app.get('/errors', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.getErrors.bind(controller) as RouteHandlerMethod,
  });

  // PATCH /admin/errors/:id/resolve
  app.patch('/errors/:id/resolve', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.resolveError.bind(controller) as RouteHandlerMethod,
  });

  // GET /admin/users/search?phone=  (must be before /users/:id if added later)
  app.get('/users/search', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.searchUsers.bind(controller) as RouteHandlerMethod,
  });

  // GET /admin/users
  app.get('/users', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.getUsers.bind(controller) as RouteHandlerMethod,
  });

  // PATCH /admin/drivers/:id/status
  app.patch('/drivers/:id/status', {
    preHandler: [authenticate, authorize('admin')],
    handler: controller.updateDriverStatus.bind(controller) as RouteHandlerMethod,
  });
}
