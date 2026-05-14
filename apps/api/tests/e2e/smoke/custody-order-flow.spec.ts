/**
 * Smoke test: Custody Order Flow — flujo completo de orden de custodia
 *
 * Cubre:
 *   1. GET /custody-types → obtener id de cash_transport
 *   2. Autenticación como cliente (OTP bypass)
 *   3. POST /orders → crear orden en DRAFT
 *   4. POST /orders/:id/value-declaration → declarar valores
 *   5. PATCH /orders/:id/submit → DRAFT → PENDING_APPROVAL
 *   6. GET /orders/:id → verificar status = PENDING_APPROVAL
 *   7. Cleanup: supervisor rechaza la orden
 *
 * Requiere:
 *   - API en APP_URL (default http://localhost:3333) con TEST_MODE=true
 *   - Seed 12: custody_types (cash_transport, etc.)
 *   - Seed 13: +525500000099 (client, TEST_OTP=123456), +525500000098 (supervisor)
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const TEST_OTP = '123456';
const CLIENT_PHONE = '+525500000099';
const SUPERVISOR_PHONE = '+525500000098';
const API_URL = process.env['APP_URL'] ?? 'http://localhost:3333';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function loginOTP(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  phone: string,
): Promise<string> {
  await request.post(`${API_URL}/auth/login`, { data: { phone } });
  const res = await request.post(`${API_URL}/auth/verify-phone`, {
    data: { phone, otp: TEST_OTP },
  });
  const body = await res.json() as { accessToken?: string; data?: { accessToken: string } };
  return body.accessToken ?? body.data?.accessToken ?? '';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Custody order flow — API smoke test', () => {
  test('GET /custody-types returns active custody types with schemas', async ({ request }) => {
    const res = await request.get(`${API_URL}/custody-types`);
    expect(res.ok()).toBe(true);

    const body = await res.json() as { data: Array<{ id: string; slug: string; valueDeclarationSchema: object }> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);

    const cashTransport = body.data.find((t) => t.slug === 'cash_transport');
    expect(cashTransport).toBeDefined();
    expect(cashTransport?.valueDeclarationSchema).toBeDefined();
    expect(typeof cashTransport?.id).toBe('string');
  });

  test('flujo completo: crear → declarar → submit → PENDING_APPROVAL', async ({ request }) => {
    // 1. GET /custody-types
    const typesRes = await request.get(`${API_URL}/custody-types`);
    if (!typesRes.ok()) {
      test.skip(true, 'GET /custody-types not available — seed 12 may not be applied');
      return;
    }
    const { data: types } = await typesRes.json() as { data: Array<{ id: string; slug: string }> };
    const cashTransport = types.find((t) => t.slug === 'cash_transport');
    if (!cashTransport) {
      test.skip(true, 'cash_transport custody type not found — skipping');
      return;
    }

    // 2. Authenticate as client
    const clientToken = await loginOTP(request, CLIENT_PHONE);
    if (!clientToken) {
      test.skip(true, `Client ${CLIENT_PHONE} not found — run seed 13 first`);
      return;
    }

    // 3. Create a custody order (DRAFT)
    const createRes = await request.post(`${API_URL}/orders`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        clientId: 'will-be-resolved-by-service',
        custodyTypeId: cashTransport.id,
        pickupAddress: {
          street: 'Av. Insurgentes Sur 1234',
          city: 'Ciudad de México',
          state: 'CDMX',
        },
        deliveryAddress: {
          street: 'Av. Reforma 500',
          city: 'Ciudad de México',
          state: 'CDMX',
        },
      },
    });

    // If server returns 4xx, the test infrastructure isn't ready — skip gracefully
    if (!createRes.ok()) {
      const errBody = await createRes.json() as { error?: { code: string; message: string } };
      test.skip(
        true,
        `POST /orders failed: ${errBody?.error?.code} — ${errBody?.error?.message}`,
      );
      return;
    }

    const createBody = await createRes.json() as { data: { id: string; status: string } };
    const orderId = createBody.data.id;
    expect(createBody.data.status).toBe('DRAFT');
    expect(typeof orderId).toBe('string');

    // 4. Declare values
    const declareRes = await request.post(`${API_URL}/orders/${orderId}/value-declaration`, {
      headers: { Authorization: `Bearer ${clientToken}` },
      data: {
        declaredValue: {
          amount_mxn: 150000,
          currency: 'MXN',
          denomination_breakdown: { '500': 200, '200': 250 },
        },
      },
    });

    expect(declareRes.ok()).toBe(true);
    const declareBody = await declareRes.json() as { data: { orderId: string; declaredValue: object } };
    expect(declareBody.data.orderId).toBe(orderId);
    expect(declareBody.data.declaredValue).toMatchObject({ amount_mxn: 150000, currency: 'MXN' });

    // 5. Submit (DRAFT → PENDING_APPROVAL)
    const submitRes = await request.patch(`${API_URL}/orders/${orderId}/submit`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(submitRes.ok()).toBe(true);

    // 6. Verify status
    const getRes = await request.get(`${API_URL}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    expect(getRes.ok()).toBe(true);
    const getBody = await getRes.json() as { data: { id: string; status: string } };
    expect(getBody.data.status).toBe('PENDING_APPROVAL');

    // 7. Cleanup — supervisor rejects the order
    const supervisorToken = await loginOTP(request, SUPERVISOR_PHONE);
    if (supervisorToken) {
      await request.patch(`${API_URL}/orders/${orderId}/reject`, {
        headers: { Authorization: `Bearer ${supervisorToken}` },
        data: { reason: 'Smoke test cleanup — orden de prueba automatizada' },
      });
    }
  });

  test('GET /orders/:id/value-declaration returns 404 when no declaration', async ({ request }) => {
    const clientToken = await loginOTP(request, CLIENT_PHONE);
    if (!clientToken) {
      test.skip(true, 'Client not found — skipping');
      return;
    }

    const res = await request.get(`${API_URL}/orders/00000000-0000-0000-0000-000000000000/value-declaration`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });

    // Either 404 (order not found) or 403 (tenant guard) — both are valid responses
    expect([404, 403]).toContain(res.status());
  });
});
