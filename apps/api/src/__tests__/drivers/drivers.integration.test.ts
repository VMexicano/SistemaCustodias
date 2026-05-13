/**
 * Drivers module — integration tests
 *
 * Uses real PostgreSQL + Redis via Testcontainers.
 * Covers: register, profile, documents, vehicles, go-online/offline, location, admin review.
 * Timeout: 120 s — containers start takes ~30 s on first run.
 */

import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';

import { startTestContainers, type TestContainers } from '../../shared/test/containers.js';
import { buildIntegrationApp } from '../../shared/test/build-integration-app.js';
import type { OTPChannel } from '../../modules/auth/otp/otp-channel.interface.js';

// ---------------------------------------------------------------------------
// TestOTPChannel
// ---------------------------------------------------------------------------

class TestOTPChannel implements OTPChannel {
  private _lastOtp: string | null = null;

  async send(_phone: string, otp: string): Promise<void> {
    this._lastOtp = otp;
  }

  get lastOtp(): string {
    if (this._lastOtp === null) throw new Error('No OTP sent yet');
    return this._lastOtp;
  }

  reset(): void {
    this._lastOtp = null;
  }
}

// ---------------------------------------------------------------------------
// Suite globals
// ---------------------------------------------------------------------------

jest.setTimeout(120_000);

let containers: TestContainers;
let app: FastifyInstance;
let db: Knex;
let teardown: () => Promise<void>;
let otpChannel: TestOTPChannel;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  containers = await startTestContainers();

  process.env['JWT_SECRET'] = 'test-secret-minimum-32-characters-long-for-testing';
  process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-minimum-32-chars-long-test';
  process.env['JWT_ACCESS_EXPIRES_IN'] = '15m';
  process.env['JWT_REFRESH_EXPIRES_IN'] = '30d';

  otpChannel = new TestOTPChannel();

  const result = await buildIntegrationApp({
    postgresUrl: containers.postgresUrl,
    redisUrl: containers.redisUrl,
    otpChannel,
  });

  app = result.app;
  db = result.db as Knex;
  teardown = result.teardown;

  await app.ready();
}, 120_000);

