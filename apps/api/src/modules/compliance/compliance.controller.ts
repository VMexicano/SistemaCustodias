import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ChainOfCustodyService } from './chain-of-custody.service.js';

export class ComplianceController {
  constructor(private readonly service: ChainOfCustodyService) {}

  async getChainOfCustody(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorRole = request.user!.roles[0] ?? 'unknown';
    const report = await this.service.buildReport(id, actorRole);
    return reply.send(report);
  }

  async getChainOfCustodyPdf(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const actorRole = request.user!.roles[0] ?? 'unknown';
    const buffer = await this.service.buildPdf(id, actorRole);
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="chain-of-custody-${id}.pdf"`)
      .send(buffer);
  }

  async getSignatures(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const signatures = await this.service.getSignatures(id);
    return reply.send(signatures);
  }
}
