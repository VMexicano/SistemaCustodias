import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { ScheduledTripsController } from './scheduled-trips.controller.js';
import type { ScheduledTripsService } from './scheduled-trips.service.js';

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

const scheduleTripSchema = {
  body: {
    type: 'object',
    required: ['origin', 'destination', 'tripTypeId', 'scheduledFor'],
    additionalProperties: false,
    properties: {
      origin: latLngWithAddressSchema,
      destination: latLngWithAddressSchema,
      tripTypeId: { type: 'string', minLength: 1 },
      scheduledFor: { type: 'string', minLength: 1 },
    },
  },
};

const cancelScheduledTripSchema = {
  params: {
    type: 'object',
    required: ['tripId'],
    properties: {
      tripId: { type: 'string', minLength: 1 },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface ScheduledTripsRoutesOptions extends FastifyPluginOptions {
  scheduledTripsService: ScheduledTripsService;
}

// ---------------------------------------------------------------------------
// Route registration
// Note: these routes are registered under the /trips prefix in app.ts
// ---------------------------------------------------------------------------

export async function scheduledTripsRoutes(
  app: FastifyInstance,
  options: ScheduledTripsRoutesOptions,
): Promise<void> {
  const controller = new ScheduledTripsController(options.scheduledTripsService);

  // POST /trips/schedule
  app.post('/schedule', {
    schema: scheduleTripSchema,
    preHandler: [authenticate],
    handler: controller.schedule.bind(controller) as RouteHandlerMethod,
  });

  // GET /trips/scheduled
  app.get('/scheduled', {
    preHandler: [authenticate],
    handler: controller.getScheduled.bind(controller) as RouteHandlerMethod,
  });

  // DELETE /trips/scheduled/:tripId
  app.delete('/scheduled/:tripId', {
    schema: cancelScheduledTripSchema,
    preHandler: [authenticate],
    handler: controller.cancel.bind(controller) as RouteHandlerMethod,
  });
}
