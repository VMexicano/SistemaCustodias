import type { Knex } from 'knex';

/**
 * Migration 029 — add stripe_customer_id to passenger_payment_methods.
 *
 * Required for Stripe off-session PaymentIntent (Sprint 5 — ADR-017).
 * Nullable — backward-compatible with existing rows from Sprint 2.
 *
 * When a passenger saves their first payment method (via SetupIntent),
 * a Stripe Customer is created and the ID persisted here so future
 * charges can use off_session: true.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('passenger_payment_methods', (table) => {
    table.string('stripe_customer_id', 100).nullable().after('passenger_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('passenger_payment_methods', (table) => {
    table.dropColumn('stripe_customer_id');
  });
}
