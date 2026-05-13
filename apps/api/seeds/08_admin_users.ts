/**
 * Seed 08 — Admin backoffice users
 *
 * Creates a default admin user for the backoffice.
 * Password: Admin1234!
 *
 * Change credentials immediately after first login in production.
 */
import type { Knex } from 'knex';
import bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
  const passwordHash = await bcrypt.hash('Admin1234!', 12);

  await knex('admin_users')
    .insert({
      username: 'admin',
      full_name: 'Administrador',
      password_hash: passwordHash,
      active: true,
    })
    .onConflict('username')
    .ignore();
}
