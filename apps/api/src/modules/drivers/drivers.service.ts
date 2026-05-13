import type { Redis } from 'ioredis';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { Database } from '../../config/database.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { DriversRepository } from './drivers.repository.js';
import type { DocumentsRepository } from './documents/documents.repository.js';
import type { VehiclesRepository } from './vehicles/vehicles.repository.js';
import type {
  DriverDTO,
  DocumentRequirementDTO,
  DriverDocumentDTO,
  VehicleDTO,
  ServiceMode,
} from './drivers.types.js';
import type { Driver } from './drivers.repository.js';
import type { TrackingService } from '../tracking/tracking.service.js';

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface RegisterDriverInput {
  licenseNumber: string;
  licenseExpiry: Date;
  serviceModes: ServiceMode[];
}

export interface UpdateDriverInput {
  licenseNumber?: string;
  licenseExpiry?: Date;
  serviceModes?: ServiceMode[];
}

export interface SubmitDocumentInput {
  requirementId: string;
  fileUrl: string;
  expiresAt?: Date;
}

export interface RegisterVehicleInput {
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
}

export interface UpdateLocationInput {
  latitude: number;
  longitude: number;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function toDriverDTO(driver: Driver): DriverDTO {
  return {
    id: driver.id,
    userId: driver.user_id,
    licenseNumber: driver.license_number,
    licenseExpiry: driver.license_expiry ? driver.license_expiry.toISOString().split('T')[0]! : null,
    status: driver.status,
    serviceModes: driver.service_modes,
    online: driver.online,
    ratingAvg: driver.rating_avg !== null ? Number(driver.rating_avg) : null,
    ratingCount: driver.rating_count,
    totalTrips: driver.total_trips,
    createdAt: driver.created_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DriversService {
  constructor(
    private readonly driversRepo: DriversRepository,
    private readonly documentsRepo: DocumentsRepository,
    private readonly vehiclesRepo: VehiclesRepository,
    private readonly usersRepo: UsersRepository,
    private readonly redis: Redis,
    private readonly db: Database,
    private readonly trackingService?: TrackingService,
  ) {}

  // -------------------------------------------------------------------------
  // DRV-002: Register as driver
  // -------------------------------------------------------------------------

  async register(userId: string, input: RegisterDriverInput): Promise<DriverDTO> {
    const existing = await this.driversRepo.findByUserId(userId);
    if (existing) {
      throw new BusinessError('DRIVER_ALREADY_REGISTERED', 'User already has a driver profile');
    }

    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND', 'User not found');
    }

    const driver = await this.driversRepo.create({
      userId,
      regionId: user.region_id,
      licenseNumber: input.licenseNumber,
      licenseExpiry: input.licenseExpiry,
      serviceModes: input.serviceModes,
    });

    // Add driver role (idempotent — uses ON CONFLICT IGNORE)
    await this.usersRepo.addRole(userId, 'driver');

    return toDriverDTO(driver);
  }

  // -------------------------------------------------------------------------
  // DRV-003: Profile
  // -------------------------------------------------------------------------

  async getProfile(userId: string): Promise<DriverDTO> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', 'Driver profile not found for this user');
    }
    return toDriverDTO(driver);
  }

