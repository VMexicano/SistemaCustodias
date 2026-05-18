import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `CREATE TYPE order_event_actor_role AS ENUM ('custodio', 'copiloto', 'supervisor', 'system')`,
  );

  await knex.schema.createTable('order_event', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id').notNullable().references('id').inTable('custody_orders').onDelete('RESTRICT');
    t.uuid('tenant_id').notNullable().references('id').inTable('companies').onDelete('RESTRICT');
    t.string('event_type', 50).notNullable();
    t.integer('sequence_no').notNullable();
    t.uuid('actor_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.specificType('actor_role', 'order_event_actor_role').notNullable();
    t.timestamp('app_timestamp', { useTz: true }).notNullable();
    t.timestamp('auto_timestamp', { useTz: true }).nullable(); // Monitor Engine — Sprint 15
    t.jsonb('location').notNullable();
    t.jsonb('evidence').nullable();
    t.jsonb('payload').notNullable();
    t.jsonb('device').notNullable();
    t.string('integrity_hash', 64).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['order_id', 'sequence_no'], { indexName: 'order_event_order_sequence_unique' });
  });

  await knex.raw(
    'CREATE INDEX order_event_order_id_created_at_idx ON order_event (order_id, created_at DESC)',
  );
  await knex.raw(
    'CREATE INDEX order_event_tenant_id_created_at_idx ON order_event (tenant_id, created_at DESC)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_event');
  await knex.raw('DROP TYPE IF EXISTS order_event_actor_role');
}
