/**
 * Seed 14 — Actores de custodia para debug/E2E completo
 *
 * Crea los actores que faltan en seed 13:
 *   - Dispatcher  +525500000097
 *   - Custodio    +525500000096  → operators record + custody_vehicle
 *   - Copiloto    +525500000095  → operators record
 *   - Pricing rule cash_transport (base $500 MXN + $15/km)
 *
 * OTP bypass: TEST_MODE=true → siempre acepta "123456"
 * Idempotente: onConflict ignore/merge en todos los inserts.
 */
import type { Knex } from 'knex';
import bcrypt from 'bcrypt';

const ACTORS = [
  { phone: '+525500000097', role: 'dispatcher', name: 'Dispatcher Prueba QA', email: 'dispatcher-qa@custodia.test' },
  { phone: '+525500000096', role: 'custodio',   name: 'Custodio Prueba QA',   email: 'custodio-qa@custodia.test' },
  { phone: '+525500000095', role: 'copiloto',   name: 'Copiloto Prueba QA',   email: 'copiloto-qa@custodia.test' },
];

export async function seed(knex: Knex): Promise<void> {
  const company = await knex('companies')
    .where('slug', 'empresa-demo-sa')
    .orWhere('name', 'like', '%Demo%')
    .first() as { id: string } | undefined;

  if (!company) {
    console.warn('[seed 14] empresa-demo-sa not found — skipping');
    return;
  }

  const tenantId = company.id;
  const passwordHash = await bcrypt.hash('unused', 1);

  // ── Upsert users ──────────────────────────────────────────────────────────
  for (const actor of ACTORS) {
    await knex('users')
      .insert({
        phone: actor.phone,
        role: actor.role,
        name: actor.name,
        full_name: actor.name,
        email: actor.email,
        password_hash: passwordHash,
      })
      .onConflict('phone')
      .merge(['role', 'name', 'full_name', 'email']);
  }

  // Fetch user ids
  const userRows = await knex('users')
    .whereIn('phone', ACTORS.map((a) => a.phone))
    .select('id', 'phone', 'role') as { id: string; phone: string; role: string }[];

  const byPhone = Object.fromEntries(userRows.map((u) => [u.phone, u]));

  // ── Link to tenant company ─────────────────────────────────────────────────
  for (const actor of ACTORS) {
    const user = byPhone[actor.phone];
    if (!user) continue;
    await knex('company_users')
      .insert({ company_id: tenantId, user_id: user.id, role: actor.role })
      .onConflict(['company_id', 'user_id'])
      .merge(['role']);
  }

  // ── Custody vehicle for custodio ───────────────────────────────────────────
  const existingVehicle = await knex('custody_vehicles')
    .where({ plate: 'QA-001-DEBUG' })
    .first() as { id: string } | undefined;

  let vehicleId: string;

  if (existingVehicle) {
    vehicleId = existingVehicle.id;
  } else {
    const [vehicle] = await knex('custody_vehicles')
      .insert({
        plate: 'QA-001-DEBUG',
        model: 'Nissan Urvan QA',
        year: 2023,
        color: 'Blanco',
        tenant_id: tenantId,
        active: true,
      })
      .returning('id') as { id: string }[];
    vehicleId = vehicle!.id;
  }

  // ── Operators records ──────────────────────────────────────────────────────
  const custodioUser = byPhone['+525500000096'];
  const copilotoUser = byPhone['+525500000095'];

  if (custodioUser) {
    await knex('operators')
      .insert({
        user_id: custodioUser.id,
        tenant_id: tenantId,
        license_number: 'LIC-CUSTODIO-QA',
        vehicle_id: vehicleId,
        status: 'available',
      })
      .onConflict('user_id')
      .merge(['status', 'vehicle_id', 'license_number']);
  }

  if (copilotoUser) {
    await knex('operators')
      .insert({
        user_id: copilotoUser.id,
        tenant_id: tenantId,
        license_number: 'LIC-COPILOTO-QA',
        vehicle_id: null,
        status: 'available',
      })
      .onConflict('user_id')
      .merge(['status', 'license_number']);
  }

  // ── Pricing rule for cash_transport ───────────────────────────────────────
  const custodyType = await knex('custody_types')
    .where({ slug: 'cash_transport' })
    .first() as { id: string } | undefined;

  if (custodyType) {
    await knex('pricing_rules')
      .insert({
        custody_type_id: custodyType.id,
        tenant_id: tenantId,
        base_price_mxn: 500,
        per_km_price_mxn: 15,
        active: true,
      })
      .onConflict(['custody_type_id', 'tenant_id'])
      .ignore();
  }

  console.log('[seed 14] ✅ Actores custodia listos:');
  console.log('  dispatcher  +525500000097');
  console.log('  custodio    +525500000096');
  console.log('  copiloto    +525500000095');
  console.log('  vehículo    QA-001-DEBUG');
  console.log('  pricing     cash_transport $500 base + $15/km');
}
