/**
 * verticals.repository.test.ts — unit tests for VerticalsRepository
 *
 * Covers the null-check branches in findBySlug and update.
 */

import { VerticalsRepository } from '../../modules/verticals/verticals.repository.js';
import type { Vertical } from '../../modules/verticals/verticals.repository.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function makeVertical(overrides: Partial<Vertical> = {}): Vertical {
  return {
    id: 'v-1',
    slug: 'taxi',
    name: 'Taxi MX',
    description: null,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VerticalsRepository', () => {
  describe('findBySlug()', () => {
    it('returns vertical when found', async () => {
      const vertical = makeVertical();
      const firstMock = jest.fn().mockResolvedValue(vertical);
      const whereMock = jest.fn().mockReturnValue({ first: firstMock });
      const db = jest.fn().mockReturnValue({ where: whereMock });

      const repo = new VerticalsRepository(db as never);
      const result = await repo.findBySlug('taxi');

      expect(result.slug).toBe('taxi');
      expect(whereMock).toHaveBeenCalledWith({ slug: 'taxi' });
    });

    it('throws VERTICAL_NOT_FOUND when slug does not exist', async () => {
      const firstMock = jest.fn().mockResolvedValue(undefined);
      const whereMock = jest.fn().mockReturnValue({ first: firstMock });
      const db = jest.fn().mockReturnValue({ where: whereMock });

      const repo = new VerticalsRepository(db as never);

      await expect(repo.findBySlug('unknown')).rejects.toMatchObject({
        code: 'VERTICAL_NOT_FOUND',
      });
    });
  });

  describe('findAll()', () => {
    it('returns active verticals ordered by slug', async () => {
      const verticals = [makeVertical(), makeVertical({ slug: 'custody' })];
      const orderByMock = jest.fn().mockResolvedValue(verticals);
      const whereMock = jest.fn().mockReturnValue({ orderBy: orderByMock });
      const db = jest.fn().mockReturnValue({ where: whereMock });

      const repo = new VerticalsRepository(db as never);
      const result = await repo.findAll();

      expect(result).toHaveLength(2);
      expect(whereMock).toHaveBeenCalledWith({ active: true });
    });
  });

  describe('update()', () => {
    it('returns updated vertical on success', async () => {
      const updated = makeVertical({ name: 'Taxi Updated' });
      const returningMock = jest.fn().mockResolvedValue([updated]);
      const updateMock = jest.fn().mockReturnValue({ returning: returningMock });
      const whereMock = jest.fn().mockReturnValue({ update: updateMock });
      const db = jest.fn().mockReturnValue({ where: whereMock });
      (db as never as { fn: { now: jest.Mock } }).fn = { now: jest.fn().mockReturnValue('NOW()') };

      const repo = new VerticalsRepository(db as never);
      const result = await repo.update('taxi', { name: 'Taxi Updated' });

      expect(result.name).toBe('Taxi Updated');
    });

    it('throws VERTICAL_NOT_FOUND when update returns no rows', async () => {
      const returningMock = jest.fn().mockResolvedValue([]);
      const updateMock = jest.fn().mockReturnValue({ returning: returningMock });
      const whereMock = jest.fn().mockReturnValue({ update: updateMock });
      const db = jest.fn().mockReturnValue({ where: whereMock });
      (db as never as { fn: { now: jest.Mock } }).fn = { now: jest.fn().mockReturnValue('NOW()') };

      const repo = new VerticalsRepository(db as never);

      await expect(repo.update('nonexistent', { name: 'X' })).rejects.toMatchObject({
        code: 'VERTICAL_NOT_FOUND',
      });
    });
  });
});
