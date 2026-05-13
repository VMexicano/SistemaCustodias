import type { Knex } from 'knex';

export interface PricingFactor {
  id: string;
  regionId: string;
  code: string;
  name: string;
  type: string;
  value: number;
  stackable: boolean;
  priority: number;
  active: boolean;
}

export interface CommissionRule {
  id: string;
  regionId: string;
  platformFeePct: number;
  active: boolean;
  validFrom: string | null;
  validUntil: string | null;
}

export interface TripType {
  id: string;
  regionId: string;
  code: string;
  name: string;
  description: string;
  baseFare: number;
  costPerKm: number;
  costPerMin: number;
  minFare: number;
  serviceMode: string;
  active: boolean;
}

function mapFactor(row: Record<string, unknown>): PricingFactor {
  return {
    id: row['id'] as string,
    regionId: row['region_id'] as string,
    code: row['code'] as string,
    name: row['name'] as string,
    type: row['type'] as string,
    value: Number(row['value']),
    stackable: Boolean(row['stackable']),
    priority: Number(row['priority']),
    active: Boolean(row['active']),
  };
}

function mapCommission(row: Record<string, unknown>): CommissionRule {
  return {
    id: row['id'] as string,
    regionId: row['region_id'] as string,
    platformFeePct: Number(row['platform_fee_pct']),
    active: Boolean(row['active']),
    validFrom: row['valid_from'] ? String(row['valid_from']) : null,
    validUntil: row['valid_until'] ? String(row['valid_until']) : null,
  };
}

function mapTripType(row: Record<string, unknown>): TripType {
  return {
    id: row['id'] as string,
    regionId: row['region_id'] as string,
    code: row['code'] as string,
    name: row['name'] as string,
    description: (row['description'] as string) ?? '',
    baseFare: Number(row['base_fare']),
    costPerKm: Number(row['cost_per_km']),
    costPerMin: Number(row['cost_per_minute']),
    minFare: Number(row['min_fare']),
    serviceMode: row['service_mode'] as string,
    active: Boolean(row['active']),
  };
}

export class AdminConfigRepository {
  constructor(private readonly db: Knex) {}

  // ---------------------------------------------------------------------------
  // Pricing factors
  // ---------------------------------------------------------------------------

  async getFactors(): Promise<PricingFactor[]> {
    const rows = await this.db('pricing_factors').orderBy('priority', 'asc');
    return rows.map(mapFactor);
  }

  async getFactorById(id: string): Promise<PricingFactor | null> {
    const row = await this.db('pricing_factors').where({ id }).first();
    return row ? mapFactor(row) : null;
  }

  async updateFactor(
    id: string,
    data: { active?: boolean; value?: number },
  ): Promise<PricingFactor> {
    const updateData: Record<string, unknown> = {};
    if (data.active !== undefined) updateData['active'] = data.active;
    if (data.value !== undefined) updateData['value'] = data.value;

    const [updated] = await this.db('pricing_factors')
      .where({ id })
      .update({ ...updateData, updated_at: new Date() })
      .returning('*');
    return mapFactor(updated);
  }

  // ---------------------------------------------------------------------------
  // Commission rules
  // ---------------------------------------------------------------------------

  async getCommissions(): Promise<CommissionRule[]> {
    const rows = await this.db('commission_rules').orderBy('created_at', 'desc');
    return rows.map(mapCommission);
  }

  async getCommissionById(id: string): Promise<CommissionRule | null> {
    const row = await this.db('commission_rules').where({ id }).first();
    return row ? mapCommission(row) : null;
  }

  async updateCommission(
    id: string,
    data: { platformFeePct: number },
  ): Promise<CommissionRule> {
    const [updated] = await this.db('commission_rules')
      .where({ id })
      .update({ platform_fee_pct: data.platformFeePct, updated_at: new Date() })
      .returning('*');
    return mapCommission(updated);
  }

  // ---------------------------------------------------------------------------
  // Trip types
  // ---------------------------------------------------------------------------

  async getTripTypes(): Promise<TripType[]> {
    const rows = await this.db('trip_types').orderBy('base_fare', 'asc');
    return rows.map(mapTripType);
  }

  async getDefaultRegionId(): Promise<string | null> {
    const row = await this.db('region_config').where({ country_code: 'MX' }).select('id').first();
    return row ? (row['id'] as string) : null;
  }

  async createTripType(data: {
    regionId: string;
    code: string;
    name: string;
    description: string;
    baseFare: number;
    costPerKm: number;
    costPerMin: number;
    minFare: number;
    serviceMode: string;
  }): Promise<TripType> {
    const [row] = await this.db('trip_types')
      .insert({
        region_id: data.regionId,
        code: data.code,
        name: data.name,
        description: data.description,
        base_fare: data.baseFare,
        cost_per_km: data.costPerKm,
        cost_per_minute: data.costPerMin,
        min_fare: data.minFare,
        service_mode: data.serviceMode,
        active: true,
      })
      .returning('*');
    return mapTripType(row);
  }

  async getTripTypeById(id: string): Promise<TripType | null> {
    const row = await this.db('trip_types').where({ id }).first();
    return row ? mapTripType(row) : null;
  }

  async updateTripType(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      baseFare: number;
      costPerKm: number;
      costPerMin: number;
      minFare: number;
      active: boolean;
    }>,
  ): Promise<TripType> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData['name'] = data.name;
    if (data.description !== undefined) updateData['description'] = data.description;
    if (data.baseFare !== undefined) updateData['base_fare'] = data.baseFare;
    if (data.costPerKm !== undefined) updateData['cost_per_km'] = data.costPerKm;
    if (data.costPerMin !== undefined) updateData['cost_per_minute'] = data.costPerMin;
    if (data.minFare !== undefined) updateData['min_fare'] = data.minFare;
    if (data.active !== undefined) updateData['active'] = data.active;

    const [updated] = await this.db('trip_types')
      .where({ id })
      .update({ ...updateData, updated_at: new Date() })
      .returning('*');
    return mapTripType(updated);
  }
}
