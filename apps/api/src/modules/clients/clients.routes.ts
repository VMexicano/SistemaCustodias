import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { ClientsController } from './clients.controller.js';
import type { ClientsService } from './clients.service.js';

export interface ClientsRoutesOptions extends FastifyPluginOptions {
  clientsService: ClientsService;
}

const createClientSchema = {
  body: {
    type: 'object',
    required: ['userId', 'contactName'],
    additionalProperties: false,
    properties: {
      userId: { type: 'string', minLength: 1 },
      companyId: { type: 'string', minLength: 1 },
      companyName: { type: 'string', minLength: 1, maxLength: 255 },
      rfc: { type: 'string', minLength: 12, maxLength: 13 },
      contactName: { type: 'string', minLength: 1, maxLength: 255 },
      creditLimitMxn: { type: 'number', minimum: 0 },
    },
  },
};

const updateClientSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      companyName: { type: 'string', minLength: 1, maxLength: 255 },
      rfc: { type: 'string', minLength: 12, maxLength: 13 },
      contactName: { type: 'string', minLength: 1, maxLength: 255 },
      creditLimitMxn: { type: 'number', minimum: 0 },
    },
  },
};

export async function clientsRoutes(
  app: FastifyInstance,
  options: ClientsRoutesOptions,
): Promise<void> {
  const controller = new ClientsController(options.clientsService);

  // GET /clients/me — cliente ve su propio perfil
  app.get('/me', {
    preHandler: [authenticate, authorize('client')],
    handler: controller.getMe.bind(controller),
  });

  // POST /clients — dispatcher/supervisor crea un cliente
  app.post('/', {
    schema: createClientSchema,
    preHandler: [authenticate, tenantGuard, authorize('dispatcher', 'supervisor')],
    handler: controller.create.bind(controller) as RouteHandlerMethod,
  });

  // GET /clients — lista clientes del tenant
  app.get('/', {
    preHandler: [authenticate, tenantGuard, authorize('dispatcher', 'supervisor')],
    handler: controller.list.bind(controller),
  });

  // GET /clients/:id
  app.get('/:id', {
    preHandler: [authenticate, tenantGuard, authorize('dispatcher', 'supervisor')],
    handler: controller.getById.bind(controller),
  });

  // PATCH /clients/:id — supervisor actualiza datos del cliente
  app.patch('/:id', {
    schema: updateClientSchema,
    preHandler: [authenticate, tenantGuard, authorize('supervisor')],
    handler: controller.update.bind(controller) as RouteHandlerMethod,
  });

  // DELETE /clients/:id — supervisor soft delete
  app.delete('/:id', {
    preHandler: [authenticate, tenantGuard, authorize('supervisor')],
    handler: controller.remove.bind(controller),
  });
}