afterAll(async () => {
  await teardown();
  await containers.stop();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function registerAndVerify(phone: string, fullName: string) {
  otpChannel.reset();
  await app.inject({ method: 'POST', url: '/auth/register', payload: { phone, fullName } });
  const otp = otpChannel.lastOtp;
  const res = await app.inject({ method: 'POST', url: '/auth/verify-phone', payload: { phone, otp } });
  return JSON.parse(res.body) as { accessToken: string; user: { id: string } };
}

async function getAdminToken(): Promise<string> {
  // Admin user is created by seed 04_admin_user.ts with phone +525500000001
  // We need to trigger OTP flow for admin
  otpChannel.reset();
  await app.inject({ method: 'POST', url: '/auth/login', payload: { phone: '+525500000001' } });
  const otp = otpChannel.lastOtp;
  const res = await app.inject({
    method: 'POST',
    url: '/auth/verify-phone',
    payload: { phone: '+525500000001', otp },
  });
  const body = JSON.parse(res.body) as { accessToken?: string };
  if (!body.accessToken) throw new Error('Admin login failed');
  return body.accessToken;
}

let requirementId: string;

beforeAll(async () => {
  // Fetch a real document requirement ID for tests
  const req = await db('document_requirements')
    .join('region_config', 'document_requirements.region_id', 'region_config.id')
    .where('region_config.country_code', 'MX')
    .where('document_requirements.required', true)
    .select('document_requirements.id')
    .first() as { id: string } | undefined;

  if (!req) throw new Error('No document requirements found — seed 05 may not have run');
  requirementId = req.id;
}, 120_000);

// ---------------------------------------------------------------------------
// POST /drivers/register
// ---------------------------------------------------------------------------

describe('POST /drivers/register', () => {
  it('returns 201 with DriverDTO for valid payload', async () => {
    const { accessToken } = await registerAndVerify('+521111111101', 'Driver Register Test');
    const res = await app.inject({
      method: 'POST',
      url: '/drivers/register',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        licenseNumber: 'LIC-001',
        licenseExpiry: '2030-06-30',
        serviceModes: ['people'],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.driver.status).toBe('pending');
    expect(body.driver.serviceModes).toEqual(['people']);
  });

  it('returns 409 DRIVER_ALREADY_REGISTERED on duplicate', async () => {
    const { accessToken } = await registerAndVerify('+521111111102', 'Driver Dup Test');
    const payload = { licenseNumber: 'LIC-002', licenseExpiry: '2030-06-30', serviceModes: ['people'] };
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload });
    const res = await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('DRIVER_ALREADY_REGISTERED');
  });

  it('returns 422 with invalid serviceModes (empty array)', async () => {
    const { accessToken } = await registerAndVerify('+521111111103', 'Driver Invalid Test');
    const res = await app.inject({
      method: 'POST',
      url: '/drivers/register',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { licenseNumber: 'LIC-003', licenseExpiry: '2030-06-30', serviceModes: [] },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/drivers/register',
      payload: { licenseNumber: 'LIC-XXX', licenseExpiry: '2030-06-30', serviceModes: ['people'] },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET/PATCH /drivers/me
// ---------------------------------------------------------------------------

describe('GET /drivers/me', () => {
  it('returns 200 with DriverDTO for authenticated driver', async () => {
    const { accessToken } = await registerAndVerify('+521111111104', 'Driver Get Test');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-004', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({ method: 'GET', url: '/drivers/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('pending');
  });

  it('returns 404 DRIVER_NOT_FOUND for user without driver profile', async () => {
    const { accessToken } = await registerAndVerify('+521111111105', 'No Driver Profile');
    const res = await app.inject({ method: 'GET', url: '/drivers/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(404);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/drivers/me' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /drivers/me', () => {
  it('returns 200 and updates profile fields', async () => {
    const { accessToken } = await registerAndVerify('+521111111106', 'Driver Patch Test');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-006', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({
      method: 'PATCH',
      url: '/drivers/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { licenseNumber: 'LIC-006-UPDATED' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).licenseNumber).toBe('LIC-006-UPDATED');
  });
});

// ---------------------------------------------------------------------------
// GET/POST /drivers/me/documents
// ---------------------------------------------------------------------------

describe('GET /drivers/me/documents', () => {
  it('returns 200 with all region requirements', async () => {
    const { accessToken } = await registerAndVerify('+521111111107', 'Driver Docs Get');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-007', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({ method: 'GET', url: '/drivers/me/documents', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    const docs = JSON.parse(res.body) as { documentStatus: string }[];
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]!.documentStatus).toBe('not_submitted');
  });
});

describe('POST /drivers/me/documents', () => {
  it('returns 201 with DriverDocumentDTO', async () => {
    const { accessToken } = await registerAndVerify('+521111111108', 'Driver Doc Submit');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-008', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({
      method: 'POST',
      url: '/drivers/me/documents',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { requirementId, fileUrl: 'https://example.com/license.pdf' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).status).toBe('pending');
  });

  it('returns 404 REQUIREMENT_NOT_FOUND for invalid requirementId', async () => {
    const { accessToken } = await registerAndVerify('+521111111109', 'Driver Doc Bad Req');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-009', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({
      method: 'POST',
      url: '/drivers/me/documents',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { requirementId: '00000000-0000-0000-0000-000000000000', fileUrl: 'https://example.com/doc.pdf' },
    });
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET/POST /drivers/me/vehicles
// ---------------------------------------------------------------------------

describe('GET /drivers/me/vehicles', () => {
  it('returns 200 with empty array for driver with no vehicles', async () => {
    const { accessToken } = await registerAndVerify('+521111111110', 'Driver No Vehicles');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-010', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({ method: 'GET', url: '/drivers/me/vehicles', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });
});

describe('POST /drivers/me/vehicles', () => {
  it('returns 201 with VehicleDTO, first vehicle is active', async () => {
    const { accessToken } = await registerAndVerify('+521111111111', 'Driver Vehicle Register');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-011', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({
      method: 'POST',
      url: '/drivers/me/vehicles',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { make: 'Toyota', model: 'Corolla', year: 2020, color: 'Blanco', licensePlate: 'TST-001' },
    });
    expect(res.statusCode).toBe(201);
    const vehicle = JSON.parse(res.body);
    expect(vehicle.active).toBe(true);
    expect(vehicle.status).toBe('pending');
  });

  it('returns 409 VEHICLE_PLATE_DUPLICATE for duplicate plate', async () => {
    const { accessToken: tok1 } = await registerAndVerify('+521111111112', 'Driver A Dup Plate');
    const { accessToken: tok2 } = await registerAndVerify('+521111111113', 'Driver B Dup Plate');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${tok1}` }, payload: { licenseNumber: 'LIC-012', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${tok2}` }, payload: { licenseNumber: 'LIC-013', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const plate = { make: 'Toyota', model: 'Corolla', year: 2020, color: 'Rojo', licensePlate: 'DUP-999' };
    await app.inject({ method: 'POST', url: '/drivers/me/vehicles', headers: { authorization: `Bearer ${tok1}` }, payload: plate });
    const res = await app.inject({ method: 'POST', url: '/drivers/me/vehicles', headers: { authorization: `Bearer ${tok2}` }, payload: plate });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('VEHICLE_PLATE_DUPLICATE');
  });
});

// ---------------------------------------------------------------------------
// POST /drivers/me/go-online + go-offline
// ---------------------------------------------------------------------------

describe('POST /drivers/me/go-online', () => {
  it('returns 200 { online: true } for approved driver', async () => {
    // Full approval flow via admin
    const { accessToken } = await registerAndVerify('+521111111114', 'Driver Go Online');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-014', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    // Get driver id
    const profileRes = await app.inject({ method: 'GET', url: '/drivers/me', headers: { authorization: `Bearer ${accessToken}` } });
    const driverId = JSON.parse(profileRes.body).id as string;

    // Submit all required documents
    const allReqs = await db('document_requirements')
      .join('region_config', 'document_requirements.region_id', 'region_config.id')
      .where('region_config.country_code', 'MX')
      .where('document_requirements.required', true)
      .select('document_requirements.id') as { id: string }[];

    const docIds: string[] = [];
    for (const req of allReqs) {
      const docRes = await app.inject({
        method: 'POST',
        url: '/drivers/me/documents',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { requirementId: req.id, fileUrl: 'https://example.com/doc.pdf' },
      });
      docIds.push((JSON.parse(docRes.body) as { id: string }).id);
    }

    // Register vehicle
    await app.inject({ method: 'POST', url: '/drivers/me/vehicles', headers: { authorization: `Bearer ${accessToken}` }, payload: { make: 'Toyota', model: 'Corolla', year: 2020, color: 'Blanco', licensePlate: `GON-${driverId.slice(0, 6)}` } });

    // Admin approves all documents
    const adminToken = await getAdminToken();
    for (const docId of docIds) {
      await app.inject({
        method: 'PATCH',
        url: `/admin/documents/${docId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'approved' },
      });
    }

    // Now go online
    const res = await app.inject({ method: 'POST', url: '/drivers/me/go-online', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).online).toBe(true);
  });

  it('returns 403 DRIVER_NOT_APPROVED for pending driver', async () => {
    const { accessToken } = await registerAndVerify('+521111111115', 'Driver Not Approved');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-015', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({ method: 'POST', url: '/drivers/me/go-online', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('DRIVER_NOT_APPROVED');
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'POST', url: '/drivers/me/go-online' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /drivers/me/go-offline', () => {
  it('returns 200 { online: false }', async () => {
    const { accessToken } = await registerAndVerify('+521111111116', 'Driver Go Offline');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-016', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({ method: 'POST', url: '/drivers/me/go-offline', headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).online).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PATCH /drivers/me/location
// ---------------------------------------------------------------------------

describe('PATCH /drivers/me/location', () => {
  it('returns 403 DRIVER_OFFLINE for offline driver', async () => {
    const { accessToken } = await registerAndVerify('+521111111117', 'Driver Location Offline');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-017', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({
      method: 'PATCH',
      url: '/drivers/me/location',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { latitude: 19.4326, longitude: -99.1332 },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('DRIVER_OFFLINE');
  });

  it('returns 422 with invalid coordinates (lat > 90)', async () => {
    const { accessToken } = await registerAndVerify('+521111111118', 'Driver Location Invalid');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-018', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const res = await app.inject({
      method: 'PATCH',
      url: '/drivers/me/location',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { latitude: 999, longitude: -99.1332 },
    });
    expect(res.statusCode).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// PATCH /admin/documents/:documentId
// ---------------------------------------------------------------------------

describe('PATCH /admin/documents/:documentId', () => {
  it('returns 200 DriverDocumentDTO for admin', async () => {
    const { accessToken } = await registerAndVerify('+521111111119', 'Driver Admin Review');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-019', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });
    const docRes = await app.inject({ method: 'POST', url: '/drivers/me/documents', headers: { authorization: `Bearer ${accessToken}` }, payload: { requirementId, fileUrl: 'https://example.com/doc.pdf' } });
    const docId = (JSON.parse(docRes.body) as { id: string }).id;

    const adminToken = await getAdminToken();
    const res = await app.inject({ method: 'PATCH', url: `/admin/documents/${docId}`, headers: { authorization: `Bearer ${adminToken}` }, payload: { status: 'approved' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('approved');
  });

  it('returns 403 FORBIDDEN for non-admin token', async () => {
    const { accessToken } = await registerAndVerify('+521111111120', 'Driver Non Admin');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-020', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });
    const docRes = await app.inject({ method: 'POST', url: '/drivers/me/documents', headers: { authorization: `Bearer ${accessToken}` }, payload: { requirementId, fileUrl: 'https://example.com/doc.pdf' } });
    const docId = (JSON.parse(docRes.body) as { id: string }).id;

    const res = await app.inject({ method: 'PATCH', url: `/admin/documents/${docId}`, headers: { authorization: `Bearer ${accessToken}` }, payload: { status: 'approved' } });
    expect(res.statusCode).toBe(403);
  });

  it('returns 422 on rejected without rejectionReason', async () => {
    const { accessToken } = await registerAndVerify('+521111111121', 'Driver Reject No Reason');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-021', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });
    const docRes = await app.inject({ method: 'POST', url: '/drivers/me/documents', headers: { authorization: `Bearer ${accessToken}` }, payload: { requirementId, fileUrl: 'https://example.com/doc.pdf' } });
    const docId = (JSON.parse(docRes.body) as { id: string }).id;

    const adminToken = await getAdminToken();
    const res = await app.inject({ method: 'PATCH', url: `/admin/documents/${docId}`, headers: { authorization: `Bearer ${adminToken}` }, payload: { status: 'rejected' } });
    expect(res.statusCode).toBe(422);
  });

  it('auto-approves driver when all required docs are approved', async () => {
    const { accessToken } = await registerAndVerify('+521111111122', 'Driver Auto Approve');
    await app.inject({ method: 'POST', url: '/drivers/register', headers: { authorization: `Bearer ${accessToken}` }, payload: { licenseNumber: 'LIC-022', licenseExpiry: '2030-06-30', serviceModes: ['people'] } });

    const allReqs = await db('document_requirements')
      .join('region_config', 'document_requirements.region_id', 'region_config.id')
      .where('region_config.country_code', 'MX')
      .where('document_requirements.required', true)
      .select('document_requirements.id') as { id: string }[];

    const docIds: string[] = [];
    for (const req of allReqs) {
      const docRes = await app.inject({ method: 'POST', url: '/drivers/me/documents', headers: { authorization: `Bearer ${accessToken}` }, payload: { requirementId: req.id, fileUrl: 'https://example.com/doc.pdf' } });
      docIds.push((JSON.parse(docRes.body) as { id: string }).id);
    }

    const adminToken = await getAdminToken();
    for (const docId of docIds) {
      await app.inject({ method: 'PATCH', url: `/admin/documents/${docId}`, headers: { authorization: `Bearer ${adminToken}` }, payload: { status: 'approved' } });
    }

    const profileRes = await app.inject({ method: 'GET', url: '/drivers/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect(JSON.parse(profileRes.body).status).toBe('approved');
  });
});
