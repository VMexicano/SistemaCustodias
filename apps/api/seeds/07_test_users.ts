/**
 * Seed 07 — E2E test users
 *
 * Creates two deterministic users for Detox / Playwright E2E tests.
 * Only runs when NODE_ENV !== 'production'.
 *
 * +525500000001 → passenger (admin user from seed 04 + passenger role)
 * +525500000002 → driver   (approved, ready to go-online)
 */
import type { Knex } from 'knex';

const PASSENGER_PHONE = '+525500000001';
const DRIVER_PHONE = '+525500000002';

export async function seed(knex: Knex): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    console.log('Skipping test users seed in production');
    return;
  }

  const region = await knex('region_config')
    .where({ country_code: 'MX' })
    .select('id')
    .first();

  if (!region) {
    throw new Error('region_config MX not found — run 01_region_config seed first');
  }

  // -------------------------------------------------------------------------
  // Passenger: +525500000001 (admin user already exists via seed 04)
  // -------------------------------------------------------------------------
  const passengerUser = await knex('users')
    .where({ phone: PASSENGER_PHONE })
    .select('id')
    .first();

  if (!passengerUser) {
    throw new Error(
      `User ${PASSENGER_PHONE} not found — run 04_admin_user seed first`,
    );
  }

  await knex('user_roles')
    .insert({ user_id: passengerUser.id, role: 'passenger', active: true })
    .onConflict(['user_id', 'role'])
    .ignore();

  // -------------------------------------------------------------------------
  // Driver: +525500000002
  // -------------------------------------------------------------------------
  await knex('users')
    .insert({
      region_id: region.id,
      phone: DRIVER_PHONE,
      full_name: 'Driver E2E Test',
      status: 'active',
      phone_verified: true,
    })
    .onConflict('phone')
    .ignore();

  const driverUser = await knex('users')
    .where({ phone: DRIVER_PHONE })
    .select('id')
    .first();

  if (!driverUser) {
    throw new Error('Failed to retrieve driver user after insert');
  }

  await knex('user_roles')
    .insert({ user_id: driverUser.id, role: 'driver', active: true })
    .onConflict(['user_id', 'role'])
    .ignore();

  await knex('drivers')
    .insert({
      user_id: driverUser.id,
      region_id: region.id,
      license_number: 'E2E-TEST-001',
      status: 'approved',
      online: false,
    })
    .onConflict('user_id')
    .ignore();

  const driver = await knex('drivers').where({ user_id: driverUser.id }).select('id').first();

  if (driver) {
    await knex('vehicles')
      .insert({
        driver_id: driver.id,
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        color: 'Blanco',
        license_plate: 'E2E-0002',
        active: true,
      })
      .onConflict('license_plate')
      .ignore();
  }
}
