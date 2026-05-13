import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('drivers', (table) => {
    table.date('license_expiry').nullable();
    // TEXT[] to allow multiple service modes per driver (ADR-021)
    table.specificType('service_modes', "TEXT[] DEFAULT '{people}'").notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('drivers', (table) => {
    table.dropColumn('service_modes');
    table.dropColumn('license_expiry');
  });
}
