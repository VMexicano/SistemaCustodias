import type { Knex } from 'knex';
import { BusinessError } from '../../shared/errors/business-error.js';

export interface VerticalFeatures {
  scheduling: boolean;
  multiStop: boolean;
  cargoDeclaration: boolean;
  chainOfCustody: boolean;
  temperatureLog: boolean;
  b2bAccounts: boolean;
  pricingModel: 'per_km_min' | 'per_declared_value' | 'flat_rate';
  requiresApproval?: boolean;
}

export interface Vertical {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  features: VerticalFeatures;
  config: Record<string, unknown>;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export class VerticalsRepository {
  constructor(private readonly db: Knex) {}

  async findBySlug(slug: string): Promise<Vertical> {
    const row = await this.db('verticals').where({ slug }).first();
    if (!row) throw new BusinessError('VERTICAL_NOT_FOUND', `Vertical '${slug}' not found`);
    return row as Vertical;
  }

  async findAll(): Promise<Vertical[]> {
    return this.db('verticals').where({ active: true }).orderBy('slug') as Promise<Vertical[]>;
  }

  async update(slug: string, patch: Partial<Pick<Vertical, 'name' | 'features' | 'config'>>): Promise<Vertical> {
    const rows = await this.db('verticals')
      .where({ slug })
      .update({ ...patch, updated_at: this.db.fn.now() })
      .returning('*');
    if (!rows.length) throw new BusinessError('VERTICAL_NOT_FOUND', `Vertical '${slug}' not found`);
    return rows[0] as Vertical;
  }
}
