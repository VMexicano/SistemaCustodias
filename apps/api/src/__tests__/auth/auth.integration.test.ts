/**
 * Auth + Users — integration tests
 *
 * Uses real PostgreSQL + Redis via Testcontainers.
 * A TestOTPChannel captures the sent OTP so tests can use it in verify-phone.
 * StripeService is replaced with a simple in-memory mock.
 *
 * Timeout: 120 s — container start takes ~30 s on first run.
 */

import type { FastifyInstance } from 'fastify';
import type { Knex } from 'knex';

import { startTestContainers, type TestContainers } from '../../shared/test/containers.js';
import {
  buildIntegrationApp,
} from '../../shared/test/build-integration-app.js';
import type { OTPChannel } from '../../modules/auth/otp/otp-channel.interface.js';

// ---------------------------------------------------------------------------
// TestOTPChannel — captures the last OTP for use in tests
// ---------------------------------------------------------------------------

class TestOTPChannel implements OTPChannel {
  private _lastOtp: string | null = null;
  private _lastPhone: string | null = null;

  async send(phone: string, otp: string): Promise<void> {
    this._lastPhone = phone;
    this._lastOtp = otp;
  }

  get lastOtp(): string {
    if (this._lastOtp === null) {
      throw new Error('TestOTPChannel: no OTP has been sent yet');
    }
    return this._lastOtp;
  }

  get lastPhone(): string | null {
    return this._lastPhone;
  }

  reset(): void {
    this._lastOtp = null;
    this._lastPhone = null;
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

  // Ensure required env vars are present for JWTService (reads from env module)
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
// Helper: full register → verify-phone flow
// Returns { accessToken, refreshToken, user }
// ---------------------------------------------------------------------------

async function registerAndVerify(phone: string, fullName: string) {
  otpChannel.reset();

  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { phone, fullName },
  });

  const capturedOtp = otpChannel.lastOtp;

  const verifyRes = await app.inject({
    method: 'POST',
    url: '/auth/verify-phone',
    payload: { phone, otp: capturedOtp },
  });

  return JSON.parse(verifyRes.body) as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; phone: string };
  };
}

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

describe('POST /auth/register', () => {
  it('returns 201 with expiresIn for a valid phone and name', async () => {
    otpChannel.reset();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { phone: '+525511111001', fullName: 'Test User One' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.expiresIn).toBe(600);
  });

  it('returns 409 PHONE_ALREADY_REGISTERED on duplicate phone', async () => {
    const phone = '+525511111002';
    otpChannel.reset();
    // First registration
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { phone, fullName: 'Duplicate User' },
    });

    // Second registration with same phone
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { phone, fullName: 'Duplicate User' },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('PHONE_ALREADY_REGISTERED');
  });

  it('returns 422 with invalid phone format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { phone: 'not-a-phone', fullName: 'Bad Phone' },
    });

    expect(res.statusCode).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST /auth/verify-phone
// ---------------------------------------------------------------------------

describe('POST /auth/verify-phone', () => {
  it('returns 200 with access_token and refresh_token after valid registration', async () => {
    const phone = '+525511111010';
    otpChannel.reset();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { phone, fullName: 'Verify User' },
    });

    const capturedOtp = otpChannel.lastOtp;

    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-phone',
      payload: { phone, otp: capturedOtp },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    expect(body.user.phone).toBe(phone);
  });

  it('returns 400 OTP_INVALID with a wrong OTP', async () => {
    const phone = '+525511111011';
    otpChannel.reset();

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { phone, fullName: 'Wrong OTP User' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/verify-phone',
      payload: { phone, otp: '000000' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('OTP_INVALID');
  });
});

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

describe('POST /auth/login', () => {
  it('returns 200 for an existing, verified user', async () => {
    const phone = '+525511111020';
    await registerAndVerify(phone, 'Login User');

    otpChannel.reset();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.expiresIn).toBe(600);
  });

  it('returns 404 USER_NOT_FOUND for an unknown phone', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { phone: '+525599999999' },
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('USER_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

describe('POST /auth/refresh', () => {
  it('returns 200 with a new token pair', async () => {
    const phone = '+525511111030';
    const { refreshToken } = await registerAndVerify(phone, 'Refresh User');

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.accessToken).toBe('string');
    expect(typeof body.refreshToken).toBe('string');
    // New refresh token should be different from the old one
    expect(body.refreshToken).not.toBe(refreshToken);
  });

  it('returns 401 TOKEN_INVALID after using the same refresh token twice (rotation)', async () => {
    const phone = '+525511111031';
    const { refreshToken } = await registerAndVerify(phone, 'Rotation User');

    // First use — should succeed and rotate
    const first = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(first.statusCode).toBe(200);

    // Second use of the original token — must be rejected (blacklisted)
    const second = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(second.statusCode).toBe(401);
    const body = JSON.parse(second.body);
    expect(body.error.code).toBe('TOKEN_INVALID');
  });
});

// ---------------------------------------------------------------------------
// GET /users/me
// ---------------------------------------------------------------------------

describe('GET /users/me', () => {
  it('returns 200 with UserDTO when authenticated', async () => {
    const phone = '+525511111040';
    const { accessToken } = await registerAndVerify(phone, 'Me User');

    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.phone).toBe(phone);
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/me',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /users/me
// ---------------------------------------------------------------------------

describe('PATCH /users/me', () => {
  it('returns 200 and updates full_name', async () => {
    const phone = '+525511111050';
    const { accessToken } = await registerAndVerify(phone, 'Old Name');

    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { full_name: 'New Name' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.full_name).toBe('New Name');
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me',
      payload: { full_name: 'Someone' },
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /users/me/payment-methods
// ---------------------------------------------------------------------------

describe('POST /users/me/payment-methods', () => {
  it('returns 200 with client_secret and setup_intent_id', async () => {
    const phone = '+525511111060';
    const { accessToken } = await registerAndVerify(phone, 'Pay User');

    const res = await app.inject({
      method: 'POST',
      url: '/users/me/payment-methods',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.clientSecret).toBe('string');
    expect(typeof body.setupIntentId).toBe('string');
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users/me/payment-methods',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /users/me/payment-methods
// ---------------------------------------------------------------------------

describe('GET /users/me/payment-methods', () => {
  it('returns 200 with an empty array when user has no payment methods', async () => {
    const phone = '+525511111070';
    const { accessToken } = await registerAndVerify(phone, 'Empty Pay User');

    const res = await app.inject({
      method: 'GET',
      url: '/users/me/payment-methods',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users/me/payment-methods',
    });

    expect(res.statusCode).toBe(401);
  });
});
