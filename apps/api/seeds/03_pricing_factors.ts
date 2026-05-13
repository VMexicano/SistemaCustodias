import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  const region = await knex('region_config')
    .where({ country_code: 'MX' })
    .select('id')
    .first();

  if (!region) {
    throw new Error('region_config MX not found — run 01_region_config seed first');
  }

  const pricingFactors: Array<{
    region_id: string;
    code: string;
    name: string;
    type: string;
    value: number;
    stackable: boolean;
    active: boolean;
  }> = [
    {
      region_id: region.id,
      code: 'night',
      name: 'Tarifa nocturna',
      type: 'percentage',
      value: 0.20,
      stackable: true,
      active: false,
    },
    {
      region_id: region.id,
      code: 'rain',
      name: 'Tarifa lluvia',
      type: 'multiplier',
      value: 1.30,
      stackable: false,
      active: false,
    },
    {
      region_id: region.id,
      code: 'peak_hour',
      name: 'Hora pico',
      type: 'multiplier',
      value: 1.50,
      stackable: false,
      active: false,
    },
    {
      region_id: region.id,
      code: 'high_demand',
      name: 'Alta demanda',
      type: 'multiplier',
      value: 2.00,
      stackable: false,
      active: false,
    },
  ];

  for (const factor of pricingFactors) {
    await knex('pricing_factors')
      .insert(factor)
      .onConflict(['region_id', 'code'])
      .ignore();
  }
}
