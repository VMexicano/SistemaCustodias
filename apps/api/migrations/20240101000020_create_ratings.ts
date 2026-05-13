import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ratings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    table.uuid('rater_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('rated_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.integer('score').notNullable(); // 1-5
    table.text('comment').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.unique(['trip_id', 'rater_id']);
    table.index(['rated_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('ratings');
}
