export interface CustodyVehicle {
  id: string;
  plate: string;
  make: string | null;
  model: string;
  year: number;
  gps_device_id: string | null;
  active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface VehicleDTO {
  id: string;
  plate: string;
  make: string | null;
  model: string;
  year: number;
  gpsDeviceId: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateVehicleInput {
  plate: string;
  make?: string;
  model: string;
  year: number;
  gpsDeviceId?: string;
}

export interface UpdateVehicleInput {
  make?: string;
  model?: string;
  year?: number;
  gpsDeviceId?: string;
}
