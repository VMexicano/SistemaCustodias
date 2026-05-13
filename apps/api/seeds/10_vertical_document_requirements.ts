import type { Knex } from 'knex';

/**
 * Seed: Document requirements per vertical + update vertical features JSONB.
 *
 * Prerequisites:
 *   - 01_region_config.ts (MX region)
 *   - 05_document_requirements.ts (base requirements)
 *   - 09_verticals_and_companies.ts (taxi, custody, cold-chain verticals)
 *   - Migration 036 (document_requirements.vertical_id column)
 *
 * Idempotent: ON CONFLICT (region_id, code, vertical_id) DO NOTHING for new rows.
 * Features update uses JSONB merge so existing keys are preserved.
 */

export async function seed(knex: Knex): Promise<void> {
  // 1. Resolve IDs at runtime
  const mx = await knex('region_config')
    .where({ country_code: 'MX' })
    .select('id')
    .first() as { id: string } | undefined;

  if (!mx) {
    throw new Error('region_config MX not found — run 01_region_config seed first');
  }

  const custodyVertical = await knex('verticals')
    .where({ slug: 'custody' })
    .select('id')
    .first() as { id: string } | undefined;

  if (!custodyVertical) {
    throw new Error('vertical custody not found — run 09_verticals_and_companies seed first');
  }

  const coldChainVertical = await knex('verticals')
    .where({ slug: 'cold-chain' })
    .select('id')
    .first() as { id: string } | undefined;

  if (!coldChainVertical) {
    throw new Error('vertical cold-chain not found — run 09_verticals_and_companies seed first');
  }

  // 2. Insert vertical-specific document requirements (idempotent)
  const verticalRequirements = [
    {
      region_id: mx.id,
      code: 'security_certification',
      name: 'Certificación de seguridad',
      required: true,
      active: true,
      vertical_id: custodyVertical.id,
    },
    {
      region_id: mx.id,
      code: 'vehicle_armored_cert',
      name: 'Certificado vehículo blindado',
      required: true,
      active: true,
      vertical_id: custodyVertical.id,
    },
    {
      region_id: mx.id,
      code: 'refrigeration_cert',
      name: 'Certificación de refrigeración',
      required: true,
      active: true,
      vertical_id: coldChainVertical.id,
    },
    {
      region_id: mx.id,
      code: 'temperature_logger_cert',
      name: 'Certificado registrador de temperatura',
      required: false,
      active: true,
      vertical_id: coldChainVertical.id,
    },
  ];

  for (const req of verticalRequirements) {
    await knex('document_requirements')
      .insert(req)
      .onConflict(['region_id', 'code', 'vertical_id'])
      .ignore();
  }

  // 3. Update features JSONB for all 3 verticals (merge — preserves existing keys)
  await knex('verticals').where({ slug: 'taxi' }).update({
    features: knex.raw('features || ?::jsonb', [
      JSON.stringify({
        cargoDeclaration: false,
        temperatureLog: false,
        chainOfCustody: false,
        pricingModel: 'per_km_min',
      }),
    ]),
  });

  await knex('verticals').where({ slug: 'custody' }).update({
    features: knex.raw('features || ?::jsonb', [
      JSON.stringify({
        cargoDeclaration: true,
        temperatureLog: false,
        chainOfCustody: true,
        pricingModel: 'fixed_rate',
      }),
    ]),
  });

  await knex('verticals').where({ slug: 'cold-chain' }).update({
    features: knex.raw('features || ?::jsonb', [
      JSON.stringify({
        cargoDeclaration: true,
        temperatureLog: true,
        chainOfCustody: false,
        pricingModel: 'per_weight_km',
      }),
    ]),
  });
}
