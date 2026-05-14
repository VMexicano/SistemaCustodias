import type { FastifyRequest, FastifyReply } from 'fastify';
import type { VehiclesService } from './vehicles.service.js';

export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  async create(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      plate: string;
      make?: string;
      model: string;
      year: number;
      gpsDeviceId?: string;
    };
    const vehicle = await this.service.create(body);
    return reply.status(201).send(vehicle);
  }

  async list(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as { active?: string; page?: string; limit?: string };
    const page = Math.max(0, parseInt(query.page ?? '0', 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const active = query.active !== undefined ? query.active === 'true' : undefined;
    const result = await this.service.list({ active }, page, limit);
    return reply.send(result);
  }

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const vehicle = await this.service.getById(id);
    return reply.send(vehicle);
  }

  async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = request.body as {
      make?: string;
      model?: string;
      year?: number;
      gpsDeviceId?: string;
    };
    const vehicle = await this.service.update(id, body);
    return reply.send(vehicle);
  }

  async assign(request: FastifyRequest, reply: FastifyReply) {
    const { id, operatorId } = request.params as { id: string; operatorId: string };
    const result = await this.service.assignToOperator(id, operatorId);
    return reply.send(result);
  }

  async remove(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    await this.service.remove(id);
    return reply.status(204).send();
  }
}
