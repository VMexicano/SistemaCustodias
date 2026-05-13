import type { Database } from '../../config/database.js';
import type { DriverStatus, ServiceMode } from './drivers.types.js';

export interface Driver {
  id: string;
  user_id: string;
  region_id: string;
  license_number: string | null;
  license_expiry: Date | null;
  status: DriverStatus;
  service_modes: ServiceMode[];
  online: boolean;
  rating_avg: number | null;
  rating_count: number;
  total_trips: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDriverData {
  userId: string;
  regionId: string;
  licenseNumber: string;
  licenseExpiry: Date;
  serviceModes: ServiceMode[];
}

export interface UpdateDriverData {
  licenseNumber?: string;
  licenseExpiry?: Date;
  serviceModes?: ServiceMode[];
}

export class DriversRepository {
  constructor(private readonly db: Database) {}

  async findByUserId(userId: string): Promise<Driver | undefined> {
    return this.db<Driver>('drivers')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first();
  }

  async findById(id: string): Promise<Driver | undefined> {
    return this.db<Driver>('drivers')
      .where({ id })
      .whereNull('deleted_at')
      .first();
  }

  async create(data: CreateDriverData): Promise<Driver> {
    const rows = await this.db<Driver>('drivers')
      .insert({
        user_id: data.userId,
        region_id: data.regionId,
        license_number: data.licenseNumber,
        license_expiry: data.licenseExpiry,
        service_modes: data.serviceModes,
        status: 'pending',
        online: false,
        rating_count: 0,
        total_trips: 0,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to create driver: no row returned');
    return row;
  }

  async update(driverId: string, data: UpdateDriverData): Promise<Driver> {
    const patch: Record<string, unknown> = { updated_at: this.db.fn.now() };

    if (data.licenseNumber !== undefined) patch['license_number'] = data.licenseNumber;
    if (data.licenseExpiry !== undefined) patch['license_expiry'] = data.licenseExpiry;
    if (data.serviceModes !== undefined) {
      patch['service_modes'] = data.serviceModes;
    }

    const rows = await this.db<Driver>('drivers')
      .where({ id: driverId })
      .whereNull('deleted_at')
      .update(patch)
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to update driver: no row returned');
    return row;
  }

  async setOnline(driverId: string, online: boolean): Promise<void> {
    await this.db<Driver>('drivers')
      .where({ id: driverId })
      .update({ online, updated_at: this.db.fn.now() });
  }

  async setStatus(driverId: string, status: DriverStatus): Promise<void> {
    await this.db<Driver>('drivers')
      .where({ id: driverId })
      .update({ status, updated_at: this.db.fn.now() });
  }
}
