import type { Knex } from 'knex';

/**
 * Seed: Document requirements for MX region.
 *
 * Order of insertion:
 *   1. region_config (MX) — already seeded by 01_region_config.ts
 *   2. document_requirements — each row references region_config.id resolved at runtime
 *
 * Idempotent: uses ON CONFLICT (region_id, code) DO NOTHING.
 */

const REQUIREMENTS = [
  {
    code: 'drivers_license',
    name: 'Licencia de conducir',
    description: 'Licencia de conducir vigente (tipos A, B o C)',
    required: true,
  },
  {
    code: 'vehicle_registration',
    name: 'Tarjeta de circulación',
    description: 'Tarjeta de circulación del vehículo vigente',
    required: true,
  },
  {
    code: 'vehicle_insurance',
    name: 'Seguro de auto vigente',
    description: 'Póliza de seguro con cobertura de responsabilidad civil',
    required: true,
  },
  {
    code: 'driver_photo',
    name: 'Foto de identificación',
    description: 'Foto del conductor con fondo blanco, sin lentes ni gorra',
    required: true,
  },
  {
    code: 'vehicle_photo',
    name: 'Foto del vehículo',
    description: 'Foto frontal del vehículo mostrando la placa claramente',
    required: false,
  },
];

export async function seed(knex: Knex): Promise<void> {
  const region = await knex('region_config')
    .where({ country_code: 'MX' })
    .select('id')
    .first() as { id: string } | undefined;

  if (!region) {
    throw new Error('region_config MX not found — run 01_region_config seed first');
  }

  for (const req of REQUIREMENTS) {
    await knex('document_requirements')
      .insert({
        region_id: region.id,
        code: req.code,
        name: req.name,
        description: req.description,
        required: req.required,
        active: true,
      })
      .onConflict(['region_id', 'code'])
      .ignore();
  }
}
