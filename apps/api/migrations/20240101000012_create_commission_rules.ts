import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('commission_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('region_id').notNullable().references('id').inTable('region_config').onDelete('RESTRICT');
    table.decimal('platform_fee_pct', 5, 4).notNullable(); // e.g. 0.20 = 20%
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('valid_from', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('valid_until', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['region_id', 'active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('commission_rules');
}
