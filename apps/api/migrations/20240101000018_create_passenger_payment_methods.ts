import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('passenger_payment_methods', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('passenger_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('provider_method_id', 100).notNullable(); // Stripe pm_xxx — NEVER store card numbers (R-PAY-003)
    table.string('brand', 20).nullable(); // visa, mastercard
    table.string('last4', 4).nullable();
    table.integer('exp_month').nullable();
    table.integer('exp_year').nullable();
    table.boolean('is_default').notNullable().defaultTo(false);
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['passenger_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('passenger_payment_methods');
}
