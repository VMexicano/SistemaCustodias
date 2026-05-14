import type { Knex } from 'knex';

const CUSTODY_TYPES = [
  {
    slug: 'cash_transport',
    name: 'Transporte de Efectivo',
    description: 'Transporte seguro de efectivo, cheques, documentos bancarios y valores monetarios.',
    value_declaration_schema: {
      type: 'object',
      required: ['amount_mxn', 'currency'],
      properties: {
        amount_mxn: {
          type: 'number',
          minimum: 0,
          description: 'Monto total en pesos mexicanos',
        },
        currency: {
          type: 'string',
          enum: ['MXN', 'USD', 'EUR'],
          description: 'Moneda del efectivo',
        },
        denomination_breakdown: {
          type: 'object',
          description: 'Desglose por denominación (opcional)',
          additionalProperties: { type: 'number', minimum: 0 },
        },
        insurance_policy_id: {
          type: 'string',
          description: 'Número de póliza de seguro (opcional)',
        },
      },
      additionalProperties: false,
    },
    active: true,
  },
  {
    slug: 'high_value_package',
    name: 'Paquetería de Alto Valor',
    description: 'Joyería, electrónicos de alta gama, mercancía costosa y bienes de valor elevado.',
    value_declaration_schema: {
      type: 'object',
      required: ['description', 'estimated_value_mxn'],
      properties: {
        description: {
          type: 'string',
          minLength: 10,
          maxLength: 500,
          description: 'Descripción detallada del contenido',
        },
        estimated_value_mxn: {
          type: 'number',
          minimum: 0,
          description: 'Valor estimado en pesos mexicanos',
        },
        insurance_required: {
          type: 'boolean',
          description: 'Si se requiere seguro obligatorio',
        },
        insurance_policy_id: {
          type: 'string',
          description: 'Número de póliza de seguro',
        },
        quantity: {
          type: 'integer',
          minimum: 1,
          description: 'Número de piezas o bultos',
        },
      },
      additionalProperties: false,
    },
    active: true,
  },
  {
    slug: 'confidential_docs',
    name: 'Documentos Confidenciales',
    description: 'Documentos legales, notariales, corporativos y archivos de alta sensibilidad.',
    value_declaration_schema: {
      type: 'object',
      required: ['document_type', 'sensitivity_level'],
      properties: {
        document_type: {
          type: 'string',
          enum: ['legal', 'notarial', 'corporativo', 'fiscal', 'medico', 'otro'],
          description: 'Tipo de documento',
        },
        issuing_entity: {
          type: 'string',
          maxLength: 255,
          description: 'Entidad emisora del documento',
        },
        sensitivity_level: {
          type: 'string',
          enum: ['confidencial', 'secreto', 'alto_secreto'],
          description: 'Nivel de clasificación de sensibilidad',
        },
        document_count: {
          type: 'integer',
          minimum: 1,
          description: 'Número de documentos en el paquete',
        },
        requires_signature_on_delivery: {
          type: 'boolean',
          description: 'Si requiere firma del receptor al entregar',
        },
      },
      additionalProperties: false,
    },
    active: true,
  },
  {
    slug: 'vip_escort',
    name: 'Escolta VIP',
    description: 'Escolta y protección de personas de alto perfil, ejecutivos y figuras públicas.',
    value_declaration_schema: {
      type: 'object',
      required: ['person_name', 'threat_level'],
      properties: {
        person_name: {
          type: 'string',
          minLength: 2,
          maxLength: 255,
          description: 'Nombre completo de la persona protegida',
        },
        threat_level: {
          type: 'string',
          enum: ['bajo', 'medio', 'alto', 'critico'],
          description: 'Nivel de amenaza evaluado',
        },
        route_restrictions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Zonas o rutas que deben evitarse',
        },
        additional_agents_required: {
          type: 'integer',
          minimum: 0,
          description: 'Agentes adicionales de seguridad requeridos',
        },
        special_instructions: {
          type: 'string',
          maxLength: 1000,
          description: 'Instrucciones especiales de seguridad',
        },
      },
      additionalProperties: false,
    },
    active: true,
  },
];

export async function seed(knex: Knex): Promise<void> {
  for (const custodyType of CUSTODY_TYPES) {
    await knex('custody_types')
      .insert({
        slug: custodyType.slug,
        name: custodyType.name,
        description: custodyType.description,
        value_declaration_schema: custodyType.value_declaration_schema,
        active: custodyType.active,
      })
      .onConflict('slug')
      .ignore();
  }
}
