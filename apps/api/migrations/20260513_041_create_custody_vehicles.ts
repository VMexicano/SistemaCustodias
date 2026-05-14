import type { Knex } from 'knex';

// custody_vehicles is separate from the ride-hailing `vehicles` table (M-008).
// These are armored/secure transport units used exclusively in custody operations.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('custody_vehicles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('plate', 20).notNullable().unique();
    table.string('make', 100).nullable();
    table.string('model', 100).notNullable();
    table.integer('year').notNullable();
    table.string('gps_device_id', 100).nullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE INDEX idx_custody_vehicles_active ON custody_vehicles(active) WHERE deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('custody_vehicles');
}
