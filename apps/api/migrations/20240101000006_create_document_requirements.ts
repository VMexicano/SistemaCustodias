import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('document_requirements', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('region_id').notNullable().references('id').inTable('region_config').onDelete('RESTRICT');
    table.string('code', 50).notNullable();
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.boolean('required').notNullable().defaultTo(true);
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.unique(['region_id', 'code']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('document_requirements');
}
