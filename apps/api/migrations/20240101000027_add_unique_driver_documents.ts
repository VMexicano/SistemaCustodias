import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('driver_documents', (table) => {
    table.unique(['driver_id', 'requirement_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('driver_documents', (table) => {
    table.dropUnique(['driver_id', 'requirement_id']);
  });
}
