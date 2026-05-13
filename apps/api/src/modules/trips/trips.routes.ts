import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { TripsController } from './trips.controller.js';
import type { TripsService } from './trips.service.js';

// ---------------------------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------------------------

const latLngWithAddressSchema = {
  type: 'object',
  required: ['lat', 'lng', 'address'],
  additionalProperties: false,
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
    address: { type: 'string', minLength: 1, maxLength: 500 },
  },
};

const createTripSchema = {
  body: {
    type: 'object',
    required: ['origin', 'destination', 'trip_type_id'],
    additionalProperties: false,
    properties: {
      origin: latLngWithAddressSchema,
      destination: latLngWithAddressSchema,
      trip_type_id: { type: 'string', minLength: 1 },
      notes: { type: 'string', maxLength: 500 },
      metadata: { type: 'object' },
    },
  },
};

const updateStatusSchema = {
  body: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: {
      status: {
        type: 'string',
        enum: ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS', 'COMPLETED'],
      },
      notes: { type: 'string', maxLength: 500 },
    },
  },
};

const cancelTripSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reason: { type: 'string', maxLength: 500 },
    },
  },
};

const changeDestinationSchema = {
  body: {
    type: 'object',
    required: ['destination'],
    additionalProperties: false,
    properties: {
      destination: latLngWithAddressSchema,
    },
  },
};

const getHistorySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    },
  },
};

const approveTripSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      assigned_driver_id: { type: 'string', minLength: 1 },
    },
  },
};

const rejectTripSchema = {
  body: {
    type: 'object',
    required: ['reason'],
    additionalProperties: false,
    properties: {
      reason: { type: 'string', minLength: 1, maxLength: 500 },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface TripsRoutesOptions extends FastifyPluginOptions {
  tripsService: TripsService;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function tripsRoutes(
  app: FastifyInstance,
  options: TripsRoutesOptions,
): Promise<void> {
  const controller = new TripsController(options.tripsService);

  // IMPORTANT: Static routes must be registered BEFORE parameterized routes
  // GET /trips/active — must come before GET /trips/:id
  app.get('/active', {
    preHandler: [authenticate, authorize('passenger')],
    handler: controller.getActive.bind(controller),
  });

  // GET /trips/driver/active — viaje activo del conductor
  app.get('/driver/active', {
    preHandler: [authenticate, authorize('driver')],
    handler: controller.getActiveForDriver.bind(controller),
  });

  // GET /trips (history)
  app.get('/', {
    schema: getHistorySchema,
    preHandler: [authenticate, authorize('passenger')],
    handler: controller.getHistory.bind(controller) as RouteHandlerMethod,
  });

  // POST /trips
  app.post('/', {
    schema: createTripSchema,
    preHandler: [authenticate, authorize('passenger')],
    handler: controller.create.bind(controller) as RouteHandlerMethod,
  });

  // PATCH /trips/:id/accept
  app.patch('/:id/accept', {
    preHandler: [authenticate, authorize('driver')],
    handler: controller.accept.bind(controller) as RouteHandlerMethod,
  });

  // PATCH /trips/:id/status
  app.patch('/:id/status', {
    schema: updateStatusSchema,
    preHandler: [authenticate, authorize('driver')],
    handler: controller.updateStatus.bind(controller) as RouteHandlerMethod,
  });

  // PATCH /trips/:id/cancel
  app.patch('/:id/cancel', {
    schema: cancelTripSchema,
    preHandler: [authenticate],
    handler: controller.cancel.bind(controller) as RouteHandlerMethod,
  });

  // PATCH /trips/:id/destination
  app.patch('/:id/destination', {
    schema: changeDestinationSchema,
    preHandler: [authenticate, authorize('passenger')],
    handler: controller.changeDestination.bind(controller) as RouteHandlerMethod,
  });

  // GET /trips/:id/track
  app.get('/:id/track', {
    preHandler: [authenticate],
    handler: controller.getTrack.bind(controller) as RouteHandlerMethod,
  });

  // POST /trips/:id/approve  (dispatcher / admin)
  app.post('/:id/approve', {
    schema: approveTripSchema,
    preHandler: [authenticate, authorize('admin', 'dispatcher')],
    handler: controller.approve.bind(controller) as RouteHandlerMethod,
  });

  // POST /trips/:id/reject  (dispatcher / admin)
  app.post('/:id/reject', {
    schema: rejectTripSchema,
    preHandler: [authenticate, authorize('admin', 'dispatcher')],
    handler: controller.reject.bind(controller) as RouteHandlerMethod,
  });

  // GET /trips/:id
  app.get('/:id', {
    preHandler: [authenticate],
    handler: controller.getById.bind(controller) as RouteHandlerMethod,
  });
}
