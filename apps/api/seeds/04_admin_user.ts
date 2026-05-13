import type { Knex } from 'knex';

const ADMIN_PHONE = '+525500000001';

export async function seed(knex: Knex): Promise<void> {
  const region = await knex('region_config')
    .where({ country_code: 'MX' })
    .select('id')
    .first();

  if (!region) {
    throw new Error('region_config MX not found — run 01_region_config seed first');
  }

  // Insert admin user; ignore if phone already exists (idempotent).
  await knex('users')
    .insert({
      region_id: region.id,
      phone: ADMIN_PHONE,
      full_name: 'Admin UBER_BASE',
      status: 'active',
      phone_verified: true,
    })
    .onConflict('phone')
    .ignore();

  // Retrieve the user (whether just inserted or already existing).
  const adminUser = await knex('users')
    .where({ phone: ADMIN_PHONE })
    .select('id')
    .first();

  if (!adminUser) {
    throw new Error('Failed to retrieve admin user after insert');
  }

  // Insert admin role; ignore if the (user_id, role) pair already exists (idempotent).
  await knex('user_roles')
    .insert({
      user_id: adminUser.id,
      role: 'admin',
      active: true,
    })
    .onConflict(['user_id', 'role'])
    .ignore();
}
