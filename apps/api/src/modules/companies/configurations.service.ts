import { BusinessError } from '../../shared/errors/business-error.js';
import type { ConfigurationsRepository, EntityType } from './configurations.repository.js';

const VALID_ENTITY_TYPES: EntityType[] = ['company', 'user', 'vertical'];

export class ConfigurationsService {
  constructor(private readonly configurationsRepo: ConfigurationsRepository) {}

  private validateEntityType(entityType: string): EntityType {
    if (!VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
      throw new BusinessError('INVALID_ENTITY_TYPE', `entityType must be one of: ${VALID_ENTITY_TYPES.join(', ')}`);
    }
    return entityType as EntityType;
  }

  async upsert(
    entityType: string,
    entityId: string,
    namespace: string,
    key: string,
    value: unknown,
  ) {
    const type = this.validateEntityType(entityType);
    return this.configurationsRepo.upsert(type, entityId, namespace, key, value);
  }

  async getGrouped(entityType: string, entityId: string): Promise<Record<string, Record<string, unknown>>> {
    const type = this.validateEntityType(entityType);
    return this.configurationsRepo.findAllByEntity(type, entityId);
  }

  async delete(entityType: string, entityId: string, namespace: string, key: string): Promise<void> {
    const type = this.validateEntityType(entityType);
    return this.configurationsRepo.deleteOne(type, entityId, namespace, key);
  }
}
