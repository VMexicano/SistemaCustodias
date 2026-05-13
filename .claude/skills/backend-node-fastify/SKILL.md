---
name: backend-node-fastify
description: Implement production-grade Node.js backend code for a mobility platform using Fastify 4, Knex 3, BullMQ 5, TypeScript 5 strict, Zod 3, and Socket.io 4. Use when implementing API routes, business logic services, database repositories, background workers, or WebSocket handlers. Enforces layered architecture, transactional integrity, audit logging, and side-effect isolation patterns specific to the UBER_BASE platform.
---

This skill guides implementation of backend modules following the strict architecture of a ride-hailing platform. Every piece of code must be correct, safe, and maintainable — this is production code that handles financial transactions and real-time location data.

The agent receives a task: a module, endpoint, or feature to implement. Context will include the relevant ADR with API contracts, business rules, and the module snapshot.

## Architectural Thinking

Before writing a single line, internalize the layer contract:

- **routes.ts** — Maps HTTP verbs + paths to handlers. Declares Zod schema for request/response. Registers auth middleware. Zero business logic. Zero database calls. Zero conditionals.
- **controller.ts** — Receives the validated request, calls exactly one service method, returns the response. No `if`. No `try/catch` beyond what Fastify handles. No data transformation beyond what's needed to call the service.
- **service.ts** — ALL business logic lives here. Orchestrates repositories. Opens transactions. Enqueues side effects. Writes audit logs. Throws `BusinessError` for domain violations, `TechnicalError` for infrastructure failures.
- **repository.ts** — Knex only. No business logic, no conditionals based on business rules, no error translation. Just SQL-over-Knex returning typed rows.

**CRITICAL**: If you find yourself writing a database query in a controller, stop. If you find yourself writing business logic in a repository, stop. The layer contract is non-negotiable.

## Transaction Patterns

This is the most important pattern in the entire codebase. Get this right on every state-changing operation:

```typescript
async acceptTrip(tripId: string, driverId: string): Promise<Trip> {
  return await db.transaction(async (trx) => {
    // 1. Lock the row — ALWAYS SELECT FOR UPDATE on trip state transitions
    const trip = await trx('trips')
      .where({ id: tripId, deleted_at: null })
      .forUpdate()
      .first();

    if (!trip) throw BusinessErrors.TRIP_NOT_FOUND(tripId);

    // 2. Validate the transition BEFORE writing
    TripStateMachine.assertValidTransition(trip.status, 'ACCEPTED');

    // 3. Write the new state
    const [updated] = await trx('trips')
      .where({ id: tripId })
      .update({ status: 'ACCEPTED', driver_id: driverId, updated_at: new Date() })
      .returning('*');

    // 4. Side effects INSIDE the transaction block but via queue — NOT direct execution
    await notificationQueue.add('trip.accepted', { tripId, driverId });

    // 5. Audit log INSIDE the transaction
    await trx('audit_logs').insert({
      entity_type: 'trips', entity_id: tripId,
      action: 'status_changed', actor_type: 'driver', actor_id: driverId,
      old_value: { status: trip.status },
      new_value: { status: 'ACCEPTED', driver_id: driverId },
    });

    return updated;
  });
}
```

**The rule**: Side effects (emails, push notifications, webhooks) are **enqueued** inside the transaction, **executed** by a BullMQ worker outside it. If the transaction rolls back, the enqueued job is never committed to Redis. If the transaction commits, the job is guaranteed to run.

## Error Hierarchy

```typescript
// Business violations — HTTP 4xx
throw new BusinessError('INVALID_TRIP_TRANSITION', {
  from: currentStatus,
  to: targetStatus,
  tripId,
});

// Infrastructure failures — HTTP 5xx, alert oncall
throw new TechnicalError('REDIS_UNAVAILABLE', { operation: 'getDriverLocation' });
```

Never throw raw `Error`. Never throw strings. The error code is the contract with the frontend.

## Pricing Snapshot — Immutability Rule

`pricing_snapshot` on the `trips` table is written **exactly once**: when the trip transitions to `COMPLETED`. It captures the fare calculation at that moment — prices, factors, IVA, everything. It is **never updated, never recalculated, never overwritten**.

```typescript
// WRONG — never do this
await trx('trips').where({ id }).update({ pricing_snapshot: newData });

// CORRECT — only on COMPLETED transition, only if null
if (trip.pricing_snapshot !== null) {
  throw new TechnicalError('PRICING_SNAPSHOT_ALREADY_SET', { tripId: trip.id });
}
```

## Dependency Injection

Services receive their dependencies through the constructor. Never instantiate services inside other services.

```typescript
// WRONG
class TripService {
  async create(dto: CreateTripDto) {
    const pricing = new PricingService(); // ❌ tight coupling
  }
}

// CORRECT
class TripService {
  constructor(
    private readonly db: Knex,
    private readonly pricingService: PricingService,
    private readonly tripQueue: Queue,
  ) {}
}
```

## Soft Delete

Every delete operation is a soft delete. Always.

```typescript
// WRONG
await db('trips').where({ id }).delete();

// CORRECT
await db('trips').where({ id }).update({ deleted_at: new Date() });

// Every SELECT must exclude soft-deleted rows
await db('trips').where({ id, deleted_at: null }).first();
```

## TypeScript Rules

- **No `any`** — ever. If you don't know the type, use `unknown` and narrow it.
- **Knex returns `any[]` by default** — always type the return: `db<TripRow>('trips')`
- **Zod schemas generate types** — `type CreateTripDto = z.infer<typeof CreateTripSchema>`
- **Never assert with `as`** unless you've already validated — prefer type guards
- **No non-null assertions (`!`)** without a comment explaining why it's safe

## Rate Limiting

All endpoints get rate limiting via Fastify's built-in plugin. Critical endpoints:

```typescript
fastify.register(rateLimit, {
  max: 5, timeWindow: '15 minutes',  // POST /auth/login
  keyGenerator: (req) => req.ip,
});
```

See `steering/architecture.md` for the full rate limit table per endpoint.

## BullMQ Worker Pattern

```typescript
const paymentWorker = new Worker('payments', async (job) => {
  const { tripId, amount } = job.data;
  // Workers run OUTSIDE transactions — safe to have network calls
  await stripe.paymentIntents.create({ amount, currency: 'mxn' });
  await db('payments').where({ trip_id: tripId }).update({ status: 'captured' });
}, { connection: redis });

// Retry config — exponential backoff, 3 attempts
paymentWorker.on('failed', (job, err) => {
  if (job.attemptsMade >= 3) alertOncall(err);
});
```

## What NEVER to do

- **Never** write raw SQL strings — always Knex query builder
- **Never** call `new Date()` without making it a constant at the top of the function (makes testing impossible)
- **Never** put a `console.log` in production code — use `pino` logger
- **Never** return the full database row directly — project to the response type
- **Never** skip the audit log on entity state changes
- **Never** run database queries in parallel inside a transaction (use sequential await)
- **Never** catch and swallow errors silently

## Checklist Before Emitting Handoff

```
□ routes.ts — schema validation, auth middleware, no business logic
□ controller.ts — one service call, typed response, no logic
□ service.ts — transaction pattern, SELECT FOR UPDATE, side effects queued
□ repository.ts — typed Knex queries, soft deletes, no business logic
□ schema.ts — Zod schemas for request and response
□ types.ts — TypeScript interfaces for domain types
□ audit_logs entries for all state changes
□ npm run agent:verify:quick passes
□ No TypeScript errors (strict mode)
```
