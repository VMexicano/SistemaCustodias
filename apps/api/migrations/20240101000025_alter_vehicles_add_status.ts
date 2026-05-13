import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vehicles', (table) => {
    table.string('status', 20).notNullable().defaultTo('pending');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('vehicles', (table) => {
    table.dropColumn('status');
  });
}
