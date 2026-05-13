/**
 * DriversService — unit tests
 *
 * All repositories and Redis are mocked. Tests verify business logic only.
 */

import { DriversService } from '../../modules/drivers/drivers.service.js';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { DriversRepository, Driver } from '../../modules/drivers/drivers.repository.js';
import type { DocumentsRepository, DocumentRequirement, DriverDocument } from '../../modules/drivers/documents/documents.repository.js';
import type { VehiclesRepository, Vehicle } from '../../modules/drivers/vehicles/vehicles.repository.js';
import type { UsersRepository, User } from '../../modules/users/users.repository.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REGION_ID = 'region-mx-uuid';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-001',
    region_id: REGION_ID,
    phone: '+521234567890',
    full_name: 'Test Driver',
    status: 'active',
    phone_verified: true,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'driver-001',
    user_id: 'user-001',
    region_id: REGION_ID,
    license_number: 'LIC12345',
    license_expiry: new Date('2030-01-01'),
    status: 'pending',
    service_modes: ['people'],
    online: false,
    rating_avg: null,
    rating_count: 0,
    total_trips: 0,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeRequirement(overrides: Partial<DocumentRequirement> = {}): DocumentRequirement {
  return {
    id: 'req-001',
    region_id: REGION_ID,
    code: 'drivers_license',
    name: 'Licencia de conducir',
    description: null,
    required: true,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeDocument(overrides: Partial<DriverDocument> = {}): DriverDocument {
  return {
    id: 'doc-001',
    driver_id: 'driver-001',
    requirement_id: 'req-001',
    file_url: 'https://example.com/doc.pdf',
    status: 'pending',
    rejection_reason: null,
    expires_at: null,
    reviewed_at: null,
    reviewed_by: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'vehicle-001',
    driver_id: 'driver-001',
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    color: 'Blanco',
    license_plate: 'ABC-123',
    status: 'pending',
    active: true,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeDriversRepo(overrides: Partial<DriversRepository> = {}): jest.Mocked<DriversRepository> {
  return {
    findByUserId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setOnline: jest.fn(),
    setStatus: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<DriversRepository>;
}

function makeDocumentsRepo(overrides: Partial<DocumentsRepository> = {}): jest.Mocked<DocumentsRepository> {
  return {
    findRequirementsByRegion: jest.fn(),
    findRequirementById: jest.fn(),
    findByDriver: jest.fn(),
    findById: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    countRequiredApproved: jest.fn(),
    hasExpiredRequiredDocs: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<DocumentsRepository>;
}

function makeVehiclesRepo(overrides: Partial<VehiclesRepository> = {}): jest.Mocked<VehiclesRepository> {
  return {
    findByDriver: jest.fn(),
    findActiveByDriver: jest.fn(),
    findByPlate: jest.fn(),
    create: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<VehiclesRepository>;
}

function makeUsersRepo(overrides: Partial<UsersRepository> = {}): jest.Mocked<UsersRepository> {
  return {
    findByPhone: jest.fn(),
    findByPhoneIncludingDeleted: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    getRoles: jest.fn(),
    addRole: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<UsersRepository>;
}

function makeRedis() {
  return {
    hset: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
  };
}

function makeDb() {
  const insertFn = jest.fn().mockReturnValue({ returning: jest.fn().mockResolvedValue([]) });
  const db = jest.fn().mockReturnValue({ insert: insertFn });
  return db;
}

// ---------------------------------------------------------------------------
// DriversService.register
// ---------------------------------------------------------------------------

describe('DriversService.register', () => {
  it('creates driver and returns DriverDTO', async () => {
    const driversRepo = makeDriversRepo({
      findByUserId: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(makeDriver()),
    });
    const usersRepo = makeUsersRepo({ findById: jest.fn().mockResolvedValue(makeUser()) });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), usersRepo, makeRedis() as never, makeDb() as never);

    const result = await svc.register('user-001', {
      licenseNumber: 'LIC12345',
      licenseExpiry: new Date('2030-01-01'),
      serviceModes: ['people'],
    });

    expect(result.status).toBe('pending');
    expect(result.serviceModes).toEqual(['people']);
    expect(usersRepo.addRole).toHaveBeenCalledWith('user-001', 'driver');
  });

  it('throws DRIVER_ALREADY_REGISTERED if driver exists', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver()) });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await expect(svc.register('user-001', { licenseNumber: 'LIC', licenseExpiry: new Date(), serviceModes: ['people'] }))
      .rejects.toMatchObject({ code: 'DRIVER_ALREADY_REGISTERED' });
  });

  it('throws USER_NOT_FOUND if user does not exist', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(undefined) });
    const usersRepo = makeUsersRepo({ findById: jest.fn().mockResolvedValue(null) });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), usersRepo, makeRedis() as never, makeDb() as never);

    await expect(svc.register('user-001', { licenseNumber: 'LIC', licenseExpiry: new Date(), serviceModes: ['people'] }))
      .rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// DriversService.getProfile
// ---------------------------------------------------------------------------

describe('DriversService.getProfile', () => {
  it('returns DriverDTO for existing driver', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver()) });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    const result = await svc.getProfile('user-001');
    expect(result.id).toBe('driver-001');
    expect(result.userId).toBe('user-001');
  });

  it('throws DRIVER_NOT_FOUND if no driver for userId', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(undefined) });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await expect(svc.getProfile('user-001')).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// DriversService.updateProfile
