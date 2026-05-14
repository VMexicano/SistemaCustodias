import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { VehiclesController } from './vehicles.controller.js';
import type { VehiclesService } from './vehicles.service.js';

export interface VehiclesRoutesOptions extends FastifyPluginOptions {
  vehiclesService: VehiclesService;
}

const CURRENT_YEAR = new Date().getFullYear();

const createVehicleSchema = {
  body: {
    type: 'object',
    required: ['plate', 'model', 'year'],
    additionalProperties: false,
    properties: {
      plate: { type: 'string', minLength: 1, maxLength: 20 },
      make: { type: 'string', minLength: 1, maxLength: 100 },
      model: { type: 'string', minLength: 1, maxLength: 100 },
      year: { type: 'integer', minimum: 1990, maximum: CURRENT_YEAR + 1 },
      gpsDeviceId: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
};

const updateVehicleSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      make: { type: 'string', minLength: 1, maxLength: 100 },
      model: { type: 'string', minLength: 1, maxLength: 100 },
      year: { type: 'integer', minimum: 1990, maximum: CURRENT_YEAR + 1 },
      gpsDeviceId: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
};

export async function vehiclesRoutes(
  app: FastifyInstance,
  options: VehiclesRoutesOptions,
): Promise<void> {
  const controller = new VehiclesController(options.vehiclesService);

  // POST /vehicles
  app.post('/', {
    schema: createVehicleSchema,
    preHandler: [authenticate, tenantGuard, authorize('supervisor')],
    handler: controller.create.bind(controller) as RouteHandlerMethod,
  });

  // GET /vehicles
  app.get('/', {
    preHandler: [authenticate, tenantGuard, authorize('dispatcher', 'supervisor')],
    handler: controller.list.bind(controller),
  });

  // GET /vehicles/:id
  app.get('/:id', {
    preHandler: [authenticate, tenantGuard, authorize('dispatcher', 'supervisor')],
    handler: controller.getById.bind(controller),
  });

  // PATCH /vehicles/:id
  app.patch('/:id', {
    schema: updateVehicleSchema,
    preHandler: [authenticate, tenantGuard, authorize('supervisor')],
    handler: controller.update.bind(controller) as RouteHandlerMethod,
  });

  // PATCH /vehicles/:id/assign/:operatorId — vincula vehículo a operador
  app.patch('/:id/assign/:operatorId', {
    preHandler: [authenticate, tenantGuard, authorize('supervisor')],
    handler: controller.assign.bind(controller),
  });

  // DELETE /vehicles/:id
  app.delete('/:id', {
    preHandler: [authenticate, tenantGuard, authorize('supervisor')],
    handler: controller.remove.bind(controller),
  });
}
