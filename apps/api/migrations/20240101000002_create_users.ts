import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('region_id').notNullable().references('id').inTable('region_config').onDelete('RESTRICT');
    table.string('email', 255).nullable().unique();
    table.string('phone', 20).notNullable().unique();
    table.boolean('phone_verified').notNullable().defaultTo(false);
    table.string('full_name', 255).notNullable();
    table.text('avatar_url').nullable();
    table.string('status', 20).notNullable().defaultTo('active');
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['phone']);
    table.index(['status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('users');
}
