import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('custody_scheduled_reminders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('custody_orders').onDelete('RESTRICT');
    // reminder_type: 'reminder_24h' | 'reminder_1h' | 'reminder_15m' | 'dispatch_alert'
    t.text('reminder_type').notNullable();
    t.timestamp('sent_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['order_id', 'reminder_type']);
    t.index(['order_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('custody_scheduled_reminders');
}
