---
name: testing-node-apis
description: Write comprehensive test suites for Node.js APIs using Jest 29, Supertest 6, and Testcontainers. Use when writing unit tests, integration tests, analyzing coverage gaps, or reviewing test quality for any backend module. Specializes in achieving 100% branch coverage on state machines and pricing engines, testing concurrency scenarios, and generating structured gap reports for the QA agent workflow.
---

This skill guides the creation and evaluation of tests for a ride-hailing platform backend. Tests here are not bureaucratic checkboxes — they are the verification that financial transactions, state transitions, and concurrency are correct. A missed branch in `TripStateMachine` is a production incident.

The agent receives a task: a module to test, a coverage gap report, or a directive to achieve a specific threshold. Context includes the module code, existing tests, and coverage output.

## Testing Philosophy

**Unit tests** verify isolated logic: a service method with mocked repositories, a pure function, a state machine transition. Fast. No I/O.

**Integration tests** verify the full stack from HTTP request to database. They use a **real PostgreSQL instance** via Testcontainers — no mocks, no in-memory databases. A test that passes with a mock DB but fails against real PostgreSQL is worse than no test at all.

```typescript
// WRONG — mocking the database in integration tests
jest.mock('../repository/trips.repository');

// CORRECT — Testcontainers spins a real PostgreSQL
beforeAll(async () => {
  container = await new PostgreSqlContainer('timescale/timescaledb:latest-pg15').start();
  db = knex({ client: 'pg', connection: container.getConnectionUri() });
  await db.migrate.latest();
  await db.seed.run();
});
```

## TripStateMachine — 100% Coverage is Non-Negotiable

Every valid transition gets a test. Every invalid transition gets a test. No exceptions.

```typescript
describe('TripStateMachine', () => {
  // Valid transitions — one test per arrow in the state diagram
  it('REQUESTED → SEARCHING when driver search starts', ...)
  it('SEARCHING → ACCEPTED when driver accepts', ...)
  it('ACCEPTED → DRIVER_EN_ROUTE when driver confirms pickup start', ...)
  it('DRIVER_EN_ROUTE → DRIVER_ARRIVED when driver marks arrival', ...)
  it('DRIVER_ARRIVED → IN_PROGRESS when passenger boards', ...)
  it('IN_PROGRESS → COMPLETED when trip ends', ...)

  // Cancellation paths — all of them
  it('SEARCHING → CANCELLED_NO_DRIVER when timeout expires', ...)
  it('ACCEPTED → CANCELLED_BY_PASSENGER when passenger cancels', ...)
  it('ACCEPTED → CANCELLED_BY_DRIVER when driver cancels', ...)
  it('DRIVER_EN_ROUTE → NO_SHOW when passenger is not found', ...)

  // Invalid transitions — every combination that should throw
  it('throws INVALID_TRIP_TRANSITION: COMPLETED → SEARCHING', ...)
  it('throws INVALID_TRIP_TRANSITION: IN_PROGRESS → ACCEPTED', ...)
  it('throws INVALID_TRIP_TRANSITION: CANCELLED → any state', ...)
  // ... all invalid combinations

  // Concurrency — the hardest case
  it('prevents two drivers from accepting the same trip simultaneously', async () => {
    // Arrange: trip in SEARCHING state
    // Act: two drivers call acceptTrip() at exactly the same time
    const [result1, result2] = await Promise.allSettled([
      tripService.accept(tripId, driverId1),
      tripService.accept(tripId, driverId2),
    ]);
    // Assert: exactly one succeeds, one throws INVALID_TRIP_TRANSITION
    const successes = [result1, result2].filter(r => r.status === 'fulfilled');
    const failures  = [result1, result2].filter(r => r.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason.code)
      .toBe('INVALID_TRIP_TRANSITION');
  });
});
```

## PricingEngine — 100% Branch Coverage

Every factor type, every edge case, every ordering constraint.

```typescript
describe('PricingEngine', () => {
  it('applies fixed_amount factors first', ...)
  it('applies percentage factors on updated subtotal (after fixed)', ...)
  it('applies multiplier factors last', ...)
  it('stacks multiple fixed_amount factors', ...)
  it('stacks multiple percentage factors', ...)
  it('applies only highest-priority multiplier when stackable=false', ...)
  it('enforces min_fare floor — price never below minimum', ...)
  it('calculates IVA on subtotal, not on base fare', ...)
  it('returns base fare when no active factors exist', ...)
  it('handles zero active factors without NaN or division by zero', ...)
  it('handles all factors with priority=0', ...)
  it('factors with future start_at are not applied', ...)
  it('factors with past end_at are not applied', ...)
});
```

