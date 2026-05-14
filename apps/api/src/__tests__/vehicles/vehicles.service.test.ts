import { VehiclesService } from '../../modules/vehicles/vehicles.service.js';
import type { VehiclesRepository } from '../../modules/vehicles/vehicles.repository.js';
import type { OperadoresRepository } from '../../modules/operadores/operadores.repository.js';
import type { CustodyVehicle } from '../../modules/vehicles/vehicles.types.js';
import type { Operator } from '../../modules/operadores/operadores.types.js';

const makeVehicle = (overrides: Partial<CustodyVehicle> = {}): CustodyVehicle => ({
  id: 'vehicle-uuid',
  plate: 'ABC-123',
  make: 'Ford',
  model: 'Transit',
  year: 2022,
  gps_device_id: 'GPS-001',
  active: true,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  ...overrides,
});

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

const makeVehiclesRepo = (overrides: Partial<VehiclesRepository> = {}): VehiclesRepository =>
  ({
    findById: jest.fn().mockResolvedValue(undefined),
    findByPlate: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    create: jest.fn().mockResolvedValue(makeVehicle()),
    update: jest.fn().mockResolvedValue(makeVehicle()),
    assignToOperator: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as VehiclesRepository;

const makeOperadoresRepo = (overrides: Partial<OperadoresRepository> = {}): OperadoresRepository =>
  ({
    findById: jest.fn().mockResolvedValue(undefined),
    findByUserId: jest.fn().mockResolvedValue(undefined),
    findAvailable: jest.fn().mockResolvedValue([]),
    findByTenant: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    create: jest.fn().mockResolvedValue(makeOperator()),
    updateStatus: jest.fn().mockResolvedValue(makeOperator()),
    softDelete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as OperadoresRepository;

describe('VehiclesService', () => {
  describe('create', () => {
    it('creates a vehicle when plate is not registered', async () => {
      const vehiclesRepo = makeVehiclesRepo();
      const operadoresRepo = makeOperadoresRepo();
      const service = new VehiclesService(vehiclesRepo, operadoresRepo);

      const result = await service.create({ plate: 'ABC-123', model: 'Transit', year: 2022 });

      expect(vehiclesRepo.findByPlate).toHaveBeenCalledWith('ABC-123');
      expect(vehiclesRepo.create).toHaveBeenCalled();
      expect(result.plate).toBe('ABC-123');
    });

    it('throws PLATE_ALREADY_EXISTS when plate is already registered', async () => {
      const vehiclesRepo = makeVehiclesRepo({ findByPlate: jest.fn().mockResolvedValue(makeVehicle()) });
      const service = new VehiclesService(vehiclesRepo, makeOperadoresRepo());

      await expect(
        service.create({ plate: 'ABC-123', model: 'Transit', year: 2022 }),
      ).rejects.toMatchObject({ code: 'PLATE_ALREADY_EXISTS' });
    });
  });

  describe('getById', () => {
    it('returns vehicle when found', async () => {
      const vehiclesRepo = makeVehiclesRepo({ findById: jest.fn().mockResolvedValue(makeVehicle()) });
      const service = new VehiclesService(vehiclesRepo, makeOperadoresRepo());

      const result = await service.getById('vehicle-uuid');
      expect(result.id).toBe('vehicle-uuid');
      expect(result.model).toBe('Transit');
    });

    it('throws VEHICLE_NOT_FOUND when id does not exist', async () => {
      const service = new VehiclesService(makeVehiclesRepo(), makeOperadoresRepo());

      await expect(service.getById('no-exist')).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
    });
  });

  describe('list', () => {
    it('returns paginated vehicles with filters', async () => {
      const vehicles = [makeVehicle(), makeVehicle({ id: 'v-2', plate: 'XYZ-999' })];
      const vehiclesRepo = makeVehiclesRepo({ findAll: jest.fn().mockResolvedValue({ data: vehicles, total: 2 }) });
      const service = new VehiclesService(vehiclesRepo, makeOperadoresRepo());

      const result = await service.list({ active: true }, 0, 20);

      expect(vehiclesRepo.findAll).toHaveBeenCalledWith({ active: true }, 0, 20);
      expect(result.total).toBe(2);
    });
  });

  describe('update', () => {
    it('updates vehicle data when it exists', async () => {
      const updated = makeVehicle({ model: 'Sprinter' });
      const vehiclesRepo = makeVehiclesRepo({
        findById: jest.fn().mockResolvedValue(makeVehicle()),
        update: jest.fn().mockResolvedValue(updated),
      });
      const service = new VehiclesService(vehiclesRepo, makeOperadoresRepo());

      const result = await service.update('vehicle-uuid', { model: 'Sprinter' });
      expect(result.model).toBe('Sprinter');
    });

    it('throws VEHICLE_NOT_FOUND when vehicle does not exist', async () => {
      const service = new VehiclesService(makeVehiclesRepo(), makeOperadoresRepo());

      await expect(service.update('no-exist', { model: 'X' })).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
    });
  });

  describe('assignToOperator', () => {
    it('assigns vehicle to an available operator', async () => {
      const vehiclesRepo = makeVehiclesRepo({ findById: jest.fn().mockResolvedValue(makeVehicle()) });
      const operadoresRepo = makeOperadoresRepo({ findById: jest.fn().mockResolvedValue(makeOperator()) });
      const service = new VehiclesService(vehiclesRepo, operadoresRepo);

      const result = await service.assignToOperator('vehicle-uuid', 'op-uuid');

      expect(vehiclesRepo.assignToOperator).toHaveBeenCalledWith('vehicle-uuid', 'op-uuid');
      expect(result.vehicle.id).toBe('vehicle-uuid');
      expect(result.operatorId).toBe('op-uuid');
    });

    it('throws VEHICLE_NOT_FOUND when vehicle does not exist', async () => {
      const service = new VehiclesService(makeVehiclesRepo(), makeOperadoresRepo());

      await expect(service.assignToOperator('no-v', 'op-uuid')).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
    });

    it('throws OPERATOR_NOT_FOUND when operator does not exist', async () => {
      const vehiclesRepo = makeVehiclesRepo({ findById: jest.fn().mockResolvedValue(makeVehicle()) });
      const service = new VehiclesService(vehiclesRepo, makeOperadoresRepo());

      await expect(service.assignToOperator('vehicle-uuid', 'no-op')).rejects.toMatchObject({ code: 'OPERATOR_NOT_FOUND' });
    });

    it('throws OPERATOR_SUSPENDED when operator is suspended', async () => {
      const vehiclesRepo = makeVehiclesRepo({ findById: jest.fn().mockResolvedValue(makeVehicle()) });
      const operadoresRepo = makeOperadoresRepo({
        findById: jest.fn().mockResolvedValue(makeOperator({ status: 'suspended' })),
      });
      const service = new VehiclesService(vehiclesRepo, operadoresRepo);

      await expect(service.assignToOperator('vehicle-uuid', 'op-uuid')).rejects.toMatchObject({ code: 'OPERATOR_SUSPENDED' });
    });
  });

  describe('remove', () => {
    it('soft deletes an existing vehicle', async () => {
      const vehiclesRepo = makeVehiclesRepo({ findById: jest.fn().mockResolvedValue(makeVehicle()) });
      const service = new VehiclesService(vehiclesRepo, makeOperadoresRepo());

      await service.remove('vehicle-uuid');

      expect(vehiclesRepo.softDelete).toHaveBeenCalledWith('vehicle-uuid');
    });

    it('throws VEHICLE_NOT_FOUND when vehicle does not exist', async () => {
      const service = new VehiclesService(makeVehiclesRepo(), makeOperadoresRepo());

      await expect(service.remove('no-exist')).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
    });
  });
});
