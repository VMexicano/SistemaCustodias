import { BusinessError } from '../../shared/errors/business-error.js';
import type { VehiclesRepository } from './vehicles.repository.js';
import type { OperadoresRepository } from '../operadores/operadores.repository.js';
import type { CustodyVehicle, VehicleDTO, CreateVehicleInput, UpdateVehicleInput } from './vehicles.types.js';

function toDTO(v: CustodyVehicle): VehicleDTO {
  return {
    id: v.id,
    plate: v.plate,
    make: v.make,
    model: v.model,
    year: v.year,
    gpsDeviceId: v.gps_device_id,
    active: v.active,
    createdAt: v.created_at.toISOString(),
  };
}

export class VehiclesService {
  constructor(
    private readonly vehiclesRepo: VehiclesRepository,
    private readonly operadoresRepo: OperadoresRepository,
  ) {}

  async create(input: CreateVehicleInput): Promise<VehicleDTO> {
    const existing = await this.vehiclesRepo.findByPlate(input.plate);
    if (existing) {
      throw new BusinessError('PLATE_ALREADY_EXISTS', `Plate ${input.plate} is already registered`);
    }

    const vehicle = await this.vehiclesRepo.create({
      plate: input.plate,
      make: input.make,
      model: input.model,
      year: input.year,
      gpsDeviceId: input.gpsDeviceId,
    });

    return toDTO(vehicle);
  }

  async getById(id: string): Promise<VehicleDTO> {
    const vehicle = await this.vehiclesRepo.findById(id);
    if (!vehicle) {
      throw new BusinessError('VEHICLE_NOT_FOUND', 'Vehicle not found');
    }
    return toDTO(vehicle);
  }

  async list(
    filters: { active?: boolean },
    page: number,
    limit: number,
  ): Promise<{ data: VehicleDTO[]; total: number }> {
    const result = await this.vehiclesRepo.findAll(filters, page, limit);
    return { data: result.data.map(toDTO), total: result.total };
  }

  async update(id: string, input: UpdateVehicleInput): Promise<VehicleDTO> {
    const existing = await this.vehiclesRepo.findById(id);
    if (!existing) {
      throw new BusinessError('VEHICLE_NOT_FOUND', 'Vehicle not found');
    }

    const vehicle = await this.vehiclesRepo.update(id, {
      make: input.make,
      model: input.model,
      year: input.year,
      gpsDeviceId: input.gpsDeviceId,
    });

    return toDTO(vehicle);
  }

  async assignToOperator(vehicleId: string, operatorId: string): Promise<{ vehicle: VehicleDTO; operatorId: string }> {
    const vehicle = await this.vehiclesRepo.findById(vehicleId);
    if (!vehicle) {
      throw new BusinessError('VEHICLE_NOT_FOUND', 'Vehicle not found');
    }

    const operator = await this.operadoresRepo.findById(operatorId);
    if (!operator) {
      throw new BusinessError('OPERATOR_NOT_FOUND', 'Operator not found');
    }
    if (operator.status === 'suspended') {
      throw new BusinessError('OPERATOR_SUSPENDED', 'Cannot assign a vehicle to a suspended operator');
    }

    await this.vehiclesRepo.assignToOperator(vehicleId, operatorId);

    return { vehicle: toDTO(vehicle), operatorId };
  }

  async remove(id: string): Promise<void> {
    const existing = await this.vehiclesRepo.findById(id);
    if (!existing) {
      throw new BusinessError('VEHICLE_NOT_FOUND', 'Vehicle not found');
    }
    await this.vehiclesRepo.softDelete(id);
  }
}
