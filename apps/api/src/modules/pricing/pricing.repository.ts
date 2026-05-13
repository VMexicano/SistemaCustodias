import type { Database } from '../../config/database.js';
import type { TripTypeRow, PricingFactorRow } from './pricing-engine.js';

export interface RegionConfig {
  id: string;
  country_code: string;
  tax_rate: number;
}

export class PricingRepository {
  constructor(private readonly db: Database) {}

  async listActiveTripTypes(): Promise<Array<{ id: string; code: string; name: string; description: string; base_fare: number; service_mode: string }>> {
    return this.db('trip_types')
      .where({ active: true })
      .select('id', 'code', 'name', 'description', 'base_fare', 'service_mode')
      .orderBy('base_fare', 'asc');
  }

  async findTripTypeById(id: string): Promise<TripTypeRow | null> {
    const row = await this.db('trip_types')
      .where({ id, active: true })
      .select<TripTypeRow>('id', 'region_id', 'base_fare', 'cost_per_km', 'cost_per_minute', 'min_fare')
      .first();
    return row ?? null;
  }

  async findActiveFactors(regionId: string): Promise<PricingFactorRow[]> {
    return this.db('pricing_factors')
      .where({ region_id: regionId, active: true })
      .select<PricingFactorRow[]>('id', 'code', 'type', 'value', 'priority', 'stackable')
      .orderBy('priority', 'asc');
  }

  async findRegionConfig(regionId: string): Promise<RegionConfig | null> {
    const row = await this.db('region_config')
      .where({ id: regionId })
      .select<RegionConfig>('id', 'country_code', 'tax_rate')
      .first();
    return row ?? null;
  }
}
