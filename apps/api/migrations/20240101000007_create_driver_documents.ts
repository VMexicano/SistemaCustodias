import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('driver_documents', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('driver_id').notNullable().references('id').inTable('drivers').onDelete('CASCADE');
    table.uuid('requirement_id').notNullable().references('id').inTable('document_requirements').onDelete('RESTRICT');
    table.text('file_url').notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.text('rejection_reason').nullable();
    table.timestamp('expires_at', { useTz: true }).nullable();
    table.timestamp('reviewed_at', { useTz: true }).nullable();
    table.uuid('reviewed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['driver_id']);
    table.index(['status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('driver_documents');
}
