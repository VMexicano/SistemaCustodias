import type { FastifyRequest, FastifyReply } from 'fastify';
import type { OperadoresService } from './operadores.service.js';
import type { OperatorType } from './operadores.types.js';

export class OperadoresController {
  constructor(private readonly service: OperadoresService) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      userId: string;
      operatorType: OperatorType;
      licenseNumber?: string;
      certifications?: Record<string, string>;
    };
    const operator = await this.service.create(body);
    return reply.status(201).send(operator);
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.user!.tenant_id!;
    const query = request.query as {
      operator_type?: string;
      status?: string;
      page?: string;
      limit?: string;
    };
    const page = Math.max(0, parseInt(query.page ?? '0', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const result = await this.service.list(tenantId, { operator_type: query.operator_type as OperatorType | undefined, status: query.status }, page, limit);
    return reply.send(result);
  }

  async listAvailable(request: FastifyRequest, reply: FastifyReply) {
    const tenantId = request.user!.tenant_id!;
    const query = request.query as { operator_type?: string };
    const operators = await this.service.listAvailable(tenantId, query.operator_type as OperatorType | undefined);
    return reply.send({ data: operators });
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const operator = await this.service.getById(id);
    return reply.send(operator);
  }

  async updateStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as { status: 'available' | 'busy' | 'offline' };
    const operator = await this.service.updateStatus(id, body);
    return reply.send(operator);
  }

  async suspend(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as { reason: string };
    const operator = await this.service.suspend(id, body);
    return reply.send(operator);
  }

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    await this.service.remove(id);
    return reply.status(204).send();
  }
}
