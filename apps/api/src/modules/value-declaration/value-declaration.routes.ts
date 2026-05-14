import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { ValueDeclarationController } from './value-declaration.controller.js';
import type { ValueDeclarationService } from './value-declaration.service.js';

export interface ValueDeclarationRoutesOptions extends FastifyPluginOptions {
  valueDeclarationService: ValueDeclarationService;
}

const upsertSchema = {
  body: {
    type: 'object',
    required: ['declaredValue'],
    additionalProperties: false,
    properties: {
      declaredValue: { type: 'object' },
      insurancePolicyId: { type: 'string', maxLength: 100 },
    },
  },
};

const preAuth = [authenticate, tenantGuard] as const;

export async function valueDeclarationRoutes(
  app: FastifyInstance,
  options: ValueDeclarationRoutesOptions,
): Promise<void> {
  const ctrl = new ValueDeclarationController(options.valueDeclarationService);

  // POST /orders/:id/value-declaration
  app.post('/', {
    schema: upsertSchema,
    preHandler: [...preAuth, authorize('client', 'dispatcher')],
    handler: ctrl.upsert.bind(ctrl) as RouteHandlerMethod,
  });

  // GET /orders/:id/value-declaration
  app.get('/', {
    preHandler: [...preAuth, authorize('client', 'dispatcher', 'supervisor')],
    handler: ctrl.getByOrderId.bind(ctrl),
  });
}
