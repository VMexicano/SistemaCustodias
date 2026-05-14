import type { Database } from '../../config/database.js';
import type { CustodyVehicle } from './vehicles.types.js';

export interface CreateVehicleData {
  plate: string;
  make?: string;
  model: string;
  year: number;
  gpsDeviceId?: string;
}

export interface UpdateVehicleData {
  make?: string;
  model?: string;
  year?: number;
  gpsDeviceId?: string;
}

export class VehiclesRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<CustodyVehicle | undefined> {
    return this.db<CustodyVehicle>('custody_vehicles')
      .where({ id })
      .whereNull('deleted_at')
      .first();
  }

  async findByPlate(plate: string): Promise<CustodyVehicle | undefined> {
    return this.db<CustodyVehicle>('custody_vehicles')
      .where({ plate })
      .whereNull('deleted_at')
      .first();
  }

  async findAll(
    filters: { active?: boolean },
    page: number,
    limit: number,
  ): Promise<{ data: CustodyVehicle[]; total: number }> {
    const base = () => {
      const q = this.db<CustodyVehicle>('custody_vehicles').whereNull('deleted_at');
      if (filters.active !== undefined) q.where({ active: filters.active });
      return q;
    };

    const [data, countResult] = await Promise.all([
      base().orderBy('created_at', 'desc').limit(limit).offset(page * limit),
      base().count('id as total').first(),
    ]);

    return { data, total: Number((countResult as { total: string | number } | undefined)?.total ?? 0) };
  }

  async create(data: CreateVehicleData): Promise<CustodyVehicle> {
    const rows = await this.db<CustodyVehicle>('custody_vehicles')
      .insert({
        plate: data.plate,
        make: data.make ?? null,
        model: data.model,
        year: data.year,
        gps_device_id: data.gpsDeviceId ?? null,
        active: true,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to create vehicle: no row returned');
    return row;
  }

  async update(id: string, data: UpdateVehicleData): Promise<CustodyVehicle> {
    const patch: Record<string, unknown> = { updated_at: this.db.fn.now() };

    if (data.make !== undefined) patch['make'] = data.make;
    if (data.model !== undefined) patch['model'] = data.model;
    if (data.year !== undefined) patch['year'] = data.year;
    if (data.gpsDeviceId !== undefined) patch['gps_device_id'] = data.gpsDeviceId;

    const rows = await this.db<CustodyVehicle>('custody_vehicles')
      .where({ id })
      .whereNull('deleted_at')
      .update(patch)
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to update vehicle: no row returned');
    return row;
  }

  async assignToOperator(vehicleId: string, operatorId: string): Promise<void> {
    await this.db('operators')
      .where({ id: operatorId })
      .whereNull('deleted_at')
      .update({ vehicle_id: vehicleId, updated_at: this.db.fn.now() });
  }

  async softDelete(id: string): Promise<void> {
    await this.db<CustodyVehicle>('custody_vehicles')
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date(), active: false });
  }
}
