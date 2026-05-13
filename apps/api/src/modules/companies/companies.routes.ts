import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { CompaniesController } from './companies.controller.js';
import type { CompaniesService } from './companies.service.js';

export interface CompaniesRoutesOptions extends FastifyPluginOptions {
  companiesService: CompaniesService;
}

export async function companiesRoutes(
  app: FastifyInstance,
  options: CompaniesRoutesOptions,
): Promise<void> {
  const controller = new CompaniesController(options.companiesService);
  const pre = [authenticate, authorize('admin')];

  app.post('/companies', { preHandler: pre, handler: controller.create.bind(controller) as RouteHandlerMethod });
  app.get('/companies', { preHandler: pre, handler: controller.getAll.bind(controller) as RouteHandlerMethod });
  app.get('/companies/:id', { preHandler: pre, handler: controller.getById.bind(controller) as RouteHandlerMethod });
  app.patch('/companies/:id', { preHandler: pre, handler: controller.update.bind(controller) as RouteHandlerMethod });
  app.get('/companies/:id/users', { preHandler: pre, handler: controller.getUsers.bind(controller) as RouteHandlerMethod });
  app.post('/companies/:id/users', { preHandler: pre, handler: controller.addUser.bind(controller) as RouteHandlerMethod });
  app.delete('/companies/:id/users/:userId', { preHandler: pre, handler: controller.removeUser.bind(controller) as RouteHandlerMethod });
}
