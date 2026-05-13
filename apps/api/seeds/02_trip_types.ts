import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  const region = await knex('region_config')
    .where({ country_code: 'MX' })
    .select('id')
    .first();

  if (!region) {
    throw new Error('region_config MX not found — run 01_region_config seed first');
  }

  const tripTypes: Array<{
    region_id: string;
    code: string;
    name: string;
    description: string;
    base_fare: number;
    cost_per_km: number;
    cost_per_minute: number;
    min_fare: number;
  }> = [
    {
      region_id: region.id,
      code: 'basic',
      name: 'UberX',
      description: 'Servicio económico para hasta 4 pasajeros.',
      base_fare: 25.00,
      cost_per_km: 8.50,
      cost_per_minute: 1.50,
      min_fare: 35.00,
    },
    {
      region_id: region.id,
      code: 'plus',
      name: 'UberX Plus',
      description: 'Vehículos más amplios, hasta 6 pasajeros.',
      base_fare: 35.00,
      cost_per_km: 12.00,
      cost_per_minute: 2.00,
      min_fare: 50.00,
    },
    {
      region_id: region.id,
      code: 'premium',
      name: 'Uber Black',
      description: 'Servicio premium con conductores certificados.',
      base_fare: 60.00,
      cost_per_km: 18.00,
      cost_per_minute: 3.00,
      min_fare: 80.00,
    },
  ];

  for (const tripType of tripTypes) {
    await knex('trip_types')
      .insert(tripType)
      .onConflict(['region_id', 'code'])
      .ignore();
  }
}
