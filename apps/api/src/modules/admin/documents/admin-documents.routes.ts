import type { FastifyInstance, FastifyPluginOptions, RouteHandlerMethod } from 'fastify';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { authorize } from '../../../shared/middleware/authorize.js';
import { AdminDocumentsController } from './admin-documents.controller.js';
import type { AdminDocumentsService } from './admin-documents.service.js';

const reviewDocumentSchema = {
  params: {
    type: 'object',
    required: ['documentId'],
    properties: {
      documentId: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['approved', 'rejected'] },
      rejectionReason: { type: 'string', minLength: 1, maxLength: 500 },
    },
  },
};

export interface AdminDocumentsRoutesOptions extends FastifyPluginOptions {
  adminDocumentsService: AdminDocumentsService;
}

export async function adminDocumentsRoutes(
  app: FastifyInstance,
  options: AdminDocumentsRoutesOptions,
): Promise<void> {
  const controller = new AdminDocumentsController(options.adminDocumentsService);

  // PATCH /admin/documents/:documentId
  app.patch('/documents/:documentId', {
    schema: reviewDocumentSchema,
    preHandler: [authenticate, authorize('admin')],
    handler: controller.reviewDocument.bind(controller) as RouteHandlerMethod,
  });
}
