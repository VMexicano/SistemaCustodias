import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trip_types', (table) => {
    table.string('service_mode', 20).notNullable().defaultTo('people');
  });
  // Ensure all existing rows are tagged as 'people' mode
  await knex('trip_types').update({ service_mode: 'people' });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trip_types', (table) => {
    table.dropColumn('service_mode');
  });
}
