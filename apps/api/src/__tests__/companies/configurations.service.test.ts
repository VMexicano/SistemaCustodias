import { ConfigurationsService } from '../../modules/companies/configurations.service.js';
import type { ConfigurationsRepository } from '../../modules/companies/configurations.repository.js';
import { BusinessError } from '../../shared/errors/business-error.js';

function makeRepo(): jest.Mocked<ConfigurationsRepository> {
  return {
    upsert: jest.fn(),
    findAllByEntity: jest.fn(),
    deleteOne: jest.fn(),
  } as unknown as jest.Mocked<ConfigurationsRepository>;
}

describe('ConfigurationsService', () => {
  let repo: jest.Mocked<ConfigurationsRepository>;
  let service: ConfigurationsService;

  beforeEach(() => {
    repo = makeRepo();
    service = new ConfigurationsService(repo);
  });

  describe('upsert', () => {
    it('creates entry when it does not exist', async () => {
      const entry = {
        id: 'cfg-1', entity_type: 'company' as const, entity_id: 'comp-1',
        namespace: 'pricing', key: 'discount_pct', value: 10,
        created_at: new Date(), updated_at: new Date(),
      };
      repo.upsert.mockResolvedValue(entry);

      const result = await service.upsert('company', 'comp-1', 'pricing', 'discount_pct', 10);

      expect(repo.upsert).toHaveBeenCalledWith('company', 'comp-1', 'pricing', 'discount_pct', 10);
      expect(result.value).toBe(10);
    });

    it('updates existing entry (same entity+namespace+key)', async () => {
      const entry = {
        id: 'cfg-1', entity_type: 'company' as const, entity_id: 'comp-1',
        namespace: 'pricing', key: 'discount_pct', value: 20,
        created_at: new Date(), updated_at: new Date(),
      };
      repo.upsert.mockResolvedValue(entry);

      const result = await service.upsert('company', 'comp-1', 'pricing', 'discount_pct', 20);

      expect(result.value).toBe(20);
    });
  });

  describe('getGrouped', () => {
    it('returns object grouped by namespace', async () => {
      repo.findAllByEntity.mockResolvedValue({
        pricing: { discount_pct: 10, min_fare_override: 30 },
        notifications: { sms_enabled: false },
      });

      const result = await service.getGrouped('company', 'comp-1');

      expect(Object.keys(result)).toContain('pricing');
      expect(Object.keys(result)).toContain('notifications');
      expect(result['pricing']!['discount_pct']).toBe(10);
    });
  });

  describe('delete', () => {
    it('deletes entry correctly', async () => {
      repo.deleteOne.mockResolvedValue(undefined);

      await expect(service.delete('company', 'comp-1', 'pricing', 'discount_pct')).resolves.toBeUndefined();
    });

    it('propagates CONFIG_NOT_FOUND', async () => {
      repo.deleteOne.mockRejectedValue(new BusinessError('CONFIG_NOT_FOUND'));

      await expect(service.delete('company', 'comp-1', 'pricing', 'nonexistent')).rejects.toThrow(
        new BusinessError('CONFIG_NOT_FOUND'),
      );
    });
  });

  describe('entityType validation', () => {
    it('throws INVALID_ENTITY_TYPE for unknown type', async () => {
      await expect(service.upsert('unknown', 'id-1', 'ns', 'key', 'val')).rejects.toThrow(
        BusinessError,
      );
      await expect(service.upsert('unknown', 'id-1', 'ns', 'key', 'val')).rejects.toMatchObject({
        code: 'INVALID_ENTITY_TYPE',
      });
    });

    it('accepts all valid entity types', async () => {
      repo.findAllByEntity.mockResolvedValue({});
      for (const type of ['company', 'user', 'vertical']) {
        await expect(service.getGrouped(type, 'some-id')).resolves.toBeDefined();
      }
    });
  });
});
