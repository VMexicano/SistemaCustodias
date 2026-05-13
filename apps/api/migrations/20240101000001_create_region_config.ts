import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('region_config', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.specificType('country_code', 'CHAR(2)').notNullable().unique();
    table.string('region_name', 100).notNullable();
    table.specificType('currency', 'CHAR(3)').notNullable();
    table.decimal('tax_rate', 5, 4).notNullable();
    table.string('timezone', 50).notNullable();
    table.string('phone_prefix', 5).notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('region_config');
}
