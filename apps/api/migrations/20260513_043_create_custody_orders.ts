import type { Knex } from 'knex';

const ORDER_STATUSES = [
  'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED',
  'ASSIGNED', 'REASSIGNED', 'CREW_CONFIRMED',
  'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'PICKUP_FAILED',
  'IN_TRANSIT', 'AT_DELIVERY', 'DELIVERY_FAILED',
  'DELIVERED', 'COMPLETED',
  'INCIDENT', 'RESOLVED',
].map((s) => `'${s}'`).join(', ');

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('custody_orders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('order_number', 30).notNullable().unique();
    table.uuid('client_id').notNullable().references('id').inTable('clients').onDelete('RESTRICT');
    table.uuid('custody_type_id').notNullable().references('id').inTable('custody_types').onDelete('RESTRICT');
    table.uuid('tenant_id').notNullable().references('id').inTable('companies').onDelete('RESTRICT');
    table.string('status', 30).notNullable().defaultTo('DRAFT');
    table.jsonb('pickup_address').notNullable();
    table.jsonb('delivery_address').notNullable();
    table.timestamp('scheduled_at', { useTz: true }).nullable();
    table.timestamp('pickup_window_start', { useTz: true }).nullable();
    table.timestamp('pickup_window_end', { useTz: true }).nullable();
    table.uuid('custodio_id').nullable().references('id').inTable('operators').onDelete('SET NULL');
    table.uuid('copiloto_id').nullable().references('id').inTable('operators').onDelete('SET NULL');
    table.timestamp('custodio_confirmed_at', { useTz: true }).nullable();
    table.timestamp('copiloto_confirmed_at', { useTz: true }).nullable();
    table.uuid('approved_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('approved_at', { useTz: true }).nullable();
    table.text('rejected_reason').nullable();
    table.jsonb('custody_snapshot').nullable();
    table.jsonb('pricing_snapshot').nullable();
    table.text('notes').nullable();
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    ALTER TABLE custody_orders ADD CONSTRAINT chk_custody_orders_status
      CHECK (status IN (${ORDER_STATUSES}));
    ALTER TABLE custody_orders ADD CONSTRAINT chk_custody_orders_crew_different
      CHECK (custodio_id IS NULL OR copiloto_id IS NULL OR custodio_id <> copiloto_id);
    CREATE INDEX idx_custody_orders_tenant ON custody_orders(tenant_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_custody_orders_client ON custody_orders(client_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_custody_orders_status ON custody_orders(status) WHERE deleted_at IS NULL;
    CREATE INDEX idx_custody_orders_custodio ON custody_orders(custodio_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_custody_orders_copiloto ON custody_orders(copiloto_id) WHERE deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('custody_orders');
}
