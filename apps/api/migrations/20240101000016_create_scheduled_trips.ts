import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('scheduled_trips', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    table.timestamp('scheduled_for', { useTz: true }).notNullable();
    table.boolean('notif_24h_sent').notNullable().defaultTo(false);
    table.boolean('notif_1h_sent').notNullable().defaultTo(false);
    table.boolean('notif_15m_sent').notNullable().defaultTo(false);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['scheduled_for']);
    table.index(['notif_24h_sent', 'notif_1h_sent', 'notif_15m_sent']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('scheduled_trips');
}
