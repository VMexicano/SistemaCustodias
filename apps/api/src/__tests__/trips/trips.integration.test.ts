/**
 * Trips module — integration tests (TRIP-003)
 *
 * Uses real PostgreSQL + Redis via Testcontainers.
 * Covers: create trip, accept, status transitions, cancel, change destination,
 *         active trip, history, concurrency.
 * Timeout: 120 s — containers take ~30 s on first run.
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
  const body = JSON.parse(res.body) as { accessToken: string; user: { id: string } };
  return body;
}

/**
 * Register driver user, create driver profile, then directly set status to 'approved'
 * in the DB so the driver can accept trips without going through the full admin flow.
 */
async function createApprovedDriver(phone: string, fullName: string, licenseNumber: string) {
  const { accessToken, user } = await registerAndVerify(phone, fullName);

  // Register driver profile
  await app.inject({
    method: 'POST',
    url: '/drivers/register',
    headers: { authorization: `Bearer ${accessToken}` },
    payload: {
      licenseNumber,
      licenseExpiry: '2030-06-30',
      serviceModes: ['people'],
    },
  });

  // Approve driver directly in DB (driver role was already added by drivers.service.register)
  await db('drivers').where('user_id', user.id).update({ status: 'approved' });

  // Get a fresh token with updated roles
  otpChannel.reset();
  await app.inject({ method: 'POST', url: '/auth/login', payload: { phone } });
  const otp2 = otpChannel.lastOtp;
  const res2 = await app.inject({ method: 'POST', url: '/auth/verify-phone', payload: { phone, otp: otp2 } });
  const body2 = JSON.parse(res2.body) as { accessToken: string; user: { id: string } };

  // Get driver record id
  const driver = await db('drivers').where('user_id', user.id).first() as { id: string };

  return { accessToken: body2.accessToken, userId: user.id, driverId: driver.id };
}

let tripTypeId: string;

beforeAll(async () => {
  const tt = await db('trip_types')
    .join('region_config', 'trip_types.region_id', 'region_config.id')
    .where('region_config.country_code', 'MX')
    .where('trip_types.code', 'basic')
    .select('trip_types.id')
    .first() as { id: string } | undefined;

  if (!tt) throw new Error('trip_types seed not found — check seeds');
  tripTypeId = tt.id;
}, 120_000);

const ORIGIN = { lat: 19.4326, lng: -99.1332, address: 'CDMX Centro' };
const DESTINATION = { lat: 19.5011, lng: -99.1460, address: 'Polanco' };

// ---------------------------------------------------------------------------
// POST /trips
// ---------------------------------------------------------------------------

