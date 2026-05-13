import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('trip_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('region_id').notNullable().references('id').inTable('region_config').onDelete('RESTRICT');
    table.string('code', 20).notNullable();
    table.string('name', 100).notNullable();
    table.decimal('base_fare', 10, 2).notNullable();
    table.decimal('cost_per_km', 10, 2).notNullable();
    table.decimal('cost_per_minute', 10, 2).notNullable();
    table.decimal('min_fare', 10, 2).notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.unique(['region_id', 'code']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('trip_types');
}
