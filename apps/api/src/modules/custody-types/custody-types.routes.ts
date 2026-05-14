import type { FastifyInstance } from 'fastify';
import type { ValueDeclarationService } from '../value-declaration/value-declaration.service.js';

export async function custodyTypesRoutes(
  app: FastifyInstance,
  options: { valueDeclarationService: ValueDeclarationService },
): Promise<void> {
  app.get('/', async (_request, reply) => {
    const types = await options.valueDeclarationService.listCustodyTypes();
    return reply.status(200).send({ data: types });
  });
}
