import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('pricing_factor_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('factor_id').notNullable().references('id').inTable('pricing_factors').onDelete('CASCADE');
    table.string('rule_type', 30).notNullable(); // time_range | demand_threshold | weather_condition | distance_threshold | manual
    table.jsonb('rule_config').notNullable().defaultTo('{}');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['factor_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('pricing_factor_rules');
}
