import type { Database } from '../../../config/database.js';
import type { VehicleStatus } from '../drivers.types.js';

export interface Vehicle {
  id: string;
  driver_id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  license_plate: string;
  status: VehicleStatus;
  active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVehicleData {
  driverId: string;
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  active: boolean;
}

export class VehiclesRepository {
  constructor(private readonly db: Database) {}

  async findByDriver(driverId: string): Promise<Vehicle[]> {
    return this.db<Vehicle>('vehicles')
      .where({ driver_id: driverId })
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');
  }

  async findActiveByDriver(driverId: string): Promise<Vehicle | undefined> {
    return this.db<Vehicle>('vehicles')
      .where({ driver_id: driverId, active: true })
      .whereNull('deleted_at')
      .first();
  }

  async findByPlate(licensePlate: string): Promise<Vehicle | undefined> {
    return this.db<Vehicle>('vehicles')
      .where({ license_plate: licensePlate })
      .whereNull('deleted_at')
      .first();
  }

  async create(data: CreateVehicleData): Promise<Vehicle> {
    const rows = await this.db<Vehicle>('vehicles')
      .insert({
        driver_id: data.driverId,
        make: data.make,
        model: data.model,
        year: data.year,
        color: data.color,
        license_plate: data.licensePlate,
        status: 'pending',
        active: data.active,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to create vehicle: no row returned');
    return row;
  }
}
