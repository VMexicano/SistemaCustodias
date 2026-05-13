import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('entity_type', 50).notNullable();
    table.uuid('entity_id').notNullable();
    table.string('action', 30).notNullable(); // created | updated | deleted | status_changed
    table.string('actor_type', 20).notNullable(); // user | system | admin
    table.uuid('actor_id').nullable();
    table.jsonb('old_value').nullable();
    table.jsonb('new_value').nullable();
    table.jsonb('metadata').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['entity_type', 'entity_id']);
    table.index(['actor_id']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('audit_logs');
}
