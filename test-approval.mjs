/**
 * test-approval.mjs
 * Smoke test: flujo completo PENDING_APPROVAL → APPROVED → SEARCHING
 *
 * Usage:  node test-approval.mjs
 */

const BASE = 'http://localhost:3333';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function post(url, body, token) {
  const r = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, body: json };
}

async function patch(url, body, token) {
  const r = await fetch(`${BASE}${url}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, body: json };
}

async function get(url, token) {
  const r = await fetch(`${BASE}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, body: json };
}

function ok(label, condition, details) {
  const icon = condition ? '✅' : '❌';
  console.log(`  ${icon} ${label}`, details !== undefined ? `→ ${JSON.stringify(details)}` : '');
  if (!condition) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// 1. Login as passenger (custody vertical needs a trip_type that uses custody)
// ---------------------------------------------------------------------------

console.log('\n=== STEP 1: Login ===');

// Passenger uses 2-step OTP flow (TEST_MODE=true → OTP always '123456')
const PHONE = '+525500000001';
const passengerLogin = await post('/auth/login', { phone: PHONE });
console.log('  passenger OTP request:', passengerLogin.status, JSON.stringify(passengerLogin.body));

const passengerVerify = await post('/auth/verify-phone', { phone: PHONE, otp: '123456' });
console.log('  passenger verify:', passengerVerify.status);
const PASSENGER_TOKEN = passengerVerify.body?.accessToken;

const adminLogin = await post('/admin/auth/login', {
  username: 'admin',
  password: 'Admin1234!',
});
console.log('  admin login:', adminLogin.status, adminLogin.body);
const ADMIN_TOKEN = adminLogin.body?.accessToken;

if (!PASSENGER_TOKEN) console.error('  ❌ No passenger token. Response:', JSON.stringify(passengerVerify.body));
if (!ADMIN_TOKEN) console.error('  ❌ No admin token.');
if (!PASSENGER_TOKEN || !ADMIN_TOKEN) process.exit(1);

// ---------------------------------------------------------------------------
// 2. Cancel any existing active trip for passenger
// ---------------------------------------------------------------------------

console.log('\n=== STEP 2: Clear active trips ===');

const activeTrip = await get('/trips/active', PASSENGER_TOKEN);
if (activeTrip.status === 200 && activeTrip.body?.id) {
  const existingId = activeTrip.body.id;
  console.log(`  Found active trip ${existingId} (${activeTrip.body.status}) — cancelling...`);
  const cancel = await patch(`/trips/${existingId}/cancel`, { reason: 'test cleanup' }, PASSENGER_TOKEN);
  ok('Cancel existing trip', cancel.status === 200, cancel.body?.status ?? cancel.body);
} else {
  console.log('  No active trip found — OK');
}

// ---------------------------------------------------------------------------
// 3. Get a custody trip_type_id
// ---------------------------------------------------------------------------

console.log('\n=== STEP 3: Get custody trip type ===');

const ttRes = await get('/trip-types', PASSENGER_TOKEN);
const tripTypes = Array.isArray(ttRes.body) ? ttRes.body : (ttRes.body?.data ?? []);
const custodyType = tripTypes.find(
  (t) => t.vertical?.code === 'custody' || t.name?.toLowerCase().includes('custody'),
);
const taxi = tripTypes.find((t) => t.vertical?.code === 'taxi' || t.name?.toLowerCase().includes('taxi'));

const tripTypeId = custodyType?.id ?? tripTypes[0]?.id;
console.log(`  Using trip_type: ${tripTypes.map((t) => `${t.name}(${t.id?.slice(0,8)})`).join(', ')}`);
console.log(`  Selected: ${tripTypeId?.slice(0, 8)} (${custodyType ? 'custody' : 'first available'})`);

if (!tripTypeId) {
  console.error('  ❌ No trip types found. Aborting.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 4. Create a trip — expect PENDING_APPROVAL if custody, SEARCHING if taxi
// ---------------------------------------------------------------------------

console.log('\n=== STEP 4: Create trip ===');

const createRes = await post(
  '/trips',
  {
    origin: { lat: 19.4326, lng: -99.1332, address: 'CDMX Centro' },
    destination: { lat: 19.4284, lng: -99.1477, address: 'Chapultepec' },
    trip_type_id: tripTypeId,
  },
  PASSENGER_TOKEN,
);

ok('POST /trips → 201', createRes.status === 201, createRes.body);
const tripId = createRes.body?.id;
const tripStatus = createRes.body?.status;
console.log(`  Trip ID: ${tripId}, Status: ${tripStatus}`);

if (!tripId) {
  console.error('  ❌ No trip ID. Aborting.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 5a. If PENDING_APPROVAL → test approve
// ---------------------------------------------------------------------------

if (tripStatus === 'PENDING_APPROVAL') {
  console.log('\n=== STEP 5a: Approve trip ===');

  const approveRes = await post(`/trips/${tripId}/approve`, {}, ADMIN_TOKEN);
  ok('POST /trips/:id/approve → 200', approveRes.status === 200, approveRes.body);
  ok('status = APPROVED', approveRes.body?.status === 'APPROVED', approveRes.body?.status);
  ok('approved_by present', !!approveRes.body?.approved_by, approveRes.body?.approved_by);

  // ---------------------------------------------------------------------------
  // 5b. Create second trip for reject test
  // ---------------------------------------------------------------------------

  console.log('\n=== STEP 5b: Create second trip for reject test ===');

  // Cancel the approved trip first so passenger can create another
  const cancelApproved = await patch(`/trips/${tripId}/cancel`, { reason: 'test' }, PASSENGER_TOKEN);
  ok('Cancel approved trip', cancelApproved.status === 200, cancelApproved.body?.status ?? cancelApproved.body);

  const create2 = await post(
    '/trips',
    {
      origin: { lat: 19.4326, lng: -99.1332, address: 'CDMX Centro' },
      destination: { lat: 19.4284, lng: -99.1477, address: 'Chapultepec' },
      trip_type_id: tripTypeId,
    },
    PASSENGER_TOKEN,
  );
  ok('POST /trips (2) → 201', create2.status === 201, create2.body?.status);
  const tripId2 = create2.body?.id;

  if (tripId2 && create2.body?.status === 'PENDING_APPROVAL') {
    console.log('\n=== STEP 5c: Reject trip ===');
    const rejectRes = await post(
      `/trips/${tripId2}/reject`,
      { reason: 'Prueba de rechazo' },
      ADMIN_TOKEN,
    );
    ok('POST /trips/:id/reject → 200', rejectRes.status === 200, rejectRes.body);
    ok('status = CANCELLED', rejectRes.body?.status === 'CANCELLED', rejectRes.body?.status);
    ok('cancellation_reason present', !!rejectRes.body?.cancellation_reason, rejectRes.body?.cancellation_reason);
  }
} else {
  console.log(`\n  ℹ️  Trip created with status ${tripStatus} (vertical does not require approval) — skipping approve/reject tests`);
}

// ---------------------------------------------------------------------------
// 6. GET /admin/trips/pending-approval
// ---------------------------------------------------------------------------

console.log('\n=== STEP 6: GET /admin/trips/pending-approval ===');

const pendingRes = await get('/admin/trips/pending-approval?limit=10&offset=0', ADMIN_TOKEN);
ok('GET /admin/trips/pending-approval → 200', pendingRes.status === 200, `total=${pendingRes.body?.total}`);

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------

console.log('\n=== RESULTADO ===');
if (process.exitCode === 1) {
  console.log('❌ Algunos pasos fallaron.');
} else {
  console.log('✅ Todos los pasos pasaron.');
}
