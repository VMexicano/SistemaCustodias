import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ClientsService } from './clients.service.js';

export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      userId: string;
      companyId?: string;
      companyName?: string;
      rfc?: string;
      contactName: string;
      creditLimitMxn?: number;
    };
    const client = await this.service.create(body);
    return reply.status(201).send(client);
  }

  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const client = await this.service.getMe(request.user!.sub);
    return reply.send(client);
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.user!.tenant_id!;
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(0, parseInt(query.page ?? '0', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const result = await this.service.list(tenantId, page, limit);
    return reply.send(result);
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const client = await this.service.getById(id);
    return reply.send(client);
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as {
      companyName?: string;
      rfc?: string;
      contactName?: string;
      creditLimitMxn?: number;
    };
    const client = await this.service.update(id, body);
    return reply.send(client);
  }

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    await this.service.remove(id);
    return reply.status(204).send();
  }
}
