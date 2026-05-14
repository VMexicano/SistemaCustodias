import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('pricing_rules', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('custody_type_id').notNullable().references('id').inTable('custody_types').onDelete('RESTRICT');
    table.decimal('base_price_mxn', 12, 2).notNullable().defaultTo(0);
    table.decimal('per_km_price_mxn', 8, 2).notNullable().defaultTo(0);
    table.decimal('per_declared_value_pct', 5, 4).notNullable().defaultTo(0);
    table.jsonb('conditions').notNullable().defaultTo('{}');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE INDEX idx_pricing_rules_type ON pricing_rules(custody_type_id) WHERE active = true;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('pricing_rules');
}
