---
name: creating-knex-migration
description: Create Knex migration files following project naming conventions and safety protocols for PostgreSQL schema changes. Use when adding tables, columns, indexes, constraints, or TimescaleDB hypertables to the database. Generates correctly structured up/down migration pairs, enforces naming conventions, and flags irreversible operations that require human approval before production execution.
---

Database migrations are the only truly irreversible operation in this project. A deployed migration to production cannot be easily undone if it modifies existing data. Create them with that weight in mind.

## File Naming Convention

```
migrations/{YYYYMMDD}_{HHMMSS}_{description}.ts
```

Examples:
```
migrations/20260404_143022_create_trips_table.ts
migrations/20260404_150011_add_driver_id_to_trips.ts
migrations/20260404_161500_create_trip_locations_hypertable.ts
```

The timestamp prefix ensures alphabetical order equals chronological order. Use the current datetime when creating the file.

## Migration Structure

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('trips', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('passenger_id').notNullable().references('id').inTable('users');
    table.uuid('driver_id').nullable().references('id').inTable('drivers');
    table.enum('status', [
      'REQUESTED', 'SEARCHING', 'ACCEPTED',
      'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'IN_PROGRESS',
      'COMPLETED', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_DRIVER',
      'CANCELLED_NO_DRIVER', 'NO_SHOW',
    ]).notNullable().defaultTo('REQUESTED');
    table.jsonb('pricing_snapshot').nullable(); // Written ONCE on COMPLETED
    table.decimal('fare_amount', 10, 2).nullable();
    table.timestamps(true, true); // created_at, updated_at
    table.timestamp('deleted_at').nullable(); // Soft delete
  });

  // Indexes — add only what the query patterns need
  await knex.schema.table('trips', (table) => {
    table.index(['passenger_id', 'deleted_at']); // GET /trips?passenger_id=
    table.index(['driver_id', 'status']);         // Driver's active trip lookup
    table.index(['status', 'created_at']);        // Admin dashboard, SEARCHING timeout
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('trips');
}
```

## TimescaleDB Hypertables

For time-series tables (driver locations, trip telemetry):

```typescript
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('trip_locations', (table) => {
    table.uuid('id').defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('trip_id').notNullable().references('id').inTable('trips');
    table.uuid('driver_id').notNullable();
    table.decimal('lat', 10, 8).notNullable();
    table.decimal('lng', 11, 8).notNullable();
    table.timestamp('recorded_at').notNullable(); // The time dimension column
  });

  // Convert to hypertable — this is an irreversible operation
  await knex.raw(
    `SELECT create_hypertable('trip_locations', 'recorded_at', chunk_time_interval => INTERVAL '1 day')`
  );
}

export async function down(knex: Knex): Promise<void> {
  // WARNING: dropping a hypertable also drops all its chunks
  await knex.schema.dropTableIfExists('trip_locations');
}
```

## Irreversibility Flags

Mark these in the handoff `irreversible_flags` field — they require human approval before running in production:

| Operation | Why irreversible |
|---|---|
| `create_hypertable` | Converts table structure, cannot be undone without dropping |
| `ALTER TABLE ... DROP COLUMN` | Data is lost permanently |
| `UPDATE ... SET` on existing data | Data transformation cannot be reversed automatically |
| `DROP TABLE` | Data is lost permanently |
| Adding `NOT NULL` to existing column | Fails if existing rows have nulls — data must be backfilled first |

Standard `CREATE TABLE`, `ADD COLUMN` (nullable), and `CREATE INDEX` are safe and non-irreversible.

## Column Conventions

```typescript
// All tables must have:
table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
table.timestamps(true, true);       // created_at, updated_at auto-managed
table.timestamp('deleted_at').nullable(); // Soft delete — NEVER hard delete

// Foreign keys: always reference by UUID, always index
table.uuid('user_id').notNullable().references('id').inTable('users').index();

// Enums: define as TypeScript union first, then mirror in migration
table.enum('status', ['PENDING', 'ACTIVE', 'SUSPENDED']).notNullable();

// JSON: use jsonb (indexed, binary) not json (text)
table.jsonb('metadata').nullable();
```

## Running Migrations

```bash
# Local dev
npm run db:migrate

# Check status (applied vs pending)
npm run db:migrate:status

# Rollback last batch (dev only — NEVER in production without backup)
npm run db:migrate:rollback
```

## Never

- **Never** modify a migration file that has already been applied (even if it has a typo)
- **Never** run `db:migrate:rollback` in production without a full backup
- **Never** use `string` columns for enums — use Knex's `enum()` method
- **Never** hard delete — always add `deleted_at` and use soft deletes
- **Never** add a `NOT NULL` column to an existing table without a default value or data backfill migration
- **Never** skip the `down` function — it must undo everything in `up`
