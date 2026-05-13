import type { Database } from '../../config/database.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { AdminConfigRepository, PricingFactor, CommissionRule, TripType } from './admin-config.repository.js';

export interface UpdateFactorInput {
  active?: boolean;
  value?: number;
}

export interface UpdateCommissionInput {
  platformFeePct: number;
}

export interface CreateTripTypeInput {
  code: string;
  name: string;
  description: string;
  baseFare: number;
  costPerKm: number;
  costPerMin: number;
  minFare: number;
  serviceMode?: string;
}

export interface UpdateTripTypeInput {
  name?: string;
  description?: string;
  baseFare?: number;
  costPerKm?: number;
  costPerMin?: number;
  minFare?: number;
  active?: boolean;
}

export class AdminConfigService {
  constructor(
    private readonly repo: AdminConfigRepository,
    private readonly db: Database,
  ) {}

  // ---------------------------------------------------------------------------
  // Pricing factors
  // ---------------------------------------------------------------------------

  async getFactors(): Promise<PricingFactor[]> {
    return this.repo.getFactors();
  }

  async updateFactor(
    id: string,
    data: UpdateFactorInput,
    actorId: string,
  ): Promise<PricingFactor> {
    const existing = await this.repo.getFactorById(id);
    if (!existing) {
      throw new BusinessError('FACTOR_NOT_FOUND', `Pricing factor ${id} not found`);
    }

    const updated = await this.repo.updateFactor(id, data);

    await this.db('audit_logs').insert({
      entity_type: 'pricing_factor',
      entity_id: id,
      action: 'update',
      actor_type: 'admin',
      actor_id: actorId,
      old_value: JSON.stringify(existing),
      new_value: JSON.stringify(updated),
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Commission rules
  // ---------------------------------------------------------------------------

  async getCommissions(): Promise<CommissionRule[]> {
    return this.repo.getCommissions();
  }

  async updateCommission(
    id: string,
    data: UpdateCommissionInput,
    actorId: string,
  ): Promise<CommissionRule> {
    if (data.platformFeePct < 0 || data.platformFeePct > 100) {
      throw new BusinessError('INVALID_FEE_PCT', 'platformFeePct must be between 0 and 100');
    }

    const existing = await this.repo.getCommissionById(id);
    if (!existing) {
      throw new BusinessError('COMMISSION_NOT_FOUND', `Commission rule ${id} not found`);
    }

    const updated = await this.repo.updateCommission(id, data);

    await this.db('audit_logs').insert({
      entity_type: 'commission_rule',
      entity_id: id,
      action: 'update',
      actor_type: 'admin',
      actor_id: actorId,
      old_value: JSON.stringify(existing),
      new_value: JSON.stringify(updated),
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Trip types
  // ---------------------------------------------------------------------------

  async getTripTypes(): Promise<TripType[]> {
    return this.repo.getTripTypes();
  }

  async createTripType(data: CreateTripTypeInput, actorId: string): Promise<TripType> {
    const regionId = await this.repo.getDefaultRegionId();
    if (!regionId) {
      throw new BusinessError('VALIDATION_ERROR', 'No se encontró la región MX');
    }

    const created = await this.repo.createTripType({
      regionId,
      code: data.code.toLowerCase().replace(/\s+/g, '_'),
      name: data.name,
      description: data.description,
      baseFare: data.baseFare,
      costPerKm: data.costPerKm,
      costPerMin: data.costPerMin,
      minFare: data.minFare,
      serviceMode: data.serviceMode ?? 'people',
    });

    await this.db('audit_logs').insert({
      entity_type: 'trip_type',
      entity_id: created.id,
      action: 'create',
      actor_type: 'admin',
      actor_id: actorId,
      old_value: null,
      new_value: JSON.stringify(created),
    });

    return created;
  }

  async updateTripType(
    id: string,
    data: UpdateTripTypeInput,
    actorId: string,
  ): Promise<TripType> {
    const existing = await this.repo.getTripTypeById(id);
    if (!existing) {
      throw new BusinessError('TRIP_TYPE_NOT_FOUND', `Trip type ${id} not found`);
    }

    const updated = await this.repo.updateTripType(id, data);

    await this.db('audit_logs').insert({
      entity_type: 'trip_type',
      entity_id: id,
      action: 'update',
      actor_type: 'admin',
      actor_id: actorId,
      old_value: JSON.stringify(existing),
      new_value: JSON.stringify(updated),
    });

    return updated;
  }
}