  async updateProfile(userId: string, input: UpdateDriverInput): Promise<DriverDTO> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', 'Driver profile not found for this user');
    }

    const updated = await this.driversRepo.update(driver.id, {
      licenseNumber: input.licenseNumber,
      licenseExpiry: input.licenseExpiry,
      serviceModes: input.serviceModes,
    });

    await this.db('audit_logs').insert({
      entity_type: 'driver',
      entity_id: driver.id,
      action: 'update',
      actor_type: 'user',
      actor_id: userId,
      new_value: JSON.stringify(input),
    });

    return toDriverDTO(updated);
  }

  // -------------------------------------------------------------------------
  // DRV-004: Documents
  // -------------------------------------------------------------------------

  async getDocuments(userId: string): Promise<DocumentRequirementDTO[]> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', 'Driver profile not found for this user');
    }

    const requirements = await this.documentsRepo.findRequirementsByRegion(driver.region_id);
    const submitted = await this.documentsRepo.findByDriver(driver.id);

    const docByRequirementId = new Map(submitted.map((d) => [d.requirement_id, d]));

    return requirements.map((req) => {
      const doc = docByRequirementId.get(req.id);
      return {
        id: req.id,
        code: req.code,
        name: req.name,
        description: req.description,
        required: req.required,
        documentStatus: doc ? doc.status : 'not_submitted',
        documentId: doc?.id ?? null,
        fileUrl: doc?.file_url ?? null,
        expiresAt: doc?.expires_at ? doc.expires_at.toISOString() : null,
        rejectionReason: doc?.rejection_reason ?? null,
      };
    });
  }

  async submitDocument(userId: string, input: SubmitDocumentInput): Promise<DriverDocumentDTO> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', 'Driver profile not found for this user');
    }

    const requirement = await this.documentsRepo.findRequirementById(input.requirementId);
    if (!requirement || requirement.region_id !== driver.region_id) {
      throw new BusinessError('REQUIREMENT_NOT_FOUND', 'Document requirement not found for your region');
    }

    const doc = await this.documentsRepo.upsert({
      driverId: driver.id,
      requirementId: input.requirementId,
      fileUrl: input.fileUrl,
      expiresAt: input.expiresAt,
    });

    // Transition to documents_submitted if still pending
    if (driver.status === 'pending') {
      await this.driversRepo.setStatus(driver.id, 'documents_submitted');
    }

    return {
      id: doc.id,
      requirementId: doc.requirement_id,
      requirementCode: requirement.code,
      requirementName: requirement.name,
      fileUrl: doc.file_url,
      status: doc.status,
      expiresAt: doc.expires_at ? doc.expires_at.toISOString() : null,
      rejectionReason: doc.rejection_reason,
      reviewedAt: doc.reviewed_at ? doc.reviewed_at.toISOString() : null,
    };
  }

  // -------------------------------------------------------------------------
  // DRV-005: Vehicles
  // -------------------------------------------------------------------------

  async getVehicles(userId: string): Promise<VehicleDTO[]> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', 'Driver profile not found for this user');
    }

    const vehicles = await this.vehiclesRepo.findByDriver(driver.id);
    return vehicles.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      color: v.color,
      licensePlate: v.license_plate,
      status: v.status,
      active: v.active,
      createdAt: v.created_at.toISOString(),
    }));
  }

  async registerVehicle(userId: string, input: RegisterVehicleInput): Promise<VehicleDTO> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', 'Driver profile not found for this user');
    }

    const existing = await this.vehiclesRepo.findByPlate(input.licensePlate);
    if (existing) {
      throw new BusinessError('VEHICLE_PLATE_DUPLICATE', `License plate ${input.licensePlate} is already registered`);
    }

    // First vehicle gets active=true
    const existingVehicles = await this.vehiclesRepo.findByDriver(driver.id);
    const isFirst = existingVehicles.length === 0;

    const vehicle = await this.vehiclesRepo.create({
      driverId: driver.id,
      make: input.make,
      model: input.model,
      year: input.year,
      color: input.color,
      licensePlate: input.licensePlate,
      active: isFirst,
    });

    return {
      id: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      color: vehicle.color,
      licensePlate: vehicle.license_plate,
      status: vehicle.status,
      active: vehicle.active,
      createdAt: vehicle.created_at.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // DRV-006: Availability
  // -------------------------------------------------------------------------

  async goOnline(userId: string): Promise<{ online: true; driverStatus: string }> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', 'Driver profile not found for this user');
    }

    if (driver.status !== 'approved') {
      throw new BusinessError('DRIVER_NOT_APPROVED', 'Driver must be approved to go online');
    }

    // Check for expired required documents (R-DRV-001)
    const hasExpired = await this.documentsRepo.hasExpiredRequiredDocs(driver.id, driver.region_id);
    if (hasExpired) {
      throw new BusinessError('DOCUMENTS_EXPIRED', 'One or more required documents have expired');
    }

    // Check for active vehicle
    const activeVehicle = await this.vehiclesRepo.findActiveByDriver(driver.id);
    if (!activeVehicle) {
      throw new BusinessError('NO_ACTIVE_VEHICLE', 'Driver has no active vehicle registered');
    }

    await this.driversRepo.setOnline(driver.id, true);

    await this.db('audit_logs').insert({
      entity_type: 'driver',
      entity_id: driver.id,
      action: 'go_online',
      actor_type: 'user',
      actor_id: userId,
      new_value: JSON.stringify({ online: true }),
    });

    return { online: true, driverStatus: driver.status };
  }

  async goOffline(userId: string): Promise<{ online: false }> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', 'Driver profile not found for this user');
    }

    await this.driversRepo.setOnline(driver.id, false);

    // Remove location from Redis
    await this.redis.del(`driver:${driver.id}:location`);

    await this.db('audit_logs').insert({
      entity_type: 'driver',
      entity_id: driver.id,
      action: 'go_offline',
      actor_type: 'user',
      actor_id: userId,
      new_value: JSON.stringify({ online: false }),
    });

    return { online: false };
  }

  // -------------------------------------------------------------------------
  // DRV-007: Location
  // -------------------------------------------------------------------------

  async updateLocation(userId: string, input: UpdateLocationInput): Promise<void> {
    const driver = await this.driversRepo.findByUserId(userId);
    if (!driver) {
      throw new BusinessError('DRIVER_NOT_FOUND', 'Driver profile not found for this user');
    }

    if (!driver.online) {
      throw new BusinessError('DRIVER_OFFLINE', 'Driver must be online to update location');
    }

    const key = `driver:${driver.id}:location`;
    await this.redis.hset(key, {
      lat: String(input.latitude),
      lng: String(input.longitude),
      updatedAt: new Date().toISOString(),
    });
    await this.redis.expire(key, 300); // TTL: 5 minutes

    // Sprint 7: record in TimescaleDB trip_locations if driver has an active trip
    if (this.trackingService) {
      await this.trackingService.recordLocation(driver.id, input.latitude, input.longitude);
    }
  }
}
