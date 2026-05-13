import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trips', (table) => {
    table.timestamp('approved_at', { useTz: true }).nullable();
    table.uuid('approved_by').nullable()
      .references('id').inTable('admin_users').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trips', (table) => {
    table.dropColumn('approved_at');
    table.dropColumn('approved_by');
  });
}
