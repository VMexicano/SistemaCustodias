import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { PricingController } from './pricing.controller.js';
import type { PricingService } from './pricing.service.js';

// ---------------------------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------------------------

const latLngSchema = {
  type: 'object',
  required: ['lat', 'lng'],
  additionalProperties: false,
  properties: {
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lng: { type: 'number', minimum: -180, maximum: 180 },
  },
};

const estimateSchema = {
  body: {
    type: 'object',
    required: ['origin', 'destination', 'trip_type_id'],
    additionalProperties: false,
    properties: {
      origin: latLngSchema,
      destination: latLngSchema,
      trip_type_id: { type: 'string', minLength: 1 },
      pricing_model: {
        type: 'string',
        enum: ['per_km_min', 'fixed_rate', 'per_weight_km'],
      },
      weight_kg: { type: 'number', minimum: 0 },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface PricingRoutesOptions extends FastifyPluginOptions {
  pricingService: PricingService;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function pricingRoutes(
  app: FastifyInstance,
  options: PricingRoutesOptions,
): Promise<void> {
  const controller = new PricingController(options.pricingService);

  // GET /trip-types — public for authenticated users
  app.get('/trip-types', {
    preHandler: authenticate,
    handler: controller.listTripTypes.bind(controller) as RouteHandlerMethod,
  });

  // POST /trips/estimate
  app.post('/trips/estimate', {
    schema: estimateSchema,
    preHandler: authenticate,
    handler: controller.estimate.bind(controller) as RouteHandlerMethod,
  });
}
