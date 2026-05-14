import type { Knex } from 'knex';

// Adds CHECK constraint to user_roles.role for custody domain roles.
// Includes existing ride-hailing roles (passenger, driver, admin) to avoid breaking existing data.
// New custody roles: client, custodio, copiloto, dispatcher, supervisor.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE user_roles ADD CONSTRAINT chk_user_roles_role
      CHECK (role IN (
        'passenger', 'driver', 'admin',
        'client', 'custodio', 'copiloto', 'dispatcher', 'supervisor'
      ));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS chk_user_roles_role;
  `);
}