// ---------------------------------------------------------------------------

describe('DriversService.updateProfile', () => {
  it('updates licenseNumber and returns updated DriverDTO', async () => {
    const updated = makeDriver({ license_number: 'NEW-LIC' });
    const driversRepo = makeDriversRepo({
      findByUserId: jest.fn().mockResolvedValue(makeDriver()),
      update: jest.fn().mockResolvedValue(updated),
    });
    const db = makeDb();
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, db as never);

    const result = await svc.updateProfile('user-001', { licenseNumber: 'NEW-LIC' });
    expect(result.licenseNumber).toBe('NEW-LIC');
  });

  it('writes audit_log entry on update', async () => {
    const dbInsertMock = jest.fn().mockResolvedValue([]);
    const dbMock = jest.fn().mockReturnValue({ insert: dbInsertMock });
    const driversRepo = makeDriversRepo({
      findByUserId: jest.fn().mockResolvedValue(makeDriver()),
      update: jest.fn().mockResolvedValue(makeDriver()),
    });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, dbMock as never);

    await svc.updateProfile('user-001', { licenseNumber: 'LIC-NEW' });
    expect(dbMock).toHaveBeenCalledWith('audit_logs');
  });

  it('throws DRIVER_NOT_FOUND if no driver for userId', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(undefined) });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await expect(svc.updateProfile('user-001', {})).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// DriversService.submitDocument
// ---------------------------------------------------------------------------

