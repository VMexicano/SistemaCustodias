/**
 * Seed 14 — Actores de custodia para debug/E2E completo
 *
 *   dispatcher  +525500000097
 *   custodio    +525500000096  → operators record (custodio) + custody_vehicle
 *   copiloto    +525500000095  → operators record (copiloto)
 *   pricing_rule cash_transport $500 base + $15/km
 *
 * OTP bypass: TEST_MODE=true → siempre acepta "123456"
 * Idempotente.
 */
import type { Knex } from 'knex';

const ACTORS = [
  { phone: '+525500000097', role: 'dispatcher', full_name: 'Dispatcher Prueba QA', email: 'dispatcher-qa@custodia.test' },
  { phone: '+525500000096', role: 'custodio',   full_name: 'Custodio Prueba QA',   email: 'custodio-qa@custodia.test' },
  { phone: '+525500000095', role: 'copiloto',   full_name: 'Copiloto Prueba QA',   email: 'copiloto-qa@custodia.test' },
];

export async function seed(knex: Knex): Promise<void> {
  const company = await knex('companies')
    .where('slug', 'empresa-demo')
    .orWhere('name', 'like', '%Demo%')
    .first() as { id: string } | undefined;

  if (!company) {
    console.warn('[seed 14] empresa-demo not found — skipping');
    return;
  }

  const tenantId = company.id;
  const region = await knex('region_config').select('id').first() as { id: string };
  const regionId = region.id;

  // ── Upsert users ──────────────────────────────────────────────────────────
  for (const actor of ACTORS) {
    await knex('users')
      .insert({ phone: actor.phone, full_name: actor.full_name, region_id: regionId, email: actor.email })
      .onConflict('phone')
      .merge(['full_name', 'email']);
  }

  const userRows = await knex('users')
    .whereIn('phone', ACTORS.map((a) => a.phone))
    .select('id', 'phone') as { id: string; phone: string }[];

  const byPhone = Object.fromEntries(userRows.map((u) => [u.phone, u]));

  // ── Roles + tenant link ────────────────────────────────────────────────────
  for (const actor of ACTORS) {
    const user = byPhone[actor.phone];
    if (!user) continue;

    await knex('user_roles')
      .insert({ user_id: user.id, role: actor.role })
      .onConflict(['user_id', 'role']).ignore();

    await knex('company_users')
      .insert({ company_id: tenantId, user_id: user.id, role: 'member' })
      .onConflict(['company_id', 'user_id']).merge(['role']);
  }

  // ── Custody vehicle ────────────────────────────────────────────────────────
  let vehicleId: string;
  const existingVehicle = await knex('custody_vehicles').where({ plate: 'QA-001-DEBUG' }).first() as { id: string } | undefined;

  if (existingVehicle) {
    vehicleId = existingVehicle.id;
  } else {
    const [vehicle] = await knex('custody_vehicles')
      .insert({ plate: 'QA-001-DEBUG', make: 'Nissan', model: 'Urvan', year: 2023, active: true })
      .returning('id') as { id: string }[];
    vehicleId = vehicle!.id;
  }

  // ── Operators records ──────────────────────────────────────────────────────
  const custodioUser = byPhone['+525500000096'];
  const copilotoUser = byPhone['+525500000095'];

  if (custodioUser) {
    const exists = await knex('operators').where({ user_id: custodioUser.id }).whereNull('deleted_at').first();
    if (exists) {
      await knex('operators').where({ user_id: custodioUser.id }).update({ status: 'available', vehicle_id: vehicleId, license_number: 'LIC-CUSTODIO-QA', operator_type: 'custodio' });
    } else {
      await knex('operators').insert({ user_id: custodioUser.id, operator_type: 'custodio', license_number: 'LIC-CUSTODIO-QA', vehicle_id: vehicleId, status: 'available' });
    }
  }

  if (copilotoUser) {
    const exists = await knex('operators').where({ user_id: copilotoUser.id }).whereNull('deleted_at').first();
    if (exists) {
      await knex('operators').where({ user_id: copilotoUser.id }).update({ status: 'available', license_number: 'LIC-COPILOTO-QA', operator_type: 'copiloto' });
    } else {
      await knex('operators').insert({ user_id: copilotoUser.id, operator_type: 'copiloto', license_number: 'LIC-COPILOTO-QA', status: 'available' });
    }
  }

  // ── Pricing rule ───────────────────────────────────────────────────────────
  const custodyType = await knex('custody_types').where({ slug: 'cash_transport' }).first() as { id: string } | undefined;

  if (custodyType) {
    const ruleExists = await knex('pricing_rules').where({ custody_type_id: custodyType.id, active: true }).first();
    if (!ruleExists) {
      await knex('pricing_rules').insert({ custody_type_id: custodyType.id, base_price_mxn: 500, per_km_price_mxn: 15, active: true });
    }
  }

  console.log('[seed 14] ✅ Actores listos:');
  console.log('  dispatcher  +525500000097  OTP: 123456');
  console.log('  custodio    +525500000096  OTP: 123456');
  console.log('  copiloto    +525500000095  OTP: 123456');
  console.log('  vehículo    QA-001-DEBUG (Nissan Urvan 2023)');
  console.log('  pricing     cash_transport $500 base + $15/km');
}
