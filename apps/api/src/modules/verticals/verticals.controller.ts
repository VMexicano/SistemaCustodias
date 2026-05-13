import type { FastifyRequest, FastifyReply } from 'fastify';
import type { VerticalsService } from './verticals.service.js';
import type { VerticalFeatures } from './verticals.repository.js';

interface SlugParams {
  slug: string;
}

interface UpdateVerticalBody {
  name?: string;
  features?: Partial<VerticalFeatures>;
  config?: Record<string, unknown>;
}

export class VerticalsController {
  constructor(private readonly verticalsService: VerticalsService) {}

  async getConfig(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const vertical = await this.verticalsService.getConfig();
    await reply.status(200).send({
      slug: vertical.slug,
      name: vertical.name,
      description: vertical.description,
      features: vertical.features,
      config: vertical.config,
    });
  }

  async getAll(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const verticals = await this.verticalsService.getAll();
    await reply.status(200).send(
      verticals.map((v) => ({
        id: v.id,
        slug: v.slug,
        name: v.name,
        features: v.features,
        active: v.active,
      })),
    );
  }

  async updateVertical(
    request: FastifyRequest<{ Params: SlugParams; Body: UpdateVerticalBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { slug } = request.params;
    const vertical = await this.verticalsService.updateFeatures(slug, request.body);
    await reply.status(200).send(vertical);
  }
}
