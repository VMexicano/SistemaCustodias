import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('custody_payments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('custody_orders').onDelete('RESTRICT').unique();
    table.decimal('amount_mxn', 12, 2).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('stripe_payment_intent_id', 100).nullable();
    table.timestamp('paid_at', { useTz: true }).nullable();
    table.text('failed_reason').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    ALTER TABLE custody_payments ADD CONSTRAINT chk_custody_payments_status
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded'));
    CREATE INDEX idx_custody_payments_status ON custody_payments(status);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('custody_payments');
}
