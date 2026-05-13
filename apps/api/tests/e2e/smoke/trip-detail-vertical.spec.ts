/**
 * Smoke test: Trip detail — tabs Temperatura y Custodia en el backoffice
 * Requiere:
 *   - API en APP_URL (default http://localhost:3333) con TEST_MODE=true
 *   - Backoffice web en ADMIN_WEB_URL (default http://localhost:5173)
 *   - Seed 07: passenger +525500000001, driver +525500000002 (approved)
 *   - Seed 08: admin / Admin1234!
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const TEST_OTP = '123456';
const PASSENGER_PHONE = '+525500000001';
const DRIVER_PHONE = '+525500000002';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin1234!';
const API_URL = process.env['APP_URL'] ?? 'http://localhost:3333';
const WEB_URL = process.env['ADMIN_WEB_URL'] ?? 'http://localhost:5173';

// Auth helpers
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
  page: Parameters<Parameters<typeof test>[1]>[0]['page'],
) {
  await page.goto(WEB_URL);
  await page.fill('input[placeholder="admin"]', ADMIN_USERNAME);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
}

// Build a complete trip with custody events
async function createTripWithCustody(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
): Promise<string> {
  const passengerToken = await loginOTP(request, PASSENGER_PHONE);
  const driverToken = await loginOTP(request, DRIVER_PHONE);

  // Fetch a valid trip_type_id (passengerToken = +525500000001 que tiene rol admin en seed 07)
  const typesRes = await request.get(`${API_URL}/admin/trip-types`, {
    headers: { Authorization: `Bearer ${passengerToken}` },
  });
  const types = await typesRes.json() as Array<{ id: string }>;
  const tripTypeId = types[0]!.id;

  // Driver goes online
  await request.post(`${API_URL}/drivers/me/go-online`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });

  // Passenger creates trip
  const tripRes = await request.post(`${API_URL}/trips`, {
    headers: { Authorization: `Bearer ${passengerToken}` },
    data: {
      origin: { lat: 19.4326, lng: -99.1332, address: 'Ángel de la Independencia' },
      destination: { lat: 19.4361, lng: -99.0719, address: 'Aeropuerto CDMX' },
      trip_type_id: tripTypeId,
    },
  });
  const trip = await tripRes.json() as { id: string };
  const tripId = trip.id;

  // Driver accepts
  await request.patch(`${API_URL}/trips/${tripId}/accept`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });

  // Driver updates to DRIVER_EN_ROUTE → DRIVER_ARRIVED → IN_PROGRESS
  for (const status of ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS'] as const) {
    await request.patch(`${API_URL}/trips/${tripId}/status`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: { status },
    });
  }

  // Create custody pick_up event
  const custodyRes = await request.post(`${API_URL}/trips/${tripId}/custody/events`, {
    headers: { Authorization: `Bearer ${driverToken}` },
    data: {
      event_type: 'pick_up',
      notes: 'Paquete recibido en origen',
      lat: 19.4326,
      lng: -99.1332,
    },
  });
  if (!custodyRes.ok()) {
    throw new Error(`custody event creation failed: ${custodyRes.status()} ${await custodyRes.text()}`);
  }

  // Complete the trip
  await request.patch(`${API_URL}/trips/${tripId}/status`, {
    headers: { Authorization: `Bearer ${driverToken}` },
    data: { status: 'COMPLETED' },
  });

  // Driver goes offline (cleanup)
  await request.post(`${API_URL}/drivers/me/go-offline`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });

  return tripId;
}

// Build a complete trip with temperature readings
async function createTripWithTemperature(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
): Promise<string> {
  const passengerToken = await loginOTP(request, PASSENGER_PHONE);
  const driverToken = await loginOTP(request, DRIVER_PHONE);

  const typesRes = await request.get(`${API_URL}/admin/trip-types`, {
    headers: { Authorization: `Bearer ${passengerToken}` },
  });
  const types = await typesRes.json() as Array<{ id: string }>;
  const tripTypeId = types[0]!.id;

  await request.post(`${API_URL}/drivers/me/go-online`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });

  const tripRes = await request.post(`${API_URL}/trips`, {
    headers: { Authorization: `Bearer ${passengerToken}` },
    data: {
      origin: { lat: 19.4326, lng: -99.1332, address: 'Origen Temperatura' },
      destination: { lat: 19.4361, lng: -99.0719, address: 'Destino Temperatura' },
      trip_type_id: tripTypeId,
    },
  });
  const trip = await tripRes.json() as { id: string };
  const tripId = trip.id;

  await request.patch(`${API_URL}/trips/${tripId}/accept`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });

  for (const status of ['DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS'] as const) {
    await request.patch(`${API_URL}/trips/${tripId}/status`, {
      headers: { Authorization: `Bearer ${driverToken}` },
      data: { status },
    });
  }

  // Post temperature reading
  const tempRes = await request.post(`${API_URL}/trips/${tripId}/temperature`, {
    headers: { Authorization: `Bearer ${driverToken}` },
    data: { celsius: 4.2, sensor_id: 'sensor-smoke-test', lat: 19.4326, lng: -99.1332 },
  });
  if (!tempRes.ok()) {
    throw new Error(`temperature reading failed: ${tempRes.status()} ${await tempRes.text()}`);
  }

  await request.patch(`${API_URL}/trips/${tripId}/status`, {
    headers: { Authorization: `Bearer ${driverToken}` },
    data: { status: 'COMPLETED' },
  });

  await request.post(`${API_URL}/drivers/me/go-offline`, {
    headers: { Authorization: `Bearer ${driverToken}` },
  });

  return tripId;
}

test.describe('Trip detail — tabs verticales', () => {
  test('viaje con evento de custodia muestra tab Custodia en el admin', async ({ page, request }) => {
    const tripId = await createTripWithCustody(request);

    await loginAdmin(page);
    // Navegar por sidebar (SPA — no page.goto para preservar token en memoria)
    await page.getByRole('link', { name: /Viajes/ }).click();
    await page.waitForSelector('text=Viajes', { timeout: 8000 });

    // Abrir el modal del viaje recién creado (ID truncado)
    const shortId = tripId.slice(0, 8);
    const tripRow = page.locator('tr').filter({ hasText: shortId });
    await tripRow.click();

    // Esperar que el modal abra
    await expect(page.locator('text=Viaje').first()).toBeVisible({ timeout: 5000 });

    // Tab "Custodia" debe ser visible
    const custodyTab = page.getByRole('button', { name: 'Custodia' });
    await expect(custodyTab).toBeVisible({ timeout: 5000 });

    // Click en el tab y verificar que hay al menos 1 evento en el timeline
    await custodyTab.click();
    await expect(page.locator('text=Recogida')).toBeVisible({ timeout: 3000 });
  });

  test('viaje con lecturas de temperatura muestra tab Temperatura en el admin', async ({ page, request }) => {
    const tripId = await createTripWithTemperature(request);

    await loginAdmin(page);
    // Navegar por sidebar (SPA — no page.goto para preservar token en memoria)
    await page.getByRole('link', { name: /Viajes/ }).click();
    await page.waitForSelector('text=Viajes', { timeout: 8000 });

    const shortId = tripId.slice(0, 8);
    const tripRow = page.locator('tr').filter({ hasText: shortId });
    await tripRow.click();

    await expect(page.locator('text=Viaje').first()).toBeVisible({ timeout: 5000 });

    // Tab "Temperatura" debe ser visible
    const tempTab = page.getByRole('button', { name: 'Temperatura' });
    await expect(tempTab).toBeVisible({ timeout: 5000 });

    // Click en el tab y verificar que el chart y las summary cards aparecen
    await tempTab.click();

    // Summary cards: buscar al menos la card de "Mínima"
    await expect(page.locator('text=Mínima')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Máxima')).toBeVisible();
    await expect(page.locator('text=Promedio')).toBeVisible();
    await expect(page.locator('text=Fuera de rango')).toBeVisible();
  });
});
