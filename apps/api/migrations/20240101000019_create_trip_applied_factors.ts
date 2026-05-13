import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('trip_applied_factors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    table.uuid('factor_id').notNullable().references('id').inTable('pricing_factors').onDelete('RESTRICT');
    table.string('factor_code', 50).notNullable();
    table.decimal('factor_value', 10, 4).notNullable(); // value active at the time of the trip (R-DATA-006)
    table.decimal('impact_amount', 10, 2).notNullable(); // how much it added/multiplied to the price
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['trip_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('trip_applied_factors');
}
