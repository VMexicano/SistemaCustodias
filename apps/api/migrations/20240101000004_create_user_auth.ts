import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_auth', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
    table.text('password_hash').nullable();
    table.string('provider', 20).nullable();
    table.text('provider_id').nullable();
    table.timestamp('last_login_at', { useTz: true }).nullable();
    table.text('refresh_token').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('user_auth');
}
