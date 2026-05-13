import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('vehicles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('driver_id').notNullable().references('id').inTable('drivers').onDelete('CASCADE');
    table.string('make', 50).notNullable();
    table.string('model', 50).notNullable();
    table.integer('year').notNullable();
    table.string('color', 30).notNullable();
    table.string('license_plate', 20).notNullable().unique();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['driver_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('vehicles');
}
