export type DriverStatus =
  | 'pending'
  | 'documents_submitted'
  | 'under_review'
  | 'approved'
  | 'suspended'
  | 'banned';

export type ServiceMode = 'people' | 'cargo' | 'mixed';

export type DocumentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'expired'
  | 'not_submitted';

export type VehicleStatus = 'pending' | 'approved' | 'rejected';

// ---------------------------------------------------------------------------
// DTOs (outbound — what the API returns)
// ---------------------------------------------------------------------------

export interface DriverDTO {
  id: string;
  userId: string;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  status: DriverStatus;
  serviceModes: ServiceMode[];
  online: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  totalTrips: number;
  createdAt: string;
}

export interface DocumentRequirementDTO {
  id: string;
  code: string;
  name: string;
  description: string | null;
  required: boolean;
  // Current document state for this driver+requirement:
  documentStatus: DocumentStatus;
  documentId: string | null;
  fileUrl: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
}

export interface DriverDocumentDTO {
  id: string;
  requirementId: string;
  requirementCode: string;
  requirementName: string;
  fileUrl: string;
  status: DocumentStatus;
  expiresAt: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
}

export interface VehicleDTO {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  status: VehicleStatus;
  active: boolean;
  createdAt: string;
}
