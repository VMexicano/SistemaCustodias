import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { DriversController } from './drivers.controller.js';
import type { DriversService } from './drivers.service.js';

const SERVICE_MODES = ['people', 'cargo', 'mixed'];
const CURRENT_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------------------------

const registerDriverSchema = {
  body: {
    type: 'object',
    required: ['licenseNumber', 'licenseExpiry', 'serviceModes'],
    additionalProperties: false,
    properties: {
      licenseNumber: { type: 'string', minLength: 5, maxLength: 50 },
      licenseExpiry: { type: 'string', format: 'date' },
      serviceModes: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', enum: SERVICE_MODES },
      },
    },
  },
};

const updateDriverSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      licenseNumber: { type: 'string', minLength: 5, maxLength: 50 },
      licenseExpiry: { type: 'string', format: 'date' },
      serviceModes: {
        type: 'array',
        minItems: 1,
        items: { type: 'string', enum: SERVICE_MODES },
      },
    },
  },
};

const submitDocumentSchema = {
  body: {
    type: 'object',
    required: ['requirementId', 'fileUrl'],
    additionalProperties: false,
    properties: {
      requirementId: { type: 'string', format: 'uuid' },
      fileUrl: { type: 'string', format: 'uri', maxLength: 2048 },
      expiresAt: { type: 'string', format: 'date' },
    },
  },
};

const registerVehicleSchema = {
  body: {
    type: 'object',
    required: ['make', 'model', 'year', 'color', 'licensePlate'],
    additionalProperties: false,
    properties: {
      make: { type: 'string', minLength: 1, maxLength: 50 },
      model: { type: 'string', minLength: 1, maxLength: 50 },
      year: { type: 'integer', minimum: 1990, maximum: CURRENT_YEAR + 1 },
      color: { type: 'string', minLength: 1, maxLength: 30 },
      licensePlate: { type: 'string', minLength: 2, maxLength: 20 },
    },
  },
};

const locationSchema = {
  body: {
    type: 'object',
    required: ['latitude', 'longitude'],
    additionalProperties: false,
    properties: {
      latitude: { type: 'number', minimum: -90, maximum: 90 },
      longitude: { type: 'number', minimum: -180, maximum: 180 },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface DriversRoutesOptions extends FastifyPluginOptions {
  driversService: DriversService;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function driversRoutes(
  app: FastifyInstance,
  options: DriversRoutesOptions,
): Promise<void> {
  const controller = new DriversController(options.driversService);

  // POST /drivers/register
  app.post('/register', {
    schema: registerDriverSchema,
    preHandler: authenticate,
    handler: controller.register.bind(controller) as RouteHandlerMethod,
  });

  // GET /drivers/me
  app.get('/me', {
    preHandler: authenticate,
    handler: controller.getMe.bind(controller),
  });

  // PATCH /drivers/me
  app.patch('/me', {
    schema: updateDriverSchema,
    preHandler: authenticate,
    handler: controller.updateMe.bind(controller) as RouteHandlerMethod,
  });

  // GET /drivers/me/documents
  app.get('/me/documents', {
    preHandler: authenticate,
    handler: controller.getDocuments.bind(controller),
  });

  // POST /drivers/me/documents
  app.post('/me/documents', {
    schema: submitDocumentSchema,
    preHandler: authenticate,
    handler: controller.submitDocument.bind(controller) as RouteHandlerMethod,
  });

  // GET /drivers/me/vehicles
  app.get('/me/vehicles', {
    preHandler: authenticate,
    handler: controller.getVehicles.bind(controller),
  });

  // POST /drivers/me/vehicles
  app.post('/me/vehicles', {
    schema: registerVehicleSchema,
    preHandler: authenticate,
    handler: controller.registerVehicle.bind(controller) as RouteHandlerMethod,
  });

  // POST /drivers/me/go-online
  app.post('/me/go-online', {
    preHandler: authenticate,
    handler: controller.goOnline.bind(controller),
  });

  // POST /drivers/me/go-offline
  app.post('/me/go-offline', {
    preHandler: authenticate,
    handler: controller.goOffline.bind(controller),
  });

  // PATCH /drivers/me/location
  app.patch('/me/location', {
    schema: locationSchema,
    preHandler: authenticate,
    handler: controller.updateLocation.bind(controller) as RouteHandlerMethod,
  });
}
