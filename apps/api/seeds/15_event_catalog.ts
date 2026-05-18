import type { Knex } from 'knex';

const EVENT_TYPES = [
  {
    code: 'CHECKPOINT',
    label: 'Punto de control',
    requires_photo: false,
    requires_audio: false,
    requires_signature: false,
    interval_minutes: 15,
    payload_schema: {
      type: 'object',
      required: ['route_on_track', 'vehicle_secured', 'cargo_intact'],
      properties: {
        route_on_track: { type: 'boolean' },
        vehicle_secured: { type: 'boolean' },
        cargo_intact: { type: 'boolean' },
        notes: { type: 'string', maxLength: 500 },
      },
      additionalProperties: false,
    },
  },
  {
    code: 'PANIC',
    label: 'Botón de pánico',
    requires_photo: false,
    requires_audio: false,
    requires_signature: false,
    interval_minutes: null,
    payload_schema: {
      type: 'object',
      required: ['panic_code', 'crew_status'],
      properties: {
        panic_code: { type: 'string', enum: ['ROBBERY_ATTEMPT', 'ACCIDENT', 'MEDICAL', 'OTHER'] },
        crew_status: { type: 'string', enum: ['SAFE', 'THREAT', 'UNKNOWN'] },
        auto_triggered: { type: 'boolean' },
      },
      additionalProperties: false,
    },
  },
  {
    code: 'CARGO_STATUS',
    label: 'Verificación de carga',
    requires_photo: true,
    requires_audio: false,
    requires_signature: false,
    interval_minutes: null,
    payload_schema: {
      type: 'object',
      required: ['declared_value_confirmed', 'seals_intact'],
      properties: {
        declared_value_confirmed: { type: 'boolean' },
        seals_intact: { type: 'boolean' },
        seal_codes: { type: 'array', items: { type: 'string' } },
        temperature_celsius: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    },
  },
  {
    code: 'INCIDENT',
    label: 'Reporte de incidente',
    requires_photo: false,
    requires_audio: false,
    requires_signature: false,
    interval_minutes: null,
    payload_schema: {
      type: 'object',
      required: ['incident_type', 'severity', 'description'],
      properties: {
        incident_type: {
          type: 'string',
          enum: ['FLAT_TIRE', 'ACCIDENT', 'DETOUR', 'DELAY', 'OTHER'],
        },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        description: { type: 'string', maxLength: 1000 },
        estimated_delay_minutes: { type: 'integer', minimum: 0 },
        police_report_no: { type: ['string', 'null'] },
      },
      additionalProperties: false,
    },
  },
  {
    code: 'DELIVERY_ATTEMPT',
    label: 'Intento de entrega',
    requires_photo: true,
    requires_audio: false,
    requires_signature: true,
    interval_minutes: null,
    payload_schema: {
      type: 'object',
      required: ['recipient_present', 'id_verified', 'recipient_name'],
      properties: {
        recipient_present: { type: 'boolean' },
        id_verified: { type: 'boolean' },
        id_type: { type: 'string', enum: ['INE', 'PASSPORT', 'RFC', 'OTHER'] },
        id_number: { type: 'string' },
        recipient_name: { type: 'string', maxLength: 200 },
      },
      additionalProperties: false,
    },
  },
];

const VERTICALS = ['cash_transport', 'high_value_package', 'confidential_docs', 'vip_escort'];

export async function seed(knex: Knex): Promise<void> {
  for (const vertical of VERTICALS) {
    for (const event of EVENT_TYPES) {
      await knex('event_catalog')
        .insert({
          id: knex.raw('gen_random_uuid()'),
          vertical_slug: vertical,
          ...event,
          active: true,
        })
        .onConflict(['vertical_slug', 'code'])
        .ignore();
    }
  }
}
