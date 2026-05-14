import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('custody_types', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('slug', 100).notNullable().unique();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.jsonb('value_declaration_schema').notNullable().defaultTo('{}');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE INDEX idx_custody_types_slug ON custody_types(slug) WHERE active = true;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('custody_types');
}
