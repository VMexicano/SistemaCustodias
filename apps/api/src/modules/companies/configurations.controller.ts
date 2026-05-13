import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ConfigurationsService } from './configurations.service.js';

interface EntityParams {
  entityType: string;
  entityId: string;
}

interface ConfigParams extends EntityParams {
  namespace: string;
  key: string;
}

interface UpsertBody {
  value: unknown;
}

export class ConfigurationsController {
  constructor(private readonly configurationsService: ConfigurationsService) {}

  async getGrouped(
    request: FastifyRequest<{ Params: EntityParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await this.configurationsService.getGrouped(
      request.params.entityType,
      request.params.entityId,
    );
    await reply.status(200).send(result);
  }

  async upsert(
    request: FastifyRequest<{ Params: ConfigParams; Body: UpsertBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { entityType, entityId, namespace, key } = request.params;
    const entry = await this.configurationsService.upsert(entityType, entityId, namespace, key, request.body.value);
    await reply.status(200).send(entry);
  }

  async delete(
    request: FastifyRequest<{ Params: ConfigParams }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { entityType, entityId, namespace, key } = request.params;
    await this.configurationsService.delete(entityType, entityId, namespace, key);
    await reply.status(204).send();
  }
}
