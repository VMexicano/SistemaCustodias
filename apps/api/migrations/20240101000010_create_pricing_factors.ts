import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('pricing_factors', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('region_id').notNullable().references('id').inTable('region_config').onDelete('RESTRICT');
    table.string('code', 50).notNullable();
    table.string('name', 100).notNullable();
    table.string('type', 20).notNullable(); // fixed_amount | percentage | multiplier
    table.decimal('value', 10, 4).notNullable();
    table.boolean('stackable').notNullable().defaultTo(true);
    table.integer('priority').notNullable().defaultTo(0);
    table.boolean('active').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.unique(['region_id', 'code']);
    table.index(['region_id', 'active']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('pricing_factors');
}
