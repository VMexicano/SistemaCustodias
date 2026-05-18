// ---------------------------------------------------------------------------
// custody-events.routes.ts — Fastify plugin for custody event endpoints
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { CustodyEventsController } from './custody-events.controller.js';
import type { CustodyEventService } from './custody-events.service.js';

export interface CustodyEventsRoutesOptions extends FastifyPluginOptions {
  service: CustodyEventService;
}

// ---------------------------------------------------------------------------
// JSON Schema definitions
// ---------------------------------------------------------------------------

const orderParamSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
};

const createEventBodySchema = {
  body: {
    type: 'object',
    required: ['event_type', 'actor_role', 'app_timestamp', 'location', 'payload', 'device'],
    additionalProperties: true, // evidence is optional
    properties: {
      event_type: { type: 'string', minLength: 1 },
      actor_role: {
        type: 'string',
        enum: ['custodio', 'copiloto', 'supervisor', 'system'],
      },
      app_timestamp: { type: 'string', minLength: 1 },
      location: {
        type: 'object',
        required: ['lat', 'long', 'accuracy_meters', 'provider'],
        properties: {
          lat: { type: 'number', minimum: -90, maximum: 90 },
          long: { type: 'number', minimum: -180, maximum: 180 },
          accuracy_meters: { type: 'number', minimum: 0 },
          speed_kmh: { type: 'number', minimum: 0 },
          heading_degrees: { type: 'number', minimum: 0, maximum: 360 },
          provider: { type: 'string', enum: ['gps', 'network', 'fused'] },
        },
      },
      evidence: { type: 'object' },
      payload: { type: 'object' },
      device: {
        type: 'object',
        required: ['battery_percent', 'signal_strength', 'app_version', 'os', 'mock_location_detected'],
        properties: {
          battery_percent: { type: 'number', minimum: 0, maximum: 100 },
          signal_strength: {
            type: 'string',
            enum: ['excellent', 'good', 'fair', 'poor', 'offline'],
          },
          app_version: { type: 'string' },
          os: { type: 'string', enum: ['ios', 'android'] },
          mock_location_detected: { type: 'boolean' },
        },
      },
    },
  },
};

const getEventsQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      offset: { type: 'integer', minimum: 0 },
      include_evidence: { type: 'boolean' },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function custodyEventsRoutes(
  app: FastifyInstance,
  options: CustodyEventsRoutesOptions,
): Promise<void> {
  const ctrl = new CustodyEventsController(options.service);

  // GET /orders/:id/event-catalog
  app.get('/:id/event-catalog', {
    schema: orderParamSchema,
    onRequest: [
      authenticate,
      authorize('custodio', 'copiloto', 'supervisor', 'dispatcher'),
      tenantGuard,
    ],
    handler: ctrl.getCatalog.bind(ctrl) as RouteHandlerMethod,
  });

  // POST /orders/:id/events
  app.post('/:id/events', {
    schema: { ...orderParamSchema, ...createEventBodySchema },
    onRequest: [authenticate, authorize('custodio', 'copiloto'), tenantGuard],
    handler: ctrl.createEvent.bind(ctrl) as RouteHandlerMethod,
  });

  // GET /orders/:id/events
  app.get('/:id/events', {
    schema: { ...orderParamSchema, ...getEventsQuerySchema },
    onRequest: [
      authenticate,
      authorize('custodio', 'copiloto', 'supervisor', 'dispatcher'),
      tenantGuard,
    ],
    handler: ctrl.getEvents.bind(ctrl) as RouteHandlerMethod,
  });
}
