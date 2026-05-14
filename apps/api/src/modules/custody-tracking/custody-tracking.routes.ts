// ---------------------------------------------------------------------------
// custody-tracking.routes.ts — Fastify plugin for custody GPS tracking
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import type { Server } from 'socket.io';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { CustodyTrackingController } from './custody-tracking.controller.js';
import type { CustodyTrackingService } from './custody-tracking.service.js';

export interface CustodyTrackingRoutesOptions extends FastifyPluginOptions {
  custodyTrackingService: CustodyTrackingService;
}

// ---------------------------------------------------------------------------
// JSON Schema definitions
// ---------------------------------------------------------------------------

const recordLocationSchema = {
  body: {
    type: 'object',
    required: ['order_id', 'lat', 'lng'],
    additionalProperties: false,
    properties: {
      order_id: { type: 'string', format: 'uuid' },
      lat: { type: 'number', minimum: -90, maximum: 90 },
      lng: { type: 'number', minimum: -180, maximum: 180 },
      speed_kmh: { type: 'number', minimum: 0 },
      accuracy_m: { type: 'number', minimum: 0 },
      heading: { type: 'number', minimum: 0, maximum: 360 },
    },
  },
};

const historyQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 1000 },
      from: { type: 'string' },
      to: { type: 'string' },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function custodyTrackingRoutes(
  app: FastifyInstance,
  options: CustodyTrackingRoutesOptions,
): Promise<void> {
  const ctrl = new CustodyTrackingController(options.custodyTrackingService);

  // POST /tracking/location — custodio or copiloto records their GPS position
  app.post('/location', {
    schema: recordLocationSchema,
    onRequest: [authenticate, authorize('custodio', 'copiloto'), tenantGuard],
    handler: ctrl.recordLocation.bind(ctrl) as RouteHandlerMethod,
  });

  // GET /tracking/:orderId/current — latest location for an order
  app.get('/:orderId/current', {
    onRequest: [authenticate, authorize('custodio', 'copiloto', 'dispatcher', 'supervisor', 'client'), tenantGuard],
    handler: ctrl.getCurrentLocation.bind(ctrl) as RouteHandlerMethod,
  });

  // GET /tracking/:orderId/history — paginated location history for an order
  app.get('/:orderId/history', {
    schema: historyQuerySchema,
    onRequest: [authenticate, authorize('custodio', 'copiloto', 'dispatcher', 'supervisor', 'client'), tenantGuard],
    handler: ctrl.getHistory.bind(ctrl) as RouteHandlerMethod,
  });

  // ---------------------------------------------------------------------------
  // Socket.io /tracking namespace — join:order event to subscribe to updates
  // ---------------------------------------------------------------------------

  try {
    // app.io is decorated by realtime.plugin.ts (see type augmentation there)
    const ioServer = (app as unknown as { io?: Server }).io;

    if (ioServer) {
      const trackingNs = ioServer.of('/tracking');
      options.custodyTrackingService.setIo(trackingNs);

      trackingNs.on('connection', (socket) => {
        socket.on('join:order', ({ order_id }: { order_id: string }) => {
          if (typeof order_id === 'string' && order_id.length > 0) {
            void socket.join(`order:${order_id}`);
          }
        });

        socket.on('leave:order', ({ order_id }: { order_id: string }) => {
          if (typeof order_id === 'string' && order_id.length > 0) {
            void socket.leave(`order:${order_id}`);
          }
        });
      });
    }
  } catch {
    // Socket.io not available — HTTP endpoints still work normally
    app.log.warn('[custody-tracking] Socket.io not available — real-time disabled');
  }
}