describe('POST /trips', () => {
  it('crea viaje — estado final SEARCHING', async () => {
    const { accessToken } = await registerAndVerify('+5299900010', 'Pax Create Trip');

    const res = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { id: string; status: string; estimated_fare: number; currency: string };
    expect(body.status).toBe('SEARCHING');
    expect(body.estimated_fare).toBeGreaterThan(0);
    expect(body.currency).toBe('MXN');
  });

  it('409 si pasajero ya tiene viaje activo (R-TRIP-001)', async () => {
    const { accessToken } = await registerAndVerify('+5299900011', 'Pax Double Trip');

    await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('PASSENGER_HAS_ACTIVE_TRIP');
  });

  it('404 si trip_type_id no existe', async () => {
    const { accessToken } = await registerAndVerify('+5299900012', 'Pax Bad Type');

    const res = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        origin: ORIGIN,
        destination: DESTINATION,
        trip_type_id: '00000000-0000-0000-0000-000000000000',
      },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('TRIP_TYPE_NOT_FOUND');
  });

  it('401 sin JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/trips',
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /trips/:id/accept
// ---------------------------------------------------------------------------

describe('PATCH /trips/:id/accept', () => {
  it('driver acepta — viaje pasa a ACCEPTED', async () => {
    const { accessToken: paxToken } = await registerAndVerify('+5299900020', 'Pax Accept Test');
    const { accessToken: driverToken } = await createApprovedDriver('+5299900021', 'Driver Accept Test', 'LIC-ACC-01');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };

    const acceptRes = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/accept`,
      headers: { authorization: `Bearer ${driverToken}` },
    });

    expect(acceptRes.statusCode).toBe(200);
    const body = JSON.parse(acceptRes.body) as { id: string; status: string; accepted_at: string };
    expect(body.status).toBe('ACCEPTED');
    expect(body.accepted_at).toBeTruthy();
  });

  it('409 si driver ya tiene viaje activo (R-TRIP-002)', async () => {
    const { accessToken: pax1Token } = await registerAndVerify('+5299900022', 'Pax1 Driver Busy');
    const { accessToken: pax2Token } = await registerAndVerify('+5299900023', 'Pax2 Driver Busy');
    const { accessToken: driverToken } = await createApprovedDriver('+5299900024', 'Driver Busy', 'LIC-BUSY-01');

    // Create trip 1 and accept it
    const create1 = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${pax1Token}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId1 } = JSON.parse(create1.body) as { id: string };
    await app.inject({ method: 'PATCH', url: `/trips/${tripId1}/accept`, headers: { authorization: `Bearer ${driverToken}` } });

    // Create trip 2
    const create2 = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${pax2Token}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId2 } = JSON.parse(create2.body) as { id: string };

    // Driver tries to accept trip 2 — should fail
    const res = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId2}/accept`,
      headers: { authorization: `Bearer ${driverToken}` },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('DRIVER_HAS_ACTIVE_TRIP');
  });

  it('409 si viaje no está en SEARCHING', async () => {
    const { accessToken: paxToken } = await registerAndVerify('+5299900025', 'Pax Not Searching');
    const { accessToken: driver1Token } = await createApprovedDriver('+5299900026', 'Driver NotSearch 1', 'LIC-NS-01');
    const { accessToken: driver2Token } = await createApprovedDriver('+5299900027', 'Driver NotSearch 2', 'LIC-NS-02');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };

    // Driver 1 accepts
    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driver1Token}` } });

    // Driver 2 tries to accept the same trip
    const res = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/accept`,
      headers: { authorization: `Bearer ${driver2Token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('TRIP_NOT_IN_SEARCHING');
  });

  it('concurrencia: solo un driver puede aceptar el mismo viaje', async () => {
    const { accessToken: paxToken } = await registerAndVerify('+5299900028', 'Pax Concurrency');
    const { accessToken: driverA } = await createApprovedDriver('+5299900029', 'Driver Concur A', 'LIC-CON-01');
    const { accessToken: driverB } = await createApprovedDriver('+5299900030', 'Driver Concur B', 'LIC-CON-02');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };

    // Two concurrent accept requests
    const [resA, resB] = await Promise.all([
      app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driverA}` } }),
      app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driverB}` } }),
    ]);

    const statuses = [resA.statusCode, resB.statusCode];
    // Exactly one should succeed (200) and one should fail (409)
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// PATCH /trips/:id/status — driver transitions
// ---------------------------------------------------------------------------

describe('PATCH /trips/:id/status (driver transitions)', () => {
  let statusFlowCounter = 0;

  async function setupAcceptedTrip() {
    const n = ++statusFlowCounter;
    const { accessToken: paxToken } = await registerAndVerify(`+529990004${n}0`, `Pax Status Flow ${n}`);
    const { accessToken: driverToken, driverId } = await createApprovedDriver(`+529990004${n}1`, `Driver Status Flow ${n}`, `LIC-SF-0${n}`);

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };

    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driverToken}` } });

    return { paxToken, driverToken, driverId, tripId };
  }

  it('flujo completo: ACCEPTED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS → COMPLETED', async () => {
    const { driverToken, tripId } = await setupAcceptedTrip();

    const patch = async (status: string) =>
      app.inject({
        method: 'PATCH',
        url: `/trips/${tripId}/status`,
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { status },
      });

    let res = await patch('DRIVER_EN_ROUTE');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('DRIVER_EN_ROUTE');

    res = await patch('DRIVER_ARRIVED');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('DRIVER_ARRIVED');

    res = await patch('IN_PROGRESS');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('IN_PROGRESS');

    res = await patch('COMPLETED');
    expect(res.statusCode).toBe(200);
    const completed = JSON.parse(res.body) as { status: string; final_fare: number };
    expect(completed.status).toBe('COMPLETED');
    expect(completed.final_fare).toBeGreaterThan(0);
  });

  it('COMPLETED calcula final_fare correctamente', async () => {
    const { accessToken: paxToken } = await registerAndVerify('+5299900042', 'Pax FinalFare');
    const { accessToken: driverToken } = await createApprovedDriver('+5299900043', 'Driver FinalFare', 'LIC-FF-01');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId, estimated_fare: estimatedFare } = JSON.parse(createRes.body) as { id: string; estimated_fare: number };

    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driverToken}` } });

    for (const status of ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS']) {
      await app.inject({ method: 'PATCH', url: `/trips/${tripId}/status`, headers: { authorization: `Bearer ${driverToken}` }, payload: { status } });
    }

    const res = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/status`,
      headers: { authorization: `Bearer ${driverToken}` },
      payload: { status: 'COMPLETED' },
    });

    const body = JSON.parse(res.body) as { final_fare: number };
    expect(body.final_fare).toBeGreaterThan(0);
    // final_fare should be close to estimated (same route)
    expect(body.final_fare).toBeCloseTo(estimatedFare, 0);
  });

  it('409 INVALID_TRIP_TRANSITION en secuencia inválida', async () => {
    const { driverToken, tripId } = await setupAcceptedTrip();

    // Try to jump directly to COMPLETED from ACCEPTED (skipping states)
    const res = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/status`,
      headers: { authorization: `Bearer ${driverToken}` },
      payload: { status: 'COMPLETED' },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('INVALID_TRIP_TRANSITION');
  });
});

// ---------------------------------------------------------------------------
// PATCH /trips/:id/cancel
// ---------------------------------------------------------------------------

describe('PATCH /trips/:id/cancel', () => {
  it('passenger cancela en ACCEPTED < 120s: fee = 0', async () => {
    const { accessToken: paxToken } = await registerAndVerify('+5299900050', 'Pax Cancel Free');
    const { accessToken: driverToken } = await createApprovedDriver('+5299900051', 'Driver Cancel Free', 'LIC-CF-01');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };
    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driverToken}` } });

    // Cancel immediately (well within 120s window)
    const res = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/cancel`,
      headers: { authorization: `Bearer ${paxToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string; cancellation_fee: number };
    expect(body.status).toBe('CANCELLED');
    expect(body.cancellation_fee).toBe(0);
  });

  it('driver cancela en ACCEPTED: fee = 0', async () => {
    const { accessToken: paxToken } = await registerAndVerify('+5299900052', 'Pax Driver Cancel');
    const { accessToken: driverToken } = await createApprovedDriver('+5299900053', 'Driver Driver Cancel', 'LIC-DC-01');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };
    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driverToken}` } });

    const res = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/cancel`,
      headers: { authorization: `Bearer ${driverToken}` },
      payload: { reason: 'Cannot reach pickup' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string; cancellation_fee: number };
    expect(body.status).toBe('CANCELLED');
    expect(body.cancellation_fee).toBe(0);
  });

  it('409 si viaje ya está en estado final', async () => {
    const { accessToken: paxToken } = await registerAndVerify('+5299900054', 'Pax Cancel Final');
    const { accessToken: driverToken } = await createApprovedDriver('+5299900055', 'Driver Cancel Final', 'LIC-DF-01');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };
    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driverToken}` } });
    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/cancel`, headers: { authorization: `Bearer ${paxToken}` }, payload: {} });

    // Try to cancel again
    const res = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/cancel`,
      headers: { authorization: `Bearer ${paxToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('TRIP_CANNOT_BE_CANCELLED');
  });
});

