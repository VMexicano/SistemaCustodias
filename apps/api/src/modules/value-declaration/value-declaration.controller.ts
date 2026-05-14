import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ValueDeclarationService } from './value-declaration.service.js';

interface RequestWithUser {
  user: { userId: string; role: string; tenantId: string };
}

export class ValueDeclarationController {
  constructor(private readonly service: ValueDeclarationService) {}

  async upsert(
    request: FastifyRequest<{
      Params: { id: string };
      Body: { declaredValue: Record<string, unknown>; insurancePolicyId?: string };
    }> & RequestWithUser,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const result = await this.service.upsert({
      orderId: request.params.id,
      actorUserId: request.user.userId,
      declaredValue: request.body.declaredValue,
      insurancePolicyId: request.body.insurancePolicyId,
    });
    return reply.status(200).send({ data: result });
  }

  async getByOrderId(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const result = await this.service.getByOrderId(request.params.id);
    return reply.status(200).send({ data: result });
  }
}