## Factory Pattern — No Hardcoded Test Data

```typescript
// WRONG — fragile, breaks when schema changes
const trip = { id: '123', status: 'SEARCHING', passenger_id: 'abc' };

// CORRECT — factory with sensible defaults, overridable
function makeTripFactory(overrides: Partial<Trip> = {}): Trip {
  return {
    id: faker.string.uuid(),
    status: 'SEARCHING',
    passenger_id: faker.string.uuid(),
    driver_id: null,
    origin_lat: 19.4326,
    origin_lng: -99.1332,
    created_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
}

// Usage
const trip = makeTripFactory({ status: 'ACCEPTED', driver_id: driverId });
```

## Time — Never Use Real Timers

```typescript
// WRONG — flaky, depends on system clock
await new Promise(resolve => setTimeout(resolve, 1000));
expect(token.expiresAt).toBeLessThan(Date.now() + 900000);

// CORRECT — deterministic, instant
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-01-01')); });
afterEach(() => { jest.useRealTimers(); });

it('OTP expires after 10 minutes', () => {
  const otp = generateOtp(phone);
  jest.advanceTimersByTime(10 * 60 * 1000 + 1);
  expect(isOtpValid(otp)).toBe(false);
});
```

## External Services — Mock at the Boundary

In unit tests, mock Stripe, FCM, and Twilio at the service boundary, not at the implementation level.

```typescript
// CORRECT — mock the SDK method, not internal functions
jest.spyOn(stripe.paymentIntents, 'create').mockResolvedValue({ id: 'pi_test', status: 'succeeded' });
jest.spyOn(stripe.paymentIntents, 'create').mockRejectedValue(new StripeCardError('card_declined'));
```

In integration tests, these mocks stay — never call real Stripe/FCM/Twilio in automated tests.

## Coverage Gap Analysis Format

When coverage is insufficient, produce this format for the backend agent:

```markdown
## Gaps — {module} | Iteration {N}/3

### Coverage actual
- Lines: 82% (umbral: 100% para TripStateMachine)
- Branches: 74%

### Gaps por prioridad

#### [CRÍTICO] src/modules/trips/service.ts líneas 145-162
**Branch no cubierto:** `if (trip.status === 'MATCHING' && cancellationReason === 'timeout')`
**Por qué importa:** regla R-TRIP-007 — timeout de SEARCHING genera CANCELLED_NO_DRIVER
**Test sugerido:**
```typescript
it('cancels trip with CANCELLED_NO_DRIVER when SEARCHING times out', async () => {
  const trip = await createTrip({ status: 'SEARCHING' });
  jest.advanceTimersByTime(SEARCHING_TIMEOUT_MS + 1);
  const result = await tripService.handleSearchTimeout(trip.id);
  expect(result.status).toBe('CANCELLED_NO_DRIVER');
});
```

#### [MEDIO] src/modules/trips/service.ts línea 89
**Branch no cubierto:** `driver` es `null` en `TripService.accept()`
...
```

## Coverage Thresholds — Memorize These

| Módulo | Lines | Branches |
|---|---|---|
| TripStateMachine | **100%** | **100%** |
| PricingEngine | **100%** | **100%** |
| PaymentService | **95%** | **90%** |
| Global | **75%** | **70%** |

If TripStateMachine or PricingEngine is at 99%, the module is NOT approved. There is no partial credit on these two.

## What NEVER to Accept

- **Mocks for the database in integration tests** — use Testcontainers
- **Hardcoded UUIDs or data** — use factories with faker
- **Tests that depend on execution order** — each test must be fully isolated
- **`setTimeout` in tests** — use `jest.useFakeTimers()`
- **Skipped tests (`it.skip`)** without a comment explaining why and a linked issue
- **Tests that pass by commenting out the `expect`**
- **Tests with no assertion** — Jest passes them silently; add `expect.assertions(N)`
- **Snapshot tests for business logic** — they hide regressions

## Running Coverage

```bash
rtk npm run test:coverage
```

Parse the output looking for:
1. The per-file table — identify files below threshold
2. The uncovered lines/branches per file — map to specific functions
3. The summary totals — confirm global threshold

Report iteration number and remaining iterations in every feedback to backend.
