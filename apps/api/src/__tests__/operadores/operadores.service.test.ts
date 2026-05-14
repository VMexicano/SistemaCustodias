import { OperadoresService } from '../../modules/operadores/operadores.service.js';
import type { OperadoresRepository } from '../../modules/operadores/operadores.repository.js';
import type { Operator } from '../../modules/operadores/operadores.types.js';

const makeOperator = (overrides: Partial<Operator> = {}): Operator => ({
  id: 'op-uuid',
  user_id: 'user-uuid',
  vehicle_id: null,
  operator_type: 'custodio',
  license_number: 'LIC-001',
  certifications: {},
  status: 'available',
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  ...overrides,
});

const makeRepo = (overrides: Partial<OperadoresRepository> = {}): OperadoresRepository =>
  ({
    findByUserId: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(undefined),
    findAvailable: jest.fn().mockResolvedValue([]),
    findByTenant: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    create: jest.fn().mockResolvedValue(makeOperator()),
    updateStatus: jest.fn().mockResolvedValue(makeOperator()),
    softDelete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as OperadoresRepository;

describe('OperadoresService', () => {
  describe('create', () => {
    it('creates an operator when no profile exists for the user', async () => {
      const repo = makeRepo();
      const service = new OperadoresService(repo);

      const result = await service.create({ userId: 'user-uuid', operatorType: 'custodio' });

      expect(repo.findByUserId).toHaveBeenCalledWith('user-uuid');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-uuid', operatorType: 'custodio' }),
      );
      expect(result.operatorType).toBe('custodio');
    });

    it('throws OPERATOR_ALREADY_EXISTS when user already has an operator profile', async () => {
      const repo = makeRepo({ findByUserId: jest.fn().mockResolvedValue(makeOperator()) });
      const service = new OperadoresService(repo);

      await expect(
        service.create({ userId: 'user-uuid', operatorType: 'custodio' }),
      ).rejects.toMatchObject({ code: 'OPERATOR_ALREADY_EXISTS' });
    });

    it('throws INVALID_OPERATOR_TYPE for invalid operator type', async () => {
      const repo = makeRepo();
      const service = new OperadoresService(repo);

      await expect(
        service.create({ userId: 'user-uuid', operatorType: 'invalid' as any }),
      ).rejects.toMatchObject({ code: 'INVALID_OPERATOR_TYPE' });
    });
  });

  describe('getById', () => {
    it('returns operator when found', async () => {
      const op = makeOperator();
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(op) });
      const service = new OperadoresService(repo);

      const result = await service.getById('op-uuid');
      expect(result.id).toBe('op-uuid');
      expect(result.operatorType).toBe('custodio');
    });

    it('throws OPERATOR_NOT_FOUND when id does not exist', async () => {
      const repo = makeRepo();
      const service = new OperadoresService(repo);

      await expect(service.getById('no-exist')).rejects.toMatchObject({ code: 'OPERATOR_NOT_FOUND' });
    });
  });

  describe('listAvailable', () => {
    it('returns available operators for the tenant', async () => {
      const ops = [makeOperator(), makeOperator({ id: 'op-2', operator_type: 'copiloto' })];
      const repo = makeRepo({ findAvailable: jest.fn().mockResolvedValue(ops) });
      const service = new OperadoresService(repo);

      const result = await service.listAvailable('tenant-uuid');

      expect(repo.findAvailable).toHaveBeenCalledWith('tenant-uuid', undefined);
      expect(result).toHaveLength(2);
    });

    it('filters available operators by operator_type', async () => {
      const ops = [makeOperator()];
      const repo = makeRepo({ findAvailable: jest.fn().mockResolvedValue(ops) });
      const service = new OperadoresService(repo);

      await service.listAvailable('tenant-uuid', 'custodio');

      expect(repo.findAvailable).toHaveBeenCalledWith('tenant-uuid', 'custodio');
    });
  });

  describe('updateStatus', () => {
    it('updates status of an active operator', async () => {
      const updated = makeOperator({ status: 'offline' });
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeOperator()),
        updateStatus: jest.fn().mockResolvedValue(updated),
      });
      const service = new OperadoresService(repo);

      const result = await service.updateStatus('op-uuid', { status: 'offline' });
      expect(result.status).toBe('offline');
    });

    it('throws OPERATOR_NOT_FOUND when operator does not exist', async () => {
      const repo = makeRepo();
      const service = new OperadoresService(repo);

      await expect(service.updateStatus('no-exist', { status: 'offline' })).rejects.toMatchObject({ code: 'OPERATOR_NOT_FOUND' });
    });

    it('throws OPERATOR_SUSPENDED when trying to change status of a suspended operator', async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeOperator({ status: 'suspended' })),
      });
      const service = new OperadoresService(repo);

      await expect(service.updateStatus('op-uuid', { status: 'offline' })).rejects.toMatchObject({ code: 'OPERATOR_SUSPENDED' });
    });
  });

  describe('suspend', () => {
    it('suspends an operator that is not on an active order', async () => {
      const suspended = makeOperator({ status: 'suspended' });
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeOperator({ status: 'available' })),
        updateStatus: jest.fn().mockResolvedValue(suspended),
      });
      const service = new OperadoresService(repo);

      const result = await service.suspend('op-uuid', { reason: 'Incidente de seguridad' });
      expect(result.status).toBe('suspended');
    });

    it('throws OPERATOR_ON_ACTIVE_ORDER when operator is busy', async () => {
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeOperator({ status: 'busy' })),
      });
      const service = new OperadoresService(repo);

      await expect(service.suspend('op-uuid', { reason: 'test' })).rejects.toMatchObject({ code: 'OPERATOR_ON_ACTIVE_ORDER' });
    });

    it('throws OPERATOR_NOT_FOUND for non-existent operator', async () => {
      const repo = makeRepo();
      const service = new OperadoresService(repo);

      await expect(service.suspend('no-exist', { reason: 'test' })).rejects.toMatchObject({ code: 'OPERATOR_NOT_FOUND' });
    });
  });

  describe('remove', () => {
    it('soft deletes an existing operator', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeOperator()) });
      const service = new OperadoresService(repo);

      await service.remove('op-uuid');

      expect(repo.softDelete).toHaveBeenCalledWith('op-uuid');
    });

    it('throws OPERATOR_NOT_FOUND when removing non-existent operator', async () => {
      const repo = makeRepo();
      const service = new OperadoresService(repo);

      await expect(service.remove('no-exist')).rejects.toMatchObject({ code: 'OPERATOR_NOT_FOUND' });
    });
  });
});