// ---------------------------------------------------------------------------
// PATCH /trips/:id/destination
// ---------------------------------------------------------------------------

describe('PATCH /trips/:id/destination', () => {
  let destFlowCounter = 0;

  async function createInProgressTrip() {
    const n = ++destFlowCounter;
    const { accessToken: paxToken, user } = await registerAndVerify(`+529990006${n}0`, `Pax Destination ${n}`);
    const { accessToken: driverToken } = await createApprovedDriver(`+529990006${n}1`, `Driver Destination ${n}`, `LIC-DEST-0${n}`);

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };

    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driverToken}` } });
    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/status`, headers: { authorization: `Bearer ${driverToken}` }, payload: { status: 'DRIVER_EN_ROUTE' } });
    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/status`, headers: { authorization: `Bearer ${driverToken}` }, payload: { status: 'DRIVER_ARRIVED' } });
    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/status`, headers: { authorization: `Bearer ${driverToken}` }, payload: { status: 'IN_PROGRESS' } });

    return { paxToken, driverToken, tripId, userId: user.id };
  }

  it('cambia destino en IN_PROGRESS — retorna nuevo estimado', async () => {
    const { paxToken, tripId } = await createInProgressTrip();

    const newDest = { lat: 19.3500, lng: -99.1600, address: 'Coyoacán' };
    const res = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/destination`,
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { destination: newDest },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      trip_id: string;
      new_destination: { lat: number; lng: number; address: string };
      new_estimated_fare: number;
      delta_km: number;
      currency: string;
    };
    expect(body.trip_id).toBe(tripId);
    expect(body.new_estimated_fare).toBeGreaterThan(0);
    expect(body.currency).toBe('MXN');
    expect(body.new_destination.address).toBe('Coyoacán');
  });

  it('409 si no está IN_PROGRESS', async () => {
    const { accessToken: paxToken } = await registerAndVerify('+5299900062', 'Pax Not InProgress');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };

    const res = await app.inject({
      method: 'PATCH',
      url: `/trips/${tripId}/destination`,
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { destination: { lat: 19.35, lng: -99.16, address: 'Nuevo destino' } },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('TRIP_NOT_IN_PROGRESS');
  });
});

// ---------------------------------------------------------------------------
// GET /trips/active
// ---------------------------------------------------------------------------

describe('GET /trips/active', () => {
  it('retorna viaje activo del pasajero', async () => {
    const { accessToken } = await registerAndVerify('+5299900070', 'Pax Active Trip');

    await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/trips/active',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { status: string } | null;
    expect(body).not.toBeNull();
    expect(body!.status).toBe('SEARCHING');
  });

  it('retorna null si no hay viaje activo', async () => {
    const { accessToken } = await registerAndVerify('+5299900071', 'Pax No Active Trip');

    const res = await app.inject({
      method: 'GET',
      url: '/trips/active',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /trips (historial)
// ---------------------------------------------------------------------------

describe('GET /trips (historial)', () => {
  it('retorna solo viajes del pasajero autenticado', async () => {
    const { accessToken: paxA } = await registerAndVerify('+5299900080', 'Pax History A');
    const { accessToken: paxB } = await registerAndVerify('+5299900081', 'Pax History B');
    const { accessToken: driverT } = await createApprovedDriver('+5299900082', 'Driver History', 'LIC-HIST-01');

    // Pax A creates and completes a trip
    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxA}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };

    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/accept`, headers: { authorization: `Bearer ${driverT}` } });
    await app.inject({ method: 'PATCH', url: `/trips/${tripId}/cancel`, headers: { authorization: `Bearer ${paxA}` }, payload: {} });

    // Pax A's history
    const resA = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { authorization: `Bearer ${paxA}` },
    });
    expect(resA.statusCode).toBe(200);
    const bodyA = JSON.parse(resA.body) as { data: unknown[]; total: number };
    expect(bodyA.total).toBeGreaterThanOrEqual(1);

    // Pax B's history should not include pax A's trip
    const resB = await app.inject({
      method: 'GET',
      url: '/trips',
      headers: { authorization: `Bearer ${paxB}` },
    });
    expect(resB.statusCode).toBe(200);
    const bodyB = JSON.parse(resB.body) as { data: unknown[]; total: number };
    expect(bodyB.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /trips/:id
// ---------------------------------------------------------------------------

describe('GET /trips/:id', () => {
  it('retorna detalle completo con status_history', async () => {
    const { accessToken: paxToken } = await registerAndVerify('+5299900090', 'Pax Get Trip');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxToken}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };

    const res = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}`,
      headers: { authorization: `Bearer ${paxToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { id: string; status_history: unknown[] };
    expect(body.id).toBe(tripId);
    expect(Array.isArray(body.status_history)).toBe(true);
    expect(body.status_history.length).toBeGreaterThanOrEqual(1);
  });

  it('404 si no existe', async () => {
    const { accessToken } = await registerAndVerify('+5299900091', 'Pax 404 Trip');

    const res = await app.inject({
      method: 'GET',
      url: '/trips/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('403 si no es actor del viaje', async () => {
    const { accessToken: paxOwner } = await registerAndVerify('+5299900092', 'Pax Owner');
    const { accessToken: paxOther } = await registerAndVerify('+5299900093', 'Pax Other');

    const createRes = await app.inject({
      method: 'POST',
      url: '/trips',
      headers: { authorization: `Bearer ${paxOwner}` },
      payload: { origin: ORIGIN, destination: DESTINATION, trip_type_id: tripTypeId },
    });
    const { id: tripId } = JSON.parse(createRes.body) as { id: string };

    const res = await app.inject({
      method: 'GET',
      url: `/trips/${tripId}`,
      headers: { authorization: `Bearer ${paxOther}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
