/**
 * Pricing module — integration tests
 *
 * Uses real PostgreSQL + Redis via Testcontainers.
 * Covers: POST /trips/estimate — all business rules.
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
let accessToken: string;
let tripTypeId: string;

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

  // Register and verify a user for auth
  otpChannel.reset();
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { phone: '+521234567890', fullName: 'Pricing Test User' },
  });
  const otp = otpChannel.lastOtp;
  const verifyRes = await app.inject({
    method: 'POST',
    url: '/auth/verify-phone',
    payload: { phone: '+521234567890', otp },
  });
  accessToken = (JSON.parse(verifyRes.body) as { accessToken: string }).accessToken;

  // Fetch a real trip type ID from the seeded data
  const tripType = await db('trip_types')
    .join('region_config', 'trip_types.region_id', 'region_config.id')
    .where('region_config.country_code', 'MX')
    .where('trip_types.code', 'basic')
    .select('trip_types.id')
    .first() as { id: string } | undefined;

  if (!tripType) throw new Error('No trip types found — seed 02 may not have run');
  tripTypeId = tripType.id;
}, 120_000);

afterAll(async () => {
  await teardown();
  await containers.stop();
});

// ---------------------------------------------------------------------------
// POST /trips/estimate
// ---------------------------------------------------------------------------

describe('POST /trips/estimate', () => {
  const origin = { lat: 19.4326, lng: -99.1332 }; // CDMX Zócalo
  const destination = { lat: 19.4361, lng: -99.0719 }; // AICM

  it('retorna estimado con factores activos de BD', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/trips/estimate',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { origin, destination, trip_type_id: tripTypeId },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      estimated_distance_km: number;
      estimated_duration_min: number;
      base_fare: number;
      factors_applied: unknown[];
      subtotal: number;
      tax_amount: number;
      final_fare: number;
      currency: string;
      pricing_snapshot: { trip_type_id: string; captured_at: string };
    };
    expect(body.currency).toBe('MXN');
    expect(body.estimated_distance_km).toBeGreaterThan(0);
    expect(body.estimated_duration_min).toBeGreaterThan(0);
    expect(body.base_fare).toBeGreaterThan(0);
    expect(body.subtotal).toBeGreaterThanOrEqual(body.base_fare);
    expect(body.final_fare).toBeGreaterThan(0);
    expect(body.pricing_snapshot.trip_type_id).toBe(tripTypeId);
    expect(body.pricing_snapshot.captured_at).toBeTruthy();
    expect(Array.isArray(body.factors_applied)).toBe(true);
  });

  it('retorna 404 si trip_type_id no existe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/trips/estimate',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        origin,
        destination,
        trip_type_id: '00000000-0000-0000-0000-000000000000',
      },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('TRIP_TYPE_NOT_FOUND');
  });

  it('retorna 422 si origin === destination', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/trips/estimate',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        origin,
        destination: origin, // same as origin
        trip_type_id: tripTypeId,
      },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error.code).toBe('ORIGIN_EQUALS_DESTINATION');
  });

  it('retorna 422 si distancia > 200km', async () => {
    // New York ↔ CDMX is ~3500 km
    const newYork = { lat: 40.7128, lng: -74.006 };
    const res = await app.inject({
      method: 'POST',
      url: '/trips/estimate',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        origin: cdmxFar,
        destination: newYork,
        trip_type_id: tripTypeId,
      },
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).error.code).toBe('DISTANCE_EXCEEDS_LIMIT');
  });

  it('requiere JWT válido de pasajero', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/trips/estimate',
      payload: { origin, destination, trip_type_id: tripTypeId },
    });
    expect(res.statusCode).toBe(401);
  });

  it('retorna 422 si el schema es inválido (lat fuera de rango)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/trips/estimate',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        origin: { lat: 999, lng: -99.1332 },
        destination,
        trip_type_id: tripTypeId,
      },
    });
    expect(res.statusCode).toBe(422);
  });
});

// Used for the > 200km test
const cdmxFar = { lat: 19.4326, lng: -99.1332 };
