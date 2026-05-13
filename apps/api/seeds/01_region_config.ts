import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  await knex('region_config')
    .insert({
      country_code: 'MX',
      region_name: 'México',
      currency: 'MXN',
      tax_rate: 0.1600,
      timezone: 'America/Mexico_City',
      phone_prefix: '+52',
      active: true,
    })
    .onConflict('country_code')
    .ignore();
}
