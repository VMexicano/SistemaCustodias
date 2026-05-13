/**
 * Smoke test: Trip Estimate API + Admin API
 * Requiere: TEST_MODE=true, servidor en http://localhost:3333
 *
 * All tests run serially to avoid OTP race conditions on the shared admin
 * phone number. A single beforeAll authenticates admin and fetches tripTypeId.
 */
import { test, expect } from '../fixtures/base';

test.describe.configure({ mode: 'serial' });

const ADMIN_PHONE = '+525500000001';
const TEST_OTP = '123456'; // TEST_MODE=true

// Coordenadas CDMX: Ángel de la Independencia → zona Aeropuerto
const ORIGIN = { lat: 19.4326, lng: -99.1332 };
const DESTINATION = { lat: 19.4361, lng: -99.0719 };

// ---------------------------------------------------------------------------
// Suite-level shared state (populated in beforeAll)
// ---------------------------------------------------------------------------

let adminToken: string;
let tripTypeId: string;

test.beforeAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({ baseURL: 'http://localhost:3333' });

  // Authenticate as admin
  await ctx.post('/auth/login', { data: { phone: ADMIN_PHONE } });
  const verifyRes = await ctx.post('/auth/verify-phone', {
    data: { phone: ADMIN_PHONE, otp: TEST_OTP },
  });
  const { accessToken } = await verifyRes.json() as { accessToken: string };
  adminToken = accessToken;

  // Fetch a valid trip_type_id from admin endpoint
  const typesRes = await ctx.get('/admin/trip-types', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const types = await typesRes.json() as Array<{ id: string }>;
  tripTypeId = types[0]!.id;

  await ctx.dispose();
});

// Helper: fresh passenger for each test (no shared state)
async function loginAsPassenger(apiContext: Parameters<Parameters<typeof test>[1]>[0]['apiContext']) {
  const phone = `+521555${Date.now().toString().slice(-7)}`;
  await apiContext.post('/auth/register', {
    data: { phone, fullName: 'E2E Pasajero Estimate' },
  });
  await apiContext.post('/auth/login', { data: { phone } });
  const verifyRes = await apiContext.post('/auth/verify-phone', {
    data: { phone, otp: TEST_OTP },
  });
  const { accessToken } = await verifyRes.json() as { accessToken: string };
  return accessToken;
}

// ---------------------------------------------------------------------------
// Trip Estimate smoke tests
// ---------------------------------------------------------------------------

test('POST /trips/estimate retorna desglose completo', async ({ apiContext }) => {
  const passengerToken = await loginAsPassenger(apiContext);

  const res = await apiContext.post('/trips/estimate', {
    headers: { Authorization: `Bearer ${passengerToken}` },
    data: {
      origin: ORIGIN,
      destination: DESTINATION,
      trip_type_id: tripTypeId,
    },
  });

  expect(res.status()).toBe(200);
  const body = await res.json();

  expect(body).toHaveProperty('estimated_distance_km');
  expect(body).toHaveProperty('estimated_duration_min');
  expect(body).toHaveProperty('subtotal');
  expect(body).toHaveProperty('tax_amount');
  expect(body).toHaveProperty('final_fare');
  expect(body).toHaveProperty('currency', 'MXN');

  expect(body.estimated_distance_km).toBeGreaterThan(0);
  expect(body.subtotal).toBeGreaterThan(0);
  expect(body.final_fare).toBeGreaterThan(0);
});

test('POST /trips/estimate sin auth retorna 401', async ({ apiContext }) => {
  const res = await apiContext.post('/trips/estimate', {
    // No Authorization header
    data: {
      origin: ORIGIN,
      destination: DESTINATION,
      trip_type_id: tripTypeId,
    },
  });
  expect(res.status()).toBe(401);
});

test('POST /trips/estimate con coords inválidas retorna 422', async ({ apiContext }) => {
  const passengerToken = await loginAsPassenger(apiContext);

  const res = await apiContext.post('/trips/estimate', {
    headers: { Authorization: `Bearer ${passengerToken}` },
    data: {
      origin: { lat: 999, lng: -99.1332 }, // lat inválido
      destination: DESTINATION,
      trip_type_id: tripTypeId,
    },
  });
  expect([400, 422]).toContain(res.status());
});

// ---------------------------------------------------------------------------
// Admin API smoke tests
// ---------------------------------------------------------------------------

test('GET /admin/stats retorna métricas correctas', async ({ apiContext }) => {
  const res = await apiContext.get('/admin/stats', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(res.status()).toBe(200);
  const stats = await res.json();
  expect(typeof stats.activeTrips).toBe('number');
  expect(typeof stats.onlineDrivers).toBe('number');
  expect(typeof stats.todayRevenueMXN).toBe('number');
  expect(typeof stats.pendingErrors).toBe('number');
});

test('GET /admin/trips retorna lista paginada', async ({ apiContext }) => {
  const res = await apiContext.get('/admin/trips?page=1&limit=10', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('data');
  expect(body).toHaveProperty('total');
  expect(Array.isArray(body.data)).toBe(true);
});

test('GET /admin/drivers retorna lista de conductores', async ({ apiContext }) => {
  const res = await apiContext.get('/admin/drivers?page=1&limit=10', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toHaveProperty('data');
  expect(Array.isArray(body.data)).toBe(true);
});

test('GET /admin/stats falla sin token de admin (403)', async ({ apiContext }) => {
  const passengerToken = await loginAsPassenger(apiContext);

  const res = await apiContext.get('/admin/stats', {
    headers: { Authorization: `Bearer ${passengerToken}` },
  });
  expect(res.status()).toBe(403);
});
