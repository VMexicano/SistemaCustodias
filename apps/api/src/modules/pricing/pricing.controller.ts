import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PricingService } from './pricing.service.js';
import type { LatLng, PricingModel } from './pricing.types.js';

interface EstimateBody {
  origin: LatLng;
  destination: LatLng;
  trip_type_id: string;
  pricing_model?: PricingModel;
  weight_kg?: number;
}

export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  async listTripTypes(
    _request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const types = await this.pricingService.listTripTypes();
    await reply.status(200).send(types);
  }

  async estimate(
    request: FastifyRequest<{ Body: EstimateBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { origin, destination, trip_type_id, pricing_model, weight_kg } = request.body;

    const result = await this.pricingService.estimate({
      origin,
      destination,
      trip_type_id,
      pricingModel: pricing_model,
      weightKg: weight_kg,
    });

    await reply.status(200).send(result);
  }
}
