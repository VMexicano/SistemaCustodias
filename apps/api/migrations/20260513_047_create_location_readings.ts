import type { Knex } from 'knex';

// TimescaleDB hypertable partitioned by time.
// WARNING: create_hypertable() is irreversible in production — the down() uses DROP TABLE.
// In production this requires a maintenance window and data migration plan.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('location_readings', (table) => {
    table.timestamp('time', { useTz: true }).notNullable();
    table.uuid('order_id').notNullable();
    table.uuid('operator_id').notNullable();
    table.uuid('vehicle_id').nullable();
    table.decimal('lat', 10, 8).notNullable();
    table.decimal('lng', 11, 8).notNullable();
    table.decimal('speed_kmh', 6, 2).nullable();
    table.decimal('accuracy_m', 8, 2).nullable();
    table.decimal('heading', 5, 2).nullable();
  });

  await knex.schema.raw(`
    SELECT create_hypertable('location_readings', 'time', chunk_time_interval => INTERVAL '1 day');
    CREATE INDEX idx_location_readings_order ON location_readings(order_id, time DESC);
    CREATE INDEX idx_location_readings_operator ON location_readings(operator_id, time DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('location_readings');
}
