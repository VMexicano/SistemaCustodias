import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_roles', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('role', 20).notNullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.unique(['user_id', 'role']);
    table.index(['user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('user_roles');
}
