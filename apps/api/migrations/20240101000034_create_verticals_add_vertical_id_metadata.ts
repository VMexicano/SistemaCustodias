import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('verticals', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('slug', 50).notNullable().unique();
    table.string('name', 100).notNullable();
    table.text('description').nullable();
    table.jsonb('features').notNullable().defaultTo('{}');
    table.jsonb('config').notNullable().defaultTo('{}');
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('trip_types', (table) => {
    table.uuid('vertical_id').nullable().references('id').inTable('verticals').onDelete('SET NULL');
  });

  await knex.schema.alterTable('trips', (table) => {
    table.jsonb('metadata').notNullable().defaultTo('{}');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('trips', (table) => {
    table.dropColumn('metadata');
  });

  await knex.schema.alterTable('trip_types', (table) => {
    table.dropForeign(['vertical_id']);
    table.dropColumn('vertical_id');
  });

  await knex.schema.dropTableIfExists('verticals');
}