describe('DriversService.submitDocument', () => {
  it('creates document and returns DriverDocumentDTO', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver()) });
    const documentsRepo = makeDocumentsRepo({
      findRequirementById: jest.fn().mockResolvedValue(makeRequirement()),
      upsert: jest.fn().mockResolvedValue(makeDocument()),
    });
    const svc = new DriversService(driversRepo, documentsRepo, makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    const result = await svc.submitDocument('user-001', { requirementId: 'req-001', fileUrl: 'https://example.com/doc.pdf' });
    expect(result.requirementCode).toBe('drivers_license');
    expect(result.status).toBe('pending');
  });

  it('transitions driver status from pending to documents_submitted', async () => {
    const driversRepo = makeDriversRepo({
      findByUserId: jest.fn().mockResolvedValue(makeDriver({ status: 'pending' })),
      setStatus: jest.fn().mockResolvedValue(undefined),
    });
    const documentsRepo = makeDocumentsRepo({
      findRequirementById: jest.fn().mockResolvedValue(makeRequirement()),
      upsert: jest.fn().mockResolvedValue(makeDocument()),
    });
    const svc = new DriversService(driversRepo, documentsRepo, makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await svc.submitDocument('user-001', { requirementId: 'req-001', fileUrl: 'https://example.com/doc.pdf' });
    expect(driversRepo.setStatus).toHaveBeenCalledWith('driver-001', 'documents_submitted');
  });

  it('does not change status if already documents_submitted', async () => {
    const driversRepo = makeDriversRepo({
      findByUserId: jest.fn().mockResolvedValue(makeDriver({ status: 'documents_submitted' })),
      setStatus: jest.fn(),
    });
    const documentsRepo = makeDocumentsRepo({
      findRequirementById: jest.fn().mockResolvedValue(makeRequirement()),
      upsert: jest.fn().mockResolvedValue(makeDocument()),
    });
    const svc = new DriversService(driversRepo, documentsRepo, makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await svc.submitDocument('user-001', { requirementId: 'req-001', fileUrl: 'https://example.com/doc.pdf' });
    expect(driversRepo.setStatus).not.toHaveBeenCalled();
  });

  it('throws REQUIREMENT_NOT_FOUND for unknown requirementId', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver()) });
    const documentsRepo = makeDocumentsRepo({ findRequirementById: jest.fn().mockResolvedValue(undefined) });
    const svc = new DriversService(driversRepo, documentsRepo, makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await expect(svc.submitDocument('user-001', { requirementId: 'bad-id', fileUrl: 'https://example.com/doc.pdf' }))
      .rejects.toMatchObject({ code: 'REQUIREMENT_NOT_FOUND' });
  });
});

// ---------------------------------------------------------------------------
// DriversService.registerVehicle
// ---------------------------------------------------------------------------

describe('DriversService.registerVehicle', () => {
  const vehicleInput = { make: 'Toyota', model: 'Corolla', year: 2020, color: 'Blanco', licensePlate: 'ABC-123' };

  it('creates vehicle with pending status', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver()) });
    const vehiclesRepo = makeVehiclesRepo({
      findByDriver: jest.fn().mockResolvedValue([]),
      findByPlate: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue(makeVehicle()),
    });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), vehiclesRepo, makeUsersRepo(), makeRedis() as never, makeDb() as never);

    const result = await svc.registerVehicle('user-001', vehicleInput);
    expect(result.status).toBe('pending');
  });

  it('sets active=true for first vehicle', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver()) });
    const vehiclesRepo = makeVehiclesRepo({
      findByDriver: jest.fn().mockResolvedValue([]),
      findByPlate: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation(async (data) => makeVehicle({ active: data.active })),
    });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), vehiclesRepo, makeUsersRepo(), makeRedis() as never, makeDb() as never);

    const result = await svc.registerVehicle('user-001', vehicleInput);
    expect(result.active).toBe(true);
  });

  it('sets active=false for subsequent vehicles', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver()) });
    const vehiclesRepo = makeVehiclesRepo({
      findByDriver: jest.fn().mockResolvedValue([makeVehicle()]),
      findByPlate: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockImplementation(async (data) => makeVehicle({ active: data.active, id: 'vehicle-002' })),
    });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), vehiclesRepo, makeUsersRepo(), makeRedis() as never, makeDb() as never);

    const result = await svc.registerVehicle('user-001', { ...vehicleInput, licensePlate: 'XYZ-456' });
    expect(result.active).toBe(false);
  });

  it('throws VEHICLE_PLATE_DUPLICATE for existing plate', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver()) });
    const vehiclesRepo = makeVehiclesRepo({ findByPlate: jest.fn().mockResolvedValue(makeVehicle()) });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), vehiclesRepo, makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await expect(svc.registerVehicle('user-001', vehicleInput))
      .rejects.toMatchObject({ code: 'VEHICLE_PLATE_DUPLICATE' });
  });
});

// ---------------------------------------------------------------------------
// DriversService.goOnline
// ---------------------------------------------------------------------------

