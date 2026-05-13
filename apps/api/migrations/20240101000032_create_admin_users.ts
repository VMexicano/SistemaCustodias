import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('username', 50).notNullable().unique();
    table.string('full_name', 100).notNullable();
    table.string('password_hash', 255).notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('admin_users');
}
