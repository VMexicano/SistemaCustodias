import { VerticalsService } from '../../modules/verticals/verticals.service.js';
import type { VerticalsRepository, Vertical } from '../../modules/verticals/verticals.repository.js';
import { BusinessError } from '../../shared/errors/business-error.js';

function makeVertical(overrides: Partial<Vertical> = {}): Vertical {
  return {
    id: 'vert-1',
    slug: 'taxi',
    name: 'Taxi',
    description: 'Taxi urbano',
    features: {
      scheduling: true,
      multiStop: false,
      cargoDeclaration: false,
      chainOfCustody: false,
      temperatureLog: false,
      b2bAccounts: false,
      pricingModel: 'per_km_min',
    },
    config: {},
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeRepo(): jest.Mocked<VerticalsRepository> {
  return {
    findBySlug: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<VerticalsRepository>;
}

function makeRedis() {
  return {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
}

describe('VerticalsService', () => {
  let repo: jest.Mocked<VerticalsRepository>;
  let redis: ReturnType<typeof makeRedis>;
  let service: VerticalsService;

  beforeEach(() => {
    repo = makeRepo();
    redis = makeRedis();
    service = new VerticalsService(repo, redis as never, 'taxi');
  });

  describe('getConfig', () => {
    it('fetches from DB and caches in Redis on cache miss', async () => {
      const vertical = makeVertical();
      repo.findBySlug.mockResolvedValue(vertical);

      const result = await service.getConfig();

      expect(repo.findBySlug).toHaveBeenCalledWith('taxi');
      expect(redis.setex).toHaveBeenCalledWith('vertical:config:taxi', 60, JSON.stringify(vertical));
      expect(result).toEqual(vertical);
    });

    it('returns cached value on Redis hit without querying DB', async () => {
      const vertical = makeVertical();
      redis.get.mockResolvedValue(JSON.stringify(vertical));

      const result = await service.getConfig();

      expect(repo.findBySlug).not.toHaveBeenCalled();
      expect(result.slug).toBe(vertical.slug);
      expect(result.features).toEqual(vertical.features);
    });

    it('throws VERTICAL_NOT_FOUND when slug does not exist', async () => {
      repo.findBySlug.mockRejectedValue(new BusinessError('VERTICAL_NOT_FOUND'));

      await expect(service.getConfig()).rejects.toThrow(BusinessError);
    });
  });

  describe('getAll', () => {
    it('returns list of active verticals', async () => {
      const verticals = [makeVertical(), makeVertical({ slug: 'custody' })];
      repo.findAll.mockResolvedValue(verticals);

      const result = await service.getAll();

      expect(result).toHaveLength(2);
    });
  });

  describe('updateFeatures', () => {
    it('merges features and invalidates cache', async () => {
      const vertical = makeVertical();
      const updated = makeVertical({ name: 'Taxi Plus' });
      repo.findBySlug.mockResolvedValue(vertical);
      repo.update.mockResolvedValue(updated);

      const result = await service.updateFeatures('taxi', { name: 'Taxi Plus' });

      expect(repo.update).toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith('vertical:config:taxi');
      expect(result.name).toBe('Taxi Plus');
    });

    it('merges partial features without losing existing values', async () => {
      const vertical = makeVertical();
      const updated = makeVertical({ features: { ...vertical.features, scheduling: false } });
      repo.findBySlug.mockResolvedValue(vertical);
      repo.update.mockResolvedValue(updated);

      await service.updateFeatures('taxi', { features: { scheduling: false } });

      expect(repo.update).toHaveBeenCalledWith(
        'taxi',
        expect.objectContaining({
          features: expect.objectContaining({ scheduling: false, multiStop: false }),
        }),
      );
    });
  });
});