describe('DriversService.goOnline', () => {
  it('sets online=true for approved driver with docs and vehicle', async () => {
    const driversRepo = makeDriversRepo({
      findByUserId: jest.fn().mockResolvedValue(makeDriver({ status: 'approved' })),
      setOnline: jest.fn().mockResolvedValue(undefined),
    });
    const documentsRepo = makeDocumentsRepo({ hasExpiredRequiredDocs: jest.fn().mockResolvedValue(false) });
    const vehiclesRepo = makeVehiclesRepo({ findActiveByDriver: jest.fn().mockResolvedValue(makeVehicle()) });
    const db = makeDb();
    const svc = new DriversService(driversRepo, documentsRepo, vehiclesRepo, makeUsersRepo(), makeRedis() as never, db as never);

    const result = await svc.goOnline('user-001');
    expect(result.online).toBe(true);
    expect(driversRepo.setOnline).toHaveBeenCalledWith('driver-001', true);
  });

  it('throws DRIVER_NOT_APPROVED if status is pending', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver({ status: 'pending' })) });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await expect(svc.goOnline('user-001')).rejects.toMatchObject({ code: 'DRIVER_NOT_APPROVED' });
  });

  it('throws DOCUMENTS_EXPIRED if a required doc is expired', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver({ status: 'approved' })) });
    const documentsRepo = makeDocumentsRepo({ hasExpiredRequiredDocs: jest.fn().mockResolvedValue(true) });
    const svc = new DriversService(driversRepo, documentsRepo, makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await expect(svc.goOnline('user-001')).rejects.toMatchObject({ code: 'DOCUMENTS_EXPIRED' });
  });

  it('throws NO_ACTIVE_VEHICLE if driver has no active vehicle', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver({ status: 'approved' })) });
    const documentsRepo = makeDocumentsRepo({ hasExpiredRequiredDocs: jest.fn().mockResolvedValue(false) });
    const vehiclesRepo = makeVehiclesRepo({ findActiveByDriver: jest.fn().mockResolvedValue(undefined) });
    const svc = new DriversService(driversRepo, documentsRepo, vehiclesRepo, makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await expect(svc.goOnline('user-001')).rejects.toMatchObject({ code: 'NO_ACTIVE_VEHICLE' });
  });

  it('writes audit_log entry', async () => {
    const dbInsertMock = jest.fn().mockResolvedValue([]);
    const dbMock = jest.fn().mockReturnValue({ insert: dbInsertMock });
    const driversRepo = makeDriversRepo({
      findByUserId: jest.fn().mockResolvedValue(makeDriver({ status: 'approved' })),
      setOnline: jest.fn().mockResolvedValue(undefined),
    });
    const documentsRepo = makeDocumentsRepo({ hasExpiredRequiredDocs: jest.fn().mockResolvedValue(false) });
    const vehiclesRepo = makeVehiclesRepo({ findActiveByDriver: jest.fn().mockResolvedValue(makeVehicle()) });
    const svc = new DriversService(driversRepo, documentsRepo, vehiclesRepo, makeUsersRepo(), makeRedis() as never, dbMock as never);

    await svc.goOnline('user-001');
    expect(dbMock).toHaveBeenCalledWith('audit_logs');
  });
});

// ---------------------------------------------------------------------------
// DriversService.goOffline
// ---------------------------------------------------------------------------

describe('DriversService.goOffline', () => {
  it('sets online=false and deletes Redis location key', async () => {
    const driversRepo = makeDriversRepo({
      findByUserId: jest.fn().mockResolvedValue(makeDriver({ online: true })),
      setOnline: jest.fn().mockResolvedValue(undefined),
    });
    const redis = makeRedis();
    const db = makeDb();
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), redis as never, db as never);

    const result = await svc.goOffline('user-001');
    expect(result.online).toBe(false);
    expect(redis.del).toHaveBeenCalledWith('driver:driver-001:location');
  });

  it('is idempotent — succeeds even if already offline', async () => {
    const driversRepo = makeDriversRepo({
      findByUserId: jest.fn().mockResolvedValue(makeDriver({ online: false })),
      setOnline: jest.fn().mockResolvedValue(undefined),
    });
    const db = makeDb();
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, db as never);

    await expect(svc.goOffline('user-001')).resolves.toEqual({ online: false });
  });
});

