import type { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  // 1. Verticals
  await knex('verticals')
    .insert([
      {
        slug: 'taxi',
        name: 'Taxi',
        description: 'Servicio de taxi urbano',
        features: JSON.stringify({
          scheduling: true,
          multiStop: false,
          cargoDeclaration: false,
          chainOfCustody: false,
          temperatureLog: false,
          b2bAccounts: false,
          pricingModel: 'per_km_min',
        }),
        config: JSON.stringify({}),
        active: true,
      },
      {
        slug: 'custody',
        name: 'Custodia de Valores',
        description: 'Transporte seguro de valores con cadena de custodia',
        features: JSON.stringify({
          scheduling: true,
          multiStop: true,
          cargoDeclaration: true,
          chainOfCustody: true,
          temperatureLog: false,
          b2bAccounts: true,
          pricingModel: 'per_declared_value',
          unitTypeDetermination: 'by_declared_value',
          custodyEventTypes: [
            { code: 'pick_up', label: 'Recogida', requiresPhoto: true, requiresSignature: false },
            { code: 'handoff', label: 'Traspaso', requiresPhoto: true, requiresSignature: true },
            { code: 'delivery', label: 'Entrega', requiresPhoto: true, requiresSignature: true },
          ],
          cargoFields: [
            { key: 'cargo_description', label: 'Descripción de la carga', type: 'text', required: true, placeholder: 'Ej. Efectivo, documentos, valores...', multiline: true },
            { key: 'declared_value', label: 'Valor declarado (MXN)', type: 'number', required: true, placeholder: '0.00' },
            { key: 'recipient_name', label: 'Nombre del destinatario', type: 'text', required: true, placeholder: 'Nombre completo' },
            { key: 'recipient_phone', label: 'Teléfono del destinatario', type: 'phone', required: false, placeholder: '+52 55 0000 0000' },
          ],
        }),
        config: JSON.stringify({}),
        active: true,
      },
      {
        slug: 'cold-chain',
        name: 'Cadena de Frío',
        description: 'Transporte refrigerado con monitoreo de temperatura',
        features: JSON.stringify({
          scheduling: true,
          multiStop: true,
          cargoDeclaration: true,
          chainOfCustody: true,
          temperatureLog: true,
          b2bAccounts: true,
          pricingModel: 'per_declared_value',
          unitTypeDetermination: 'by_cargo_type',
          custodyEventTypes: [
            { code: 'pick_up', label: 'Recogida', requiresPhoto: true, requiresSignature: false },
            { code: 'handoff', label: 'Traspaso', requiresPhoto: true, requiresSignature: false },
            { code: 'delivery', label: 'Entrega', requiresPhoto: true, requiresSignature: true },
          ],
          cargoFields: [
            { key: 'cargo_description', label: 'Descripción de la carga', type: 'text', required: true, placeholder: 'Ej. Alimentos perecederos, medicamentos...', multiline: true },
            { key: 'declared_value', label: 'Valor declarado (MXN)', type: 'number', required: false, placeholder: '0.00' },
            { key: 'recipient_name', label: 'Nombre del destinatario', type: 'text', required: false, placeholder: 'Nombre completo' },
            { key: 'recipient_phone', label: 'Teléfono del destinatario', type: 'phone', required: false, placeholder: '+52 55 0000 0000' },
          ],
        }),
        config: JSON.stringify({}),
        active: true,
      },
    ])
    .onConflict('slug')
    .merge(['name', 'description', 'features', 'config', 'active']);

  // 2. Link existing trip_types to taxi vertical
  const taxiVertical = await knex('verticals').where({ slug: 'taxi' }).first();
  if (taxiVertical) {
    await knex('trip_types')
      .whereNull('vertical_id')
      .update({ vertical_id: taxiVertical.id });
  }

  // 3. Demo company
  const taxiId = taxiVertical?.id ?? (await knex('verticals').where({ slug: 'taxi' }).first())?.id;
  if (taxiId) {
    await knex('companies')
      .insert({
        vertical_id: taxiId,
        slug: 'empresa-demo',
        name: 'Empresa Demo SA',
        rfc: 'EDE900101XX0',
        contact_email: 'contacto@empresa-demo.com',
        contact_phone: '+525512345678',
        active: true,
        metadata: JSON.stringify({}),
      })
      .onConflict('slug')
      .ignore();
  }
}
