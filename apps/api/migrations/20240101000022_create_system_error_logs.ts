import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('system_error_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('error_code', 50).notNullable();
    table.string('service', 50).notNullable(); // payment | notification | scheduler
    table.text('message').notNullable();
    table.jsonb('context').nullable(); // payload that caused the error
    table.boolean('resolved').notNullable().defaultTo(false);
    table.uuid('resolved_by').nullable();
    table.timestamp('resolved_at', { useTz: true }).nullable();
    table.integer('retry_count').notNullable().defaultTo(0);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['service', 'resolved']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('system_error_logs');
}