// ---------------------------------------------------------------------------
// DriversService.updateLocation
// ---------------------------------------------------------------------------

describe('DriversService.updateLocation', () => {
  it('writes lat/lng to Redis HSET with 5-minute TTL', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver({ online: true })) });
    const redis = makeRedis();
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), redis as never, makeDb() as never);

    await svc.updateLocation('user-001', { latitude: 19.4326, longitude: -99.1332 });

    expect(redis.hset).toHaveBeenCalledWith('driver:driver-001:location', expect.objectContaining({
      lat: '19.4326',
      lng: '-99.1332',
    }));
    expect(redis.expire).toHaveBeenCalledWith('driver:driver-001:location', 300);
  });

  it('throws DRIVER_OFFLINE if driver.online is false', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver({ online: false })) });
    const svc = new DriversService(driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);

    await expect(svc.updateLocation('user-001', { latitude: 19.4326, longitude: -99.1332 }))
      .rejects.toMatchObject({ code: 'DRIVER_OFFLINE' });
  });

  it('calls trackingService.recordLocation when trackingService is provided', async () => {
    const driversRepo = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(makeDriver({ online: true })) });
    const trackingService = { recordLocation: jest.fn().mockResolvedValue(undefined) };
    const svc = new DriversService(
      driversRepo, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(),
      makeRedis() as never, makeDb() as never,
      trackingService as never,
    );

    await svc.updateLocation('user-001', { latitude: 19.4326, longitude: -99.1332 });

    expect(trackingService.recordLocation).toHaveBeenCalledWith('driver-001', 19.4326, -99.1332);
  });
});

// ---------------------------------------------------------------------------
// DriversService — DRIVER_NOT_FOUND coverage across remaining methods
// ---------------------------------------------------------------------------

describe('DriversService — DRIVER_NOT_FOUND in remaining methods', () => {
  const notFound = makeDriversRepo({ findByUserId: jest.fn().mockResolvedValue(undefined) });

  it('getDocuments: throws DRIVER_NOT_FOUND', async () => {
    const svc = new DriversService(notFound, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);
    await expect(svc.getDocuments('user-001')).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });

  it('submitDocument: throws DRIVER_NOT_FOUND', async () => {
    const svc = new DriversService(notFound, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);
    await expect(svc.submitDocument('user-001', { requirementId: 'req-1', fileUrl: 'https://x.com/f.pdf' }))
      .rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });

  it('getVehicles: throws DRIVER_NOT_FOUND', async () => {
    const svc = new DriversService(notFound, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);
    await expect(svc.getVehicles('user-001')).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });

  it('registerVehicle: throws DRIVER_NOT_FOUND', async () => {
    const svc = new DriversService(notFound, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);
    await expect(svc.registerVehicle('user-001', { make: 'Toyota', model: 'Corolla', year: 2020, color: 'Blanco', licensePlate: 'ABC-123' }))
      .rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });

  it('goOnline: throws DRIVER_NOT_FOUND', async () => {
    const svc = new DriversService(notFound, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);
    await expect(svc.goOnline('user-001')).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });

  it('goOffline: throws DRIVER_NOT_FOUND', async () => {
    const svc = new DriversService(notFound, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);
    await expect(svc.goOffline('user-001')).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });

  it('updateLocation: throws DRIVER_NOT_FOUND', async () => {
    const svc = new DriversService(notFound, makeDocumentsRepo(), makeVehiclesRepo(), makeUsersRepo(), makeRedis() as never, makeDb() as never);
    await expect(svc.updateLocation('user-001', { latitude: 19.4, longitude: -99.1 }))
      .rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
  });
});
