import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users');
    t.uuid('order_id').nullable().references('id').inTable('custody_orders');
    t.uuid('alert_id').nullable().references('id').inTable('security_alerts');
    t.text('channel').notNullable();
    t.text('priority').notNullable();
    t.text('status').notNullable().defaultTo('pending');
    t.text('title').notNullable();
    t.text('body').notNullable();
    t.timestamp('sent_at', { useTz: true }).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notifications');
}
