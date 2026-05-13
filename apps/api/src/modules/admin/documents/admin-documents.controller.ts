import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AdminDocumentsService } from './admin-documents.service.js';

interface ReviewDocumentParams {
  documentId: string;
}

interface ReviewDocumentBody {
  status: 'approved' | 'rejected';
  rejectionReason?: string;
}

export class AdminDocumentsController {
  constructor(private readonly adminDocumentsService: AdminDocumentsService) {}

  async reviewDocument(
    request: FastifyRequest<{ Params: ReviewDocumentParams; Body: ReviewDocumentBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const adminId = request.user!.sub;
    const { documentId } = request.params;
    const result = await this.adminDocumentsService.reviewDocument(adminId, documentId, request.body);
    await reply.status(200).send(result);
  }
}
