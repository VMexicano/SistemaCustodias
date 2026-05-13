import type { Redis } from 'ioredis';
import type { VerticalsRepository, Vertical, VerticalFeatures } from './verticals.repository.js';

const CACHE_TTL = 60; // seconds

function cacheKey(slug: string): string {
  return `vertical:config:${slug}`;
}

export class VerticalsService {
  constructor(
    private readonly verticalsRepo: VerticalsRepository,
    private readonly redis: Redis,
    private readonly verticalSlug: string,
  ) {}

  async getConfig(): Promise<Vertical> {
    const cached = await this.redis.get(cacheKey(this.verticalSlug));
    if (cached) return JSON.parse(cached) as Vertical;

    const vertical = await this.verticalsRepo.findBySlug(this.verticalSlug);
    await this.redis.setex(cacheKey(this.verticalSlug), CACHE_TTL, JSON.stringify(vertical));
    return vertical;
  }

  async getAll(): Promise<Vertical[]> {
    return this.verticalsRepo.findAll();
  }

  async updateFeatures(
    slug: string,
    patch: { features?: Partial<VerticalFeatures>; config?: Record<string, unknown>; name?: string },
  ): Promise<Vertical> {
    const current = await this.verticalsRepo.findBySlug(slug);
    const updated = await this.verticalsRepo.update(slug, {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.features !== undefined && { features: { ...current.features, ...patch.features } }),
      ...(patch.config !== undefined && { config: { ...current.config, ...patch.config } }),
    });
    await this.redis.del(cacheKey(slug));
    return updated;
  }
}
