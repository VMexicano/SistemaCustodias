import { BusinessError } from '../../shared/errors/business-error.js';
import type { PricingRepository } from './pricing.repository.js';
import type { PricingEngine } from './pricing-engine.js';
import type { EstimateInput, PriceEstimate } from './pricing.types.js';

export class PricingService {
  constructor(
    private readonly pricingRepo: PricingRepository,
    private readonly pricingEngine: PricingEngine,
  ) {}

  async listTripTypes() {
    return this.pricingRepo.listActiveTripTypes();
  }

  async estimate(input: EstimateInput): Promise<PriceEstimate> {
    // Validate origin !== destination
    if (
      input.origin.lat === input.destination.lat &&
      input.origin.lng === input.destination.lng
    ) {
      throw new BusinessError('ORIGIN_EQUALS_DESTINATION', 'Origin and destination cannot be the same');
    }

    // Load trip type — already scoped to the right region
    const tripType = await this.pricingRepo.findTripTypeById(input.trip_type_id);
    if (!tripType) {
      throw new BusinessError('TRIP_TYPE_NOT_FOUND', `Trip type ${input.trip_type_id} not found or inactive`);
    }

    // Load active factors for the trip type's region (by UUID from trip type)
    const activeFactors = await this.pricingRepo.findActiveFactors(tripType.region_id);

    // Load region config for tax rate (by UUID from trip type)
    const regionConfig = await this.pricingRepo.findRegionConfig(tripType.region_id);
    const taxPct = regionConfig ? Number(regionConfig.tax_rate) : 0;

    // Calculate estimate
    const estimate = this.pricingEngine.estimate({
      origin: input.origin,
      destination: input.destination,
      tripType,
      activeFactors,
      regionTaxPct: taxPct,
      pricingModel: input.pricingModel,
      weightKg: input.weightKg,
    });

    // Validate distance limit
    if (estimate.estimated_distance_km > 200) {
      throw new BusinessError('DISTANCE_EXCEEDS_LIMIT', 'Distance exceeds the 200km limit');
    }

    return estimate;
  }
}
