import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Step 1: create the regular table
  await knex.schema.createTable('trip_locations', (table) => {
    table.uuid('id').notNullable().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    table.uuid('driver_id').notNullable().references('id').inTable('drivers').onDelete('CASCADE');
    table.decimal('latitude', 10, 8).notNullable();
    table.decimal('longitude', 11, 8).notNullable();
    table.decimal('speed_kmh', 5, 2).nullable();
    table.decimal('heading_degrees', 5, 2).nullable();
    table.timestamp('recorded_at', { useTz: true }).notNullable();
    // Composite PK required by TimescaleDB
    table.primary(['id', 'recorded_at']);
  });

  // Step 2: convert to hypertable (partition by recorded_at)
  await knex.raw(`
    SELECT create_hypertable('trip_locations', 'recorded_at',
      chunk_time_interval => INTERVAL '1 day'
    )
  `);

  // Step 3: automatic retention policy 90 days (R-DATA-003)
  await knex.raw(`
    SELECT add_retention_policy('trip_locations', INTERVAL '90 days')
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('trip_locations');
}
