import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('payments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('trip_id').notNullable().references('id').inTable('trips').onDelete('RESTRICT');
    table.uuid('passenger_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('driver_id').notNullable().references('id').inTable('drivers').onDelete('RESTRICT');
    table.decimal('amount', 10, 2).notNullable();
    table.decimal('tax_amount', 10, 2).notNullable();
    table.decimal('platform_fee', 10, 2).notNullable();
    table.decimal('driver_earnings', 10, 2).notNullable();
    table.specificType('currency', 'CHAR(3)').notNullable().defaultTo('MXN');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('stripe_payment_intent_id', 100).nullable().unique();
    table.string('stripe_charge_id', 100).nullable();
    table.text('failure_reason').nullable();
    table.integer('retry_count').notNullable().defaultTo(0);
    table.timestamp('charged_at', { useTz: true }).nullable();
    table.timestamp('refunded_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['trip_id']);
    table.index(['passenger_id']);
    table.index(['status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('payments');
}
