import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { adminOnly } from './admin.middleware.js';
import { AdminConfigController } from './admin-config.controller.js';
import type { AdminConfigService } from './admin-config.service.js';

// ---------------------------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------------------------

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
};

const updateFactorSchema = {
  params: idParamsSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      active: { type: 'boolean' },
      value: { type: 'number', minimum: 0 },
    },
  },
};

const updateCommissionSchema = {
  params: idParamsSchema,
  body: {
    type: 'object',
    required: ['platformFeePct'],
    additionalProperties: false,
    properties: {
      platformFeePct: { type: 'number', minimum: 0, maximum: 100 },
    },
  },
};

const createTripTypeSchema = {
  body: {
    type: 'object',
    required: ['code', 'name', 'description', 'baseFare', 'costPerKm', 'costPerMin', 'minFare'],
    additionalProperties: false,
    properties: {
      code: { type: 'string', minLength: 1, maxLength: 20 },
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 255 },
      baseFare: { type: 'number', minimum: 0 },
      costPerKm: { type: 'number', minimum: 0 },
      costPerMin: { type: 'number', minimum: 0 },
      minFare: { type: 'number', minimum: 0 },
      serviceMode: { type: 'string', maxLength: 20 },
    },
  },
};

const updateTripTypeSchema = {
  params: idParamsSchema,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 255 },
      baseFare: { type: 'number', minimum: 0 },
      costPerKm: { type: 'number', minimum: 0 },
      costPerMin: { type: 'number', minimum: 0 },
      minFare: { type: 'number', minimum: 0 },
      active: { type: 'boolean' },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface AdminConfigRoutesOptions extends FastifyPluginOptions {
  adminConfigService: AdminConfigService;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function adminConfigRoutes(
  app: FastifyInstance,
  options: AdminConfigRoutesOptions,
): Promise<void> {
  const controller = new AdminConfigController(options.adminConfigService);

  // Pricing factors
  app.get('/pricing/factors', {
    preHandler: [authenticate, adminOnly],
    handler: controller.getFactors.bind(controller) as RouteHandlerMethod,
  });

  app.patch('/pricing/factors/:id', {
    schema: updateFactorSchema,
    preHandler: [authenticate, adminOnly],
    handler: controller.updateFactor.bind(controller) as RouteHandlerMethod,
  });

  // Commission rules
  app.get('/commissions', {
    preHandler: [authenticate, adminOnly],
    handler: controller.getCommissions.bind(controller) as RouteHandlerMethod,
  });

  app.patch('/commissions/:id', {
    schema: updateCommissionSchema,
    preHandler: [authenticate, adminOnly],
    handler: controller.updateCommission.bind(controller) as RouteHandlerMethod,
  });

  // Trip types
  app.get('/trip-types', {
    preHandler: [authenticate, adminOnly],
    handler: controller.getTripTypes.bind(controller) as RouteHandlerMethod,
  });

  app.post('/trip-types', {
    schema: createTripTypeSchema,
    preHandler: [authenticate, adminOnly],
    handler: controller.createTripType.bind(controller) as RouteHandlerMethod,
  });

  app.patch('/trip-types/:id', {
    schema: updateTripTypeSchema,
    preHandler: [authenticate, adminOnly],
    handler: controller.updateTripType.bind(controller) as RouteHandlerMethod,
  });
}
