import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('trip_status_history', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    table.string('from_status', 30).nullable();
    table.string('to_status', 30).notNullable();
    table.uuid('changed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.text('notes').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['trip_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('trip_status_history');
}
