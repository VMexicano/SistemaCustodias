import type { Knex } from 'knex';
import { BusinessError } from '../../shared/errors/business-error.js';

export type EntityType = 'company' | 'user' | 'vertical';

export interface ConfigEntry {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  namespace: string;
  key: string;
  value: unknown;
  created_at: Date;
  updated_at: Date;
}

export class ConfigurationsRepository {
  constructor(private readonly db: Knex) {}

  async upsert(
    entityType: EntityType,
    entityId: string,
    namespace: string,
    key: string,
    value: unknown,
  ): Promise<ConfigEntry> {
    const rows = await this.db('configurations')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        namespace,
        key,
        value: JSON.stringify(value),
      })
      .onConflict(['entity_type', 'entity_id', 'namespace', 'key'])
      .merge({ value: JSON.stringify(value), updated_at: this.db.fn.now() })
      .returning('*');
    return rows[0] as ConfigEntry;
  }

  async findAllByEntity(
    entityType: EntityType,
    entityId: string,
  ): Promise<Record<string, Record<string, unknown>>> {
    const rows = await this.db('configurations').where({
      entity_type: entityType,
      entity_id: entityId,
    }) as ConfigEntry[];

    const grouped: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      if (!grouped[row.namespace]) grouped[row.namespace] = {};
      grouped[row.namespace]![row.key] = row.value;
    }
    return grouped;
  }

  async deleteOne(
    entityType: EntityType,
    entityId: string,
    namespace: string,
    key: string,
  ): Promise<void> {
    const deleted = await this.db('configurations')
      .where({ entity_type: entityType, entity_id: entityId, namespace, key })
      .delete();
    if (!deleted) throw new BusinessError('CONFIG_NOT_FOUND', 'Configuration entry not found');
  }
}
