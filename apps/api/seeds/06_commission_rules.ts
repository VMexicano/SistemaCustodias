import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // Get the MX region id
  const region = await knex('region_config')
    .where('country_code', 'MX')
    .select('id')
    .first() as { id: string } | undefined;

  if (!region) {
    console.warn('[seed 06] region_config MX not found — skipping commission_rules seed');
    return;
  }

  // Idempotent: only insert if no active commission rule exists for this region
  const existing = await knex('commission_rules')
    .where({ region_id: region.id, active: true })
    .first();

  if (existing) {
    return;
  }

  await knex('commission_rules').insert({
    region_id: region.id,
    platform_fee_pct: 0.20,
    active: true,
    valid_from: knex.raw('NOW()'),
  });
}
