import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import type { Queue } from 'bullmq';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { CustodyOrdersController } from './custody-orders.controller.js';
import type { CustodyOrdersService } from './custody-orders.service.js';
import type { CustodyNotificationJobData } from '../custody-notifications/custody-notifications.types.js';
import type { CustodyPaymentJobData } from '../custody-payments/custody-payments.types.js';

export interface OrdersRoutesOptions extends FastifyPluginOptions {
  ordersService: CustodyOrdersService;
  notificationsQueue?: Queue<CustodyNotificationJobData>;
  paymentsQueue?: Queue<CustodyPaymentJobData>;
}

const addressSchema = {
  type: 'object',
  required: ['street', 'city', 'state'],
  additionalProperties: true,
  properties: {
    street: { type: 'string', minLength: 1 },
    city: { type: 'string', minLength: 1 },
    state: { type: 'string', minLength: 1 },
    zip: { type: 'string' },
    lat: { type: 'number' },
    lng: { type: 'number' },
    reference: { type: 'string' },
  },
};

const createOrderSchema = {
  body: {
    type: 'object',
    required: ['clientId', 'custodyTypeId', 'pickupAddress', 'deliveryAddress'],
    additionalProperties: false,
    properties: {
      clientId: { type: 'string', minLength: 1 },
      custodyTypeId: { type: 'string', minLength: 1 },
      pickupAddress: addressSchema,
      deliveryAddress: addressSchema,
      scheduledAt: { type: 'string', format: 'date-time' },
      pickupWindowStart: { type: 'string', format: 'date-time' },
      pickupWindowEnd: { type: 'string', format: 'date-time' },
      notes: { type: 'string', maxLength: 2000 },
    },
  },
};

const rejectSchema = {
  body: {
    type: 'object',
    required: ['reason'],
    additionalProperties: false,
    properties: { reason: { type: 'string', minLength: 10, maxLength: 1000 } },
  },
};

const cancelSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { notes: { type: 'string', maxLength: 1000 } },
  },
};

const approveSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { notes: { type: 'string', maxLength: 1000 } },
  },
};

const assignSchema = {
  body: {
    type: 'object',
    required: ['custodioId', 'copilotoId'],
    additionalProperties: false,
    properties: {
      custodioId: { type: 'string', minLength: 1 },
      copilotoId: { type: 'string', minLength: 1 },
    },
  },
};

const signatureSchema = {
  body: {
    type: 'object',
    required: ['digitalSignature'],
    additionalProperties: false,
    properties: { digitalSignature: { type: 'string', minLength: 1, maxLength: 4096 } },
  },
};

const notesSchema = {
  body: {
    type: 'object',
    required: ['notes'],
    additionalProperties: false,
    properties: { notes: { type: 'string', minLength: 1, maxLength: 1000 } },
  },
};

const reportIncidentSchema = {
  body: {
    type: 'object',
    required: ['description'],
    additionalProperties: false,
    properties: { description: { type: 'string', minLength: 1, maxLength: 2000 } },
  },
};

const resolveIncidentSchema = {
  body: {
    type: 'object',
    required: ['transitTo'],
    additionalProperties: false,
    properties: {
      transitTo: { type: 'string', enum: ['IN_TRANSIT', 'RESOLVED'] },
      notes: { type: 'string', maxLength: 1000 },
    },
  },
};

const preAuth = [authenticate, tenantGuard] as const;

export async function ordersRoutes(
  app: FastifyInstance,
  options: OrdersRoutesOptions,
): Promise<void> {
  const ctrl = new CustodyOrdersController(options.ordersService, options.notificationsQueue, options.paymentsQueue);

  app.post('/', {
    schema: createOrderSchema,
    preHandler: [...preAuth, authorize('client', 'dispatcher')],
    handler: ctrl.create.bind(ctrl) as RouteHandlerMethod,
  });

  app.get('/', {
    preHandler: [...preAuth, authorize('dispatcher', 'supervisor')],
    handler: ctrl.list.bind(ctrl),
  });

  app.get('/:id', {
    preHandler: [...preAuth, authorize('client', 'custodio', 'copiloto', 'dispatcher', 'supervisor')],
    handler: ctrl.getById.bind(ctrl),
  });

  app.get('/:id/transitions', {
    preHandler: [...preAuth, authorize('client', 'custodio', 'copiloto', 'dispatcher', 'supervisor')],
    handler: ctrl.getTransitions.bind(ctrl),
  });

  app.patch('/:id/submit', {
    preHandler: [...preAuth, authorize('client', 'dispatcher')],
    handler: ctrl.submit.bind(ctrl),
  });

  app.patch('/:id/approve', {
    schema: approveSchema,
    preHandler: [...preAuth, authorize('supervisor')],
    handler: ctrl.approve.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/reject', {
    schema: rejectSchema,
    preHandler: [...preAuth, authorize('supervisor')],
    handler: ctrl.reject.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/cancel', {
    schema: cancelSchema,
    preHandler: [...preAuth, authorize('client', 'dispatcher')],
    handler: ctrl.cancel.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/assign', {
    schema: assignSchema,
    preHandler: [...preAuth, authorize('dispatcher')],
    handler: ctrl.assign.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/reassign', {
    schema: assignSchema,
    preHandler: [...preAuth, authorize('dispatcher')],
    handler: ctrl.reassign.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/confirm-crew', {
    preHandler: [...preAuth, authorize('custodio', 'copiloto')],
    handler: ctrl.confirmCrew.bind(ctrl),
  });

  app.patch('/:id/depart', {
    preHandler: [...preAuth, authorize('custodio')],
    handler: ctrl.depart.bind(ctrl),
  });

  app.patch('/:id/arrive-pickup', {
    preHandler: [...preAuth, authorize('custodio')],
    handler: ctrl.arrivePickup.bind(ctrl),
  });

  app.patch('/:id/pickup', {
    schema: signatureSchema,
    preHandler: [...preAuth, authorize('custodio')],
    handler: ctrl.pickup.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/arrive-delivery', {
    preHandler: [...preAuth, authorize('custodio')],
    handler: ctrl.arriveDelivery.bind(ctrl),
  });

  app.patch('/:id/deliver', {
    schema: signatureSchema,
    preHandler: [...preAuth, authorize('custodio')],
    handler: ctrl.deliver.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/complete', {
    preHandler: [...preAuth, authorize('dispatcher', 'supervisor')],
    handler: ctrl.complete.bind(ctrl),
  });

  app.patch('/:id/report-incident', {
    schema: reportIncidentSchema,
    preHandler: [...preAuth, authorize('custodio', 'copiloto')],
    handler: ctrl.reportIncident.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/resolve-incident', {
    schema: resolveIncidentSchema,
    preHandler: [...preAuth, authorize('supervisor')],
    handler: ctrl.resolveIncident.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/pickup-failed', {
    schema: notesSchema,
    preHandler: [...preAuth, authorize('custodio')],
    handler: ctrl.pickupFailed.bind(ctrl) as RouteHandlerMethod,
  });

  app.patch('/:id/delivery-failed', {
    schema: notesSchema,
    preHandler: [...preAuth, authorize('custodio')],
    handler: ctrl.deliveryFailed.bind(ctrl) as RouteHandlerMethod,
  });
}
