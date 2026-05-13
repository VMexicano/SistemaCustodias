import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('drivers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().unique().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('region_id').notNullable().references('id').inTable('region_config').onDelete('RESTRICT');
    table.string('license_number', 50).nullable();
    table.string('status', 30).notNullable().defaultTo('pending');
    table.boolean('online').notNullable().defaultTo(false);
    table.decimal('rating_avg', 3, 2).nullable();
    table.integer('rating_count').notNullable().defaultTo(0);
    table.integer('total_trips').notNullable().defaultTo(0);
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['status']);
    table.index(['online']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('drivers');
}
