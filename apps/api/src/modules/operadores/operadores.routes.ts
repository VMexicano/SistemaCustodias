import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { OperadoresController } from './operadores.controller.js';
import type { OperadoresService } from './operadores.service.js';

export interface OperadoresRoutesOptions extends FastifyPluginOptions {
  operadoresService: OperadoresService;
}

const OPERATOR_TYPES = ['custodio', 'copiloto'];
const OPERATOR_STATUSES = ['available', 'busy', 'offline', 'suspended'];

const createOperatorSchema = {
  body: {
    type: 'object',
    required: ['userId', 'operatorType'],
    additionalProperties: false,
    properties: {
      userId: { type: 'string', minLength: 1 },
      operatorType: { type: 'string', enum: OPERATOR_TYPES },
      licenseNumber: { type: 'string', minLength: 1, maxLength: 50 },
      certifications: { type: 'object', additionalProperties: { type: 'string' } },
    },
  },
};

const updateStatusSchema = {
  body: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['available', 'busy', 'offline'] },
    },
  },
};

const suspendSchema = {
  body: {
    type: 'object',
    required: ['reason'],
    additionalProperties: false,
    properties: {
      reason: { type: 'string', minLength: 1, maxLength: 500 },
    },
  },
};

export async function operadoresRoutes(
  app: FastifyInstance,
  options: OperadoresRoutesOptions,
): Promise<void> {
  const controller = new OperadoresController(options.operadoresService);

  // GET /operadores/available — dispatcher consulta operadores disponibles
  // Registrar ANTES de /:id para evitar conflicto de rutas
  app.get('/available', {
    preHandler: [authenticate, tenantGuard, authorize('dispatcher', 'supervisor')],
    handler: controller.listAvailable.bind(controller),
  });

  // POST /operadores — supervisor crea operador
  app.post('/', {
    schema: createOperatorSchema,
    preHandler: [authenticate, tenantGuard, authorize('supervisor')],
    handler: controller.create.bind(controller) as RouteHandlerMethod,
  });

  // GET /operadores — lista operadores del tenant
  app.get('/', {
    preHandler: [authenticate, tenantGuard, authorize('dispatcher', 'supervisor')],
    handler: controller.list.bind(controller),
  });

  // GET /operadores/:id
  app.get('/:id', {
    preHandler: [authenticate, tenantGuard, authorize('dispatcher', 'supervisor')],
    handler: controller.getById.bind(controller),
  });

  // PATCH /operadores/:id/status — cambia status (available/busy/offline)
  app.patch('/:id/status', {
    schema: updateStatusSchema,
    preHandler: [authenticate, tenantGuard, authorize('dispatcher', 'supervisor')],
    handler: controller.updateStatus.bind(controller) as RouteHandlerMethod,
  });

  // PATCH /operadores/:id/suspend — supervisor suspende operador
  app.patch('/:id/suspend', {
    schema: suspendSchema,
    preHandler: [authenticate, tenantGuard, authorize('supervisor')],
    handler: controller.suspend.bind(controller) as RouteHandlerMethod,
  });

  // DELETE /operadores/:id — supervisor soft delete
  app.delete('/:id', {
    preHandler: [authenticate, tenantGuard, authorize('supervisor')],
    handler: controller.remove.bind(controller),
  });
}
