/**
 * Smoke test: Auth API flow
 * - register → verify-phone → login → refresh
 * Requiere: TEST_MODE=true (OTP fijo = 123456)
 */
import { test, expect } from '../fixtures/base';

const ADMIN_PHONE = '+525500000001';
// Teléfono único por ejecución para evitar conflictos en la BD
const TEST_PHONE = `+521555${Date.now().toString().slice(-7)}`;
const TEST_OTP = '123456'; // Fijo cuando TEST_MODE=true

test.describe('Auth smoke tests', () => {
  test('health check — API responde', async ({ apiContext }) => {
    const res = await apiContext.get('/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'ok');
  });

  test('registro de nuevo usuario pasajero', async ({ apiContext }) => {
    const res = await apiContext.post('/auth/register', {
      data: {
        phone: TEST_PHONE,
        fullName: 'Test Pasajero E2E',
      },
    });
    expect(res.status()).toBe(201);
  });

  test('flujo completo: register → verify → refresh', async ({ apiContext }) => {
    const phone = `+521555${Date.now().toString().slice(-7)}`;

    // 1. Register
    const registerRes = await apiContext.post('/auth/register', {
      data: { phone, fullName: 'E2E Pasajero' },
    });
    expect(registerRes.status()).toBe(201);

    // 2. Login (requests OTP)
    const loginRes = await apiContext.post('/auth/login', {
      data: { phone },
    });
    expect(loginRes.status()).toBe(200);

    // 3. Verify phone (OTP = 123456 en TEST_MODE)
    const verifyRes = await apiContext.post('/auth/verify-phone', {
      data: { phone, otp: TEST_OTP },
    });
    expect(verifyRes.status()).toBe(200);
    const { accessToken, refreshToken } = await verifyRes.json();
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();

    // 4. GET /users/me con token válido
    const meRes = await apiContext.get('/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(meRes.status()).toBe(200);
    const me = await meRes.json();
    expect(me.phone).toBe(phone);

    // 5. Refresh token
    const refreshRes = await apiContext.post('/auth/refresh', {
      data: { refreshToken },
    });
    expect(refreshRes.status()).toBe(200);
    const refreshed = await refreshRes.json();
    expect(refreshed.accessToken).toBeTruthy();
    expect(refreshed.refreshToken).toBeTruthy();
    // El refresh token debe ser distinto (contiene JTI único)
    expect(refreshed.refreshToken).not.toBe(refreshToken);
  });

  test('login con OTP incorrecto retorna 401', async ({ apiContext }) => {
    // Login para generar OTP
    await apiContext.post('/auth/login', { data: { phone: ADMIN_PHONE } });

    const res = await apiContext.post('/auth/verify-phone', {
      data: { phone: ADMIN_PHONE, otp: '000000' },
    });
    // OTP_INVALID maps to 400 in business-error.ts
    expect(res.status()).toBe(400);
  });

  test('admin puede autenticarse con su teléfono', async ({ apiContext }) => {
    // Login admin (seed 04_admin_user)
    const loginRes = await apiContext.post('/auth/login', {
      data: { phone: ADMIN_PHONE },
    });
    expect(loginRes.status()).toBe(200);

    // Verify con OTP fijo TEST_MODE
    const verifyRes = await apiContext.post('/auth/verify-phone', {
      data: { phone: ADMIN_PHONE, otp: TEST_OTP },
    });
    expect(verifyRes.status()).toBe(200);
    const { accessToken } = await verifyRes.json();
    expect(accessToken).toBeTruthy();

    // Admin puede acceder a /admin/stats
    const statsRes = await apiContext.get('/admin/stats', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(statsRes.status()).toBe(200);
    const stats = await statsRes.json();
    expect(stats).toHaveProperty('activeTrips');
    expect(stats).toHaveProperty('onlineDrivers');
    expect(stats).toHaveProperty('todayRevenueMXN');
    expect(stats).toHaveProperty('pendingErrors');
  });
});
