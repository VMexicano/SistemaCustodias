import type { Knex } from 'knex';

// INSERT-ONLY table — never UPDATE or DELETE. Forms the immutable chain of custody audit log.
// No updated_at column by design.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('order_transitions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('custody_orders').onDelete('RESTRICT');
    table.string('from_status', 30).nullable();
    table.string('to_status', 30).notNullable();
    table.uuid('actor_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.string('actor_role', 30).notNullable();
    table.specificType('location', 'POINT').nullable();
    table.text('notes').nullable();
    table.text('digital_signature').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE INDEX idx_order_transitions_order ON order_transitions(order_id);
    CREATE INDEX idx_order_transitions_actor ON order_transitions(actor_id);
    CREATE INDEX idx_order_transitions_created ON order_transitions(order_id, created_at DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_transitions');
}
