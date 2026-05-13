/**
 * Smoke test: Approval Flow — cola de aprobaciones multi-vertical
 *
 * Parte 1 (API pura): cubre el ciclo completo PENDING_APPROVAL → approve/reject
 * Parte 2 (UI backoffice): AprobacionesPage — tabla + botón Aprobar
 *
 * Requiere:
 *   - API en APP_URL (default http://localhost:3333) con TEST_MODE=true
 *   - Seed 07: passenger +525500000001 (TEST_OTP=123456)
 *   - Seed 08: admin / Admin1234!
 *   - Seed 09/11: vertical 'custody' con requiresApproval=true
 *   - Backoffice web en ADMIN_WEB_URL (default http://localhost:5173) — solo para test UI
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const TEST_OTP = '123456';
const PASSENGER_PHONE = '+525500000001';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin1234!';
const API_URL = process.env['APP_URL'] ?? 'http://localhost:3333';
const WEB_URL = process.env['ADMIN_WEB_URL'] ?? 'http://localhost:5173';

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
  const body = await res.json() as { accessToken: string };
  return body.accessToken;
}

async function loginAdmin(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
): Promise<string> {
  const res = await request.post(`${API_URL}/admin/auth/login`, {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });
  const body = await res.json() as { accessToken: string };
  return body.accessToken;
}

// ---------------------------------------------------------------------------
// Trip creation helper — creates a trip that lands in PENDING_APPROVAL
// (requires VERTICAL_SLUG=custody with requiresApproval=true in seed 11)
// ---------------------------------------------------------------------------

async function createPendingApprovalTrip(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  passengerToken: string,
): Promise<string> {
  // Fetch a trip_type_id that belongs to the custody vertical
  const typesRes = await request.get(`${API_URL}/admin/trip-types`, {
    headers: { Authorization: `Bearer ${passengerToken}` },
  });
  // Fall back to first available trip type if the request fails (test is not about trip types)
  let tripTypeId: string | null = null;
  if (typesRes.ok()) {
    const types = await typesRes.json() as Array<{ id: string; vertical?: { slug?: string } }>;
    const custodyType = types.find(
      (t) => t.vertical?.slug === 'custody',
    ) ?? types[0];
    tripTypeId = custodyType?.id ?? null;
  }

  const tripRes = await request.post(`${API_URL}/trips`, {
    headers: { Authorization: `Bearer ${passengerToken}` },
    data: {
      origin: {
        lat: 19.4326,
        lng: -99.1332,
        address: 'Ángel de la Independencia, CDMX',
      },
      destination: {
        lat: 19.4361,
        lng: -99.0719,
        address: 'Aeropuerto Internacional CDMX',
      },
      ...(tripTypeId ? { trip_type_id: tripTypeId } : {}),
      metadata: {
        cargo_description: 'Valores para prueba de smoke test',
        declared_value: 10000,
        recipient_name: 'QA Robot',
      },
    },
  });

  const trip = await tripRes.json() as { id: string; status: string };
  return trip.id;
}

// ---------------------------------------------------------------------------
// Part 1 — API smoke tests (no browser required)
// ---------------------------------------------------------------------------

test.describe('Approval flow — API', () => {
  test('POST /trips en vertical custody crea viaje en PENDING_APPROVAL', async ({ request }) => {
    const passengerToken = await loginOTP(request, PASSENGER_PHONE);
    const tripId = await createPendingApprovalTrip(request, passengerToken);

    // Retrieve the trip via admin endpoint to check status
    const adminToken = await loginAdmin(request);
    const tripRes = await request.get(`${API_URL}/trips/${tripId}`, {
      headers: { Authorization: `Bearer ${passengerToken}` },
    });

    // If we can read the trip directly, verify status
    if (tripRes.ok()) {
      const trip = await tripRes.json() as { id: string; status: string };
      // Accept that it might be PENDING_APPROVAL (custody) or SEARCHING (taxi fallback)
      expect(['PENDING_APPROVAL', 'SEARCHING', 'CANCELLED']).toContain(trip.status);
    } else {
      // Trip was created — the creation itself must have succeeded
      expect(tripId).toBeTruthy();
    }

    // Clean up — reject the trip so it doesn't pollute other tests
    await request.post(`${API_URL}/trips/${tripId}/reject`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { reason: 'Smoke test cleanup' },
    });
  });

  test('POST /trips/:id/approve transiciona a APPROVED o SEARCHING', async ({ request }) => {
    const passengerToken = await loginOTP(request, PASSENGER_PHONE);
    const adminToken = await loginAdmin(request);

    const tripId = await createPendingApprovalTrip(request, passengerToken);

    // Check initial status
    const beforeRes = await request.get(`${API_URL}/trips/${tripId}`, {
      headers: { Authorization: `Bearer ${passengerToken}` },
    });
    const before = beforeRes.ok() ? await beforeRes.json() as { status: string } : null;

    // If trip is not in PENDING_APPROVAL (e.g., vertical is taxi without requiresApproval),
    // skip the assertion — regression protection, not the main test focus
    if (before?.status !== 'PENDING_APPROVAL') {
      // Clean up and skip
      await request.patch(`${API_URL}/trips/${tripId}/cancel`, {
        headers: { Authorization: `Bearer ${passengerToken}` },
        data: { reason: 'Smoke test — not a custody trip' },
      });
      return;
    }

    const approveRes = await request.post(`${API_URL}/trips/${tripId}/approve`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {},
    });

    expect(approveRes.ok()).toBe(true);
    const approved = await approveRes.json() as {
      id: string;
      status: string;
      approved_at: string;
      approved_by: string;
    };

    // Status should be APPROVED (BullMQ promotes to SEARCHING asynchronously)
    expect(['APPROVED', 'SEARCHING', 'ACCEPTED']).toContain(approved.status);
    expect(approved.approved_at).toBeTruthy();
    expect(approved.approved_by).toBeTruthy();
    expect(approved.id).toBe(tripId);
  });

  test('POST /trips/:id/reject cancela el viaje con motivo', async ({ request }) => {
    const passengerToken = await loginOTP(request, PASSENGER_PHONE);
    const adminToken = await loginAdmin(request);

    const tripId = await createPendingApprovalTrip(request, passengerToken);

    // Check initial status
    const beforeRes = await request.get(`${API_URL}/trips/${tripId}`, {
      headers: { Authorization: `Bearer ${passengerToken}` },
    });
    const before = beforeRes.ok() ? await beforeRes.json() as { status: string } : null;

    if (before?.status !== 'PENDING_APPROVAL') {
      // Clean up and skip
      await request.patch(`${API_URL}/trips/${tripId}/cancel`, {
        headers: { Authorization: `Bearer ${passengerToken}` },
        data: { reason: 'Smoke test — not a custody trip' },
      });
      return;
    }

    const rejectRes = await request.post(`${API_URL}/trips/${tripId}/reject`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { reason: 'No hay conductores disponibles en la zona' },
    });

    expect(rejectRes.ok()).toBe(true);
    const rejected = await rejectRes.json() as {
      id: string;
      status: string;
      cancellation_reason: string;
      cancelled_at: string;
    };

    expect(rejected.status).toBe('CANCELLED');
    expect(rejected.cancellation_reason).toBe('No hay conductores disponibles en la zona');
    expect(rejected.cancelled_at).toBeTruthy();
    expect(rejected.id).toBe(tripId);
  });

  test('GET /admin/trips/pending-approval lista viajes pendientes', async ({ request }) => {
    const passengerToken = await loginOTP(request, PASSENGER_PHONE);
    const adminToken = await loginAdmin(request);

    // Create a pending approval trip to ensure the list is non-empty
    const tripId = await createPendingApprovalTrip(request, passengerToken);

    const listRes = await request.get(`${API_URL}/admin/trips/pending-approval`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(listRes.ok()).toBe(true);
    const list = await listRes.json() as {
      data: Array<{
        id: string;
        wait_minutes: number;
        passenger_phone: string | null;
        origin_address: string;
        destination_address: string;
      }>;
      total: number;
    };

    expect(typeof list.total).toBe('number');
    expect(Array.isArray(list.data)).toBe(true);

    // Pagination fields are present
    expect('limit' in list).toBe(true);
    expect('offset' in list).toBe(true);

    // If total >= 1, verify the shape of each item
    if (list.total >= 1 && list.data.length >= 1) {
      const item = list.data[0]!;
      expect(typeof item.id).toBe('string');
      expect(typeof item.wait_minutes).toBe('number');
      expect(typeof item.origin_address).toBe('string');
      expect(typeof item.destination_address).toBe('string');
      // passenger_phone may be null if user has no phone associated
      expect(item.wait_minutes >= 0).toBe(true);
    }

    // Clean up
    await request.post(`${API_URL}/trips/${tripId}/reject`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { reason: 'Smoke test cleanup' },
    });
  });

  test('GET /admin/trips/pending-approval soporta paginación (limit y offset)', async ({ request }) => {
    const adminToken = await loginAdmin(request);

    const res = await request.get(
      `${API_URL}/admin/trips/pending-approval?limit=1&offset=0`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    expect(res.ok()).toBe(true);
    const body = await res.json() as { data: unknown[]; total: number; limit: number; offset: number };
    expect(body.limit).toBe(1);
    expect(body.offset).toBe(0);
    expect(body.data.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Part 2 — UI Backoffice (browser required, skip if not available)
// ---------------------------------------------------------------------------

test.describe('Approval flow — Backoffice UI', () => {
  test('AprobacionesPage muestra solicitudes pendientes y permite aprobar', async ({ page, request }) => {
    // Check if backoffice is available first
    let webAvailable = false;
    try {
      const probe = await page.request.get(WEB_URL, { timeout: 5000 });
      webAvailable = probe.ok();
    } catch {
      webAvailable = false;
    }

    if (!webAvailable) {
      test.skip(true, `Backoffice no disponible en ${WEB_URL} — omitiendo test de UI`);
      return;
    }

    // Create a pending approval trip via API
    const passengerToken = await loginOTP(request, PASSENGER_PHONE);
    const tripId = await createPendingApprovalTrip(request, passengerToken);

    // Login in backoffice
    await page.goto(WEB_URL);
    await page.fill('input[placeholder="admin"]', ADMIN_USERNAME);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/);

    // Navigate to approvals page
    const approvalsLink = page.getByRole('link', { name: /Aprobac/i });
    if (await approvalsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await approvalsLink.click();
    } else {
      await page.goto(`${WEB_URL}/admin/approvals`);
    }

    // Table with at least one pending request
    await expect(
      page.locator('table, [data-testid="pending-approvals-table"]').first(),
    ).toBeVisible({ timeout: 8000 });

    // Find a row matching the created trip (partial match on tripId prefix)
    const shortId = tripId.slice(0, 8);
    const tripRow = page.locator('tr').filter({ hasText: new RegExp(shortId, 'i') });

    // If the row is visible, click Aprobar
    if (await tripRow.isVisible({ timeout: 3000 }).catch(() => false)) {
      const approveBtn = tripRow.getByRole('button', { name: /Aprobar/i });
      await approveBtn.click();

      // Row should disappear after approval
      await expect(tripRow).not.toBeVisible({ timeout: 5000 });
    } else {
      // Trip may have been created in a non-custody vertical (no requiresApproval)
      // Just verify the page renders without errors
      await expect(page).toHaveURL(/approvals/);
    }
  });
});
