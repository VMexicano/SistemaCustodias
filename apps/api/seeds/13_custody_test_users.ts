/**
 * Seed 13 — Usuarios de prueba: client + supervisor
 *
 * OTP bypass: TEST_MODE=true → siempre acepta "123456"
 */
import type { Knex } from 'knex';

const CLIENT_PHONE    = '+525500000099';
const SUPERVISOR_PHONE = '+525500000098';

export async function seed(knex: Knex): Promise<void> {
  const company = await knex('companies')
    .where('slug', 'empresa-demo')
    .orWhere('name', 'like', '%Demo%')
    .first() as { id: string } | undefined;

  if (!company) {
    console.warn('[seed 13] empresa-demo not found — skipping custody test users');
    return;
  }

  const tenantId = company.id;

  const region = await knex('region_config').select('id').first() as { id: string };
  const regionId = region.id;

  // ── Client ────────────────────────────────────────────────────────────────
  await knex('users')
    .insert({ phone: CLIENT_PHONE, full_name: 'Cliente Prueba QA', region_id: regionId, email: 'cliente-qa@custodia.test' })
    .onConflict('phone')
    .merge(['full_name', 'email']);

  const clientUser = await knex('users').where({ phone: CLIENT_PHONE }).first() as { id: string };

  await knex('user_roles')
    .insert({ user_id: clientUser.id, role: 'client' })
    .onConflict(['user_id', 'role']).ignore();

  await knex('company_users')
    .insert({ company_id: tenantId, user_id: clientUser.id, role: 'member' })
    .onConflict(['company_id', 'user_id']).merge(['role']);

  const clientExists = await knex('clients').where({ user_id: clientUser.id }).first();
  if (!clientExists) {
    await knex('clients').insert({ user_id: clientUser.id, company_id: tenantId, company_name: 'Empresa Demo SA', contact_name: 'Cliente Prueba QA' });
  }

  // ── Supervisor ────────────────────────────────────────────────────────────
  await knex('users')
    .insert({ phone: SUPERVISOR_PHONE, full_name: 'Supervisor Prueba QA', region_id: regionId, email: 'supervisor-qa@custodia.test' })
    .onConflict('phone')
    .merge(['full_name', 'email']);

  const supervisorUser = await knex('users').where({ phone: SUPERVISOR_PHONE }).first() as { id: string };

  await knex('user_roles')
    .insert({ user_id: supervisorUser.id, role: 'supervisor' })
    .onConflict(['user_id', 'role']).ignore();

  await knex('company_users')
    .insert({ company_id: tenantId, user_id: supervisorUser.id, role: 'member' })
    .onConflict(['company_id', 'user_id']).merge(['role']);

  console.log('[seed 13] ✅ client +525500000099 | supervisor +525500000098');
}
