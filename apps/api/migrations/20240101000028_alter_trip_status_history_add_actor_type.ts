import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trip_status_history', (table) => {
    table.string('actor_type', 20).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trip_status_history', (table) => {
    table.dropColumn('actor_type');
  });
}
