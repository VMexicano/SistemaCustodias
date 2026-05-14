// ---------------------------------------------------------------------------
// alerts.routes.ts — Fastify plugin for security alerts
// ---------------------------------------------------------------------------

import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import type { Knex } from 'knex';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { AlertsController } from './alerts.controller.js';
import type { AlertEngine } from './alert-engine.js';
import type { AlertsRepository } from './alerts.repository.js';

// ---------------------------------------------------------------------------
// Plugin options
// ---------------------------------------------------------------------------

export interface AlertsRoutesOptions extends FastifyPluginOptions {
  alertEngine: AlertEngine;
  alertsRepo: AlertsRepository;
  db: Knex;
}

// ---------------------------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------------------------

const createAlertSchema = {
  body: {
    type: 'object',
    required: ['order_id', 'alert_type'],
    additionalProperties: false,
    properties: {
      order_id: { type: 'string', format: 'uuid' },
      alert_type: {
        type: 'string',
        enum: ['panic', 'tamper', 'geofence_violation', 'communication_loss', 'custom'],
      },
      lat: { type: 'number', minimum: -90, maximum: 90 },
      lng: { type: 'number', minimum: -180, maximum: 180 },
      description: { type: 'string', maxLength: 1000 },
    },
  },
};

const getAlertsQuerySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      order_id: { type: 'string', format: 'uuid' },
      operator_id: { type: 'string', format: 'uuid' },
      alert_type: {
        type: 'string',
        enum: ['panic', 'tamper', 'geofence_violation', 'communication_loss', 'custom'],
      },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
      resolved: { type: 'boolean' },
    },
  },
};

const alertIdParamSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function alertsRoutes(
  app: FastifyInstance,
  options: AlertsRoutesOptions,
): Promise<void> {
  const ctrl = new AlertsController(options.alertEngine, options.alertsRepo, options.db);

  // POST /alerts — custodio or copiloto raises an alert
  app.post('/', {
    schema: createAlertSchema,
    onRequest: [authenticate, authorize('custodio', 'copiloto'), tenantGuard],
    handler: ctrl.createAlert.bind(ctrl) as RouteHandlerMethod,
  });

  // GET /alerts — dispatcher or supervisor lists alerts
  app.get('/', {
    schema: getAlertsQuerySchema,
    onRequest: [authenticate, authorize('dispatcher', 'supervisor'), tenantGuard],
    handler: ctrl.getAlerts.bind(ctrl) as RouteHandlerMethod,
  });

  // GET /alerts/:id — get a single alert
  app.get('/:id', {
    schema: alertIdParamSchema,
    onRequest: [authenticate, authorize('dispatcher', 'supervisor', 'custodio', 'copiloto'), tenantGuard],
    handler: ctrl.getAlertById.bind(ctrl) as RouteHandlerMethod,
  });

  // PATCH /alerts/:id/resolve — resolve an alert
  app.patch('/:id/resolve', {
    schema: alertIdParamSchema,
    onRequest: [authenticate, authorize('dispatcher', 'supervisor'), tenantGuard],
    handler: ctrl.resolveAlert.bind(ctrl) as RouteHandlerMethod,
  });
}

// ---------------------------------------------------------------------------
// Order alerts sub-routes — GET /orders/:orderId/alerts
// ---------------------------------------------------------------------------

export interface OrderAlertsRoutesOptions extends FastifyPluginOptions {
  alertEngine: AlertEngine;
  alertsRepo: AlertsRepository;
  db: Knex;
}

const orderIdParamSchema = {
  params: {
    type: 'object',
    required: ['orderId'],
    properties: {
      orderId: { type: 'string', format: 'uuid' },
    },
  },
};

export async function orderAlertsRoutes(
  app: FastifyInstance,
  options: OrderAlertsRoutesOptions,
): Promise<void> {
  const ctrl = new AlertsController(options.alertEngine, options.alertsRepo, options.db);

  // GET /orders/:orderId/alerts
  app.get('/:orderId/alerts', {
    schema: orderIdParamSchema,
    onRequest: [authenticate, authorize('dispatcher', 'supervisor', 'custodio', 'copiloto', 'client'), tenantGuard],
    handler: ctrl.getOrderAlerts.bind(ctrl) as RouteHandlerMethod,
  });
}
