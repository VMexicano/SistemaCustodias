/**
 * Seed 13 — Usuarios de prueba para tests de custodia E2E
 *
 * Crea dos usuarios con roles de custodia y los vincula a la empresa demo.
 * Depende de:
 *   - Seed 04: empresa-demo-sa en companies (company_id = primer registro)
 *   - Seed 01: user_roles 'client', 'supervisor'
 *
 * TEST_OTP bypass: 123456 (requiere TEST_MODE=true en el API)
 */
import type { Knex } from 'knex';
import bcrypt from 'bcrypt';

const CLIENT_PHONE = '+525500000099';
const SUPERVISOR_PHONE = '+525500000098';

export async function seed(knex: Knex): Promise<void> {
  // Resolve the demo tenant company
  const company = await knex('companies')
    .where('slug', 'empresa-demo-sa')
    .orWhere('name', 'like', '%Demo%')
    .first() as { id: string } | undefined;

  if (!company) {
    console.warn('[seed 13] empresa-demo-sa not found — skipping custody test users');
    return;
  }

  const tenantId = company.id;

  // Hash placeholder (TEST_OTP bypass skips password check)
  const passwordHash = await bcrypt.hash('unused', 1);

  // Create or update client user
  await knex('users')
    .insert({
      phone: CLIENT_PHONE,
      role: 'client',
      name: 'Cliente Prueba QA',
      email: 'cliente-qa@custodia.test',
      password_hash: passwordHash,
    })
    .onConflict('phone')
    .merge(['role', 'name', 'email']);

  const clientUser = await knex('users').where({ phone: CLIENT_PHONE }).first() as { id: string };

  // Link client to tenant company
  await knex('company_users')
    .insert({
      company_id: tenantId,
      user_id: clientUser.id,
      role: 'client',
    })
    .onConflict(['company_id', 'user_id'])
    .merge(['role']);

  // Create or update supervisor user
  await knex('users')
    .insert({
      phone: SUPERVISOR_PHONE,
      role: 'supervisor',
      name: 'Supervisor Prueba QA',
      email: 'supervisor-qa@custodia.test',
      password_hash: passwordHash,
    })
    .onConflict('phone')
    .merge(['role', 'name', 'email']);

  const supervisorUser = await knex('users').where({ phone: SUPERVISOR_PHONE }).first() as { id: string };

  await knex('company_users')
    .insert({
      company_id: tenantId,
      user_id: supervisorUser.id,
      role: 'supervisor',
    })
    .onConflict(['company_id', 'user_id'])
    .merge(['role']);

  // Also create a client record in the clients table
  await knex('clients')
    .insert({
      user_id: clientUser.id,
      company_id: tenantId,
      company_name: 'Empresa Demo SA',
      contact_name: 'Cliente Prueba QA',
    })
    .onConflict('user_id')
    .ignore();
}
