import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trip_types', (table) => {
    table.string('description', 255).notNullable().defaultTo('');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trip_types', (table) => {
    table.dropColumn('description');
  });
}
