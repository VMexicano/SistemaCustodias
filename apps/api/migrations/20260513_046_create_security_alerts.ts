import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('security_alerts', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('custody_orders').onDelete('RESTRICT');
    table.uuid('operator_id').notNullable().references('id').inTable('operators').onDelete('RESTRICT');
    table.string('alert_type', 30).notNullable();
    table.string('severity', 20).notNullable();
    table.specificType('location', 'POINT').nullable();
    table.text('description').nullable();
    table.uuid('resolved_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('resolved_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    ALTER TABLE security_alerts ADD CONSTRAINT chk_security_alerts_type
      CHECK (alert_type IN ('panic', 'tamper', 'geofence_violation', 'communication_loss', 'custom'));
    ALTER TABLE security_alerts ADD CONSTRAINT chk_security_alerts_severity
      CHECK (severity IN ('low', 'medium', 'high', 'critical'));
    CREATE INDEX idx_security_alerts_order ON security_alerts(order_id);
    CREATE INDEX idx_security_alerts_operator ON security_alerts(operator_id);
    CREATE INDEX idx_security_alerts_unresolved ON security_alerts(order_id) WHERE resolved_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('security_alerts');
}
