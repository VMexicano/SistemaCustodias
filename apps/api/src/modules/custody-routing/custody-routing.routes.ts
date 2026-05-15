import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { CustodyRoutingController } from './custody-routing.controller.js';
import type { CustodyRoutingService } from './custody-routing.service.js';

export interface CustodyRoutingRoutesOptions extends FastifyPluginOptions {
  routingService: CustodyRoutingService;
}

const orderIdParam = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } },
  },
};

const planRouteSchema = {
  ...orderIdParam,
  body: {
    type: 'object',
    required: ['waypoints'],
    additionalProperties: false,
    properties: {
      waypoints: {
        type: 'array',
        items: {
          type: 'object',
          required: ['lat', 'lng'],
          additionalProperties: false,
          properties: {
            lat: { type: 'number', minimum: -90, maximum: 90 },
            lng: { type: 'number', minimum: -180, maximum: 180 },
            label: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
  },
};

const preAuth = [authenticate, tenantGuard];

export async function custodyRoutingRoutes(
  app: FastifyInstance,
  options: CustodyRoutingRoutesOptions,
): Promise<void> {
  const ctrl = new CustodyRoutingController(options.routingService);

  // POST /orders/:id/route — plan or update route (dispatcher)
  app.post('/:id/route', {
    schema: planRouteSchema,
    preHandler: [...preAuth, authorize('dispatcher', 'supervisor')],
    handler: ctrl.planRoute.bind(ctrl),
  });

  // GET /orders/:id/route — view planned route (all roles)
  app.get('/:id/route', {
    schema: orderIdParam,
    preHandler: [...preAuth, authorize('dispatcher', 'supervisor', 'client', 'custodio', 'copiloto')],
    handler: ctrl.getRoute.bind(ctrl),
  });

  // PATCH /orders/:id/route/approve — supervisor approves route
  app.patch('/:id/route/approve', {
    schema: orderIdParam,
    preHandler: [...preAuth, authorize('supervisor')],
    handler: ctrl.approveRoute.bind(ctrl),
  });
}
