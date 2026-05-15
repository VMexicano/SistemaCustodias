import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { authorize } from '../../shared/middleware/authorize.js';
import { tenantGuard } from '../../shared/middleware/tenant.middleware.js';
import { ComplianceController } from './compliance.controller.js';
import type { ChainOfCustodyService } from './chain-of-custody.service.js';

export interface ComplianceRoutesOptions extends FastifyPluginOptions {
  complianceService: ChainOfCustodyService;
}

const preAuth = [authenticate, tenantGuard] as const;

export async function complianceRoutes(
  app: FastifyInstance,
  options: ComplianceRoutesOptions,
): Promise<void> {
  const ctrl = new ComplianceController(options.complianceService);

  app.get('/:id/chain-of-custody', {
    preHandler: [...preAuth, authorize('client', 'dispatcher', 'supervisor')],
    handler: ctrl.getChainOfCustody.bind(ctrl),
  });

  app.get('/:id/chain-of-custody/pdf', {
    preHandler: [...preAuth, authorize('dispatcher', 'supervisor')],
    handler: ctrl.getChainOfCustodyPdf.bind(ctrl),
  });

  app.get('/:id/signatures', {
    preHandler: [...preAuth, authorize('dispatcher', 'supervisor')],
    handler: ctrl.getSignatures.bind(ctrl),
  });
}
