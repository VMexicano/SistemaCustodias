export type OperatorType = 'custodio' | 'copiloto';
export type OperatorStatus = 'available' | 'busy' | 'offline' | 'suspended';

export interface Operator {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  operator_type: OperatorType;
  license_number: string | null;
  certifications: Record<string, string>;
  status: OperatorStatus;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OperatorDTO {
  id: string;
  userId: string;
  vehicleId: string | null;
  operatorType: OperatorType;
  licenseNumber: string | null;
  certifications: Record<string, string>;
  status: OperatorStatus;
  firstName?: string;
  lastName?: string;
  createdAt: string;
}

export interface CreateOperatorInput {
  userId: string;
  operatorType: OperatorType;
  licenseNumber?: string;
  certifications?: Record<string, string>;
}

export interface UpdateStatusInput {
  status: 'available' | 'busy' | 'offline';
}

export interface SuspendOperatorInput {
  reason: string;
}
