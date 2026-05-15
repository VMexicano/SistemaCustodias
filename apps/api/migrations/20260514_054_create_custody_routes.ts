import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('custody_routes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('order_id')
      .notNullable()
      .unique()
      .references('id')
      .inTable('custody_orders')
      .onDelete('RESTRICT');

    // Intermediate waypoints only — pickup and delivery come from the order itself
    t.jsonb('waypoints').notNullable().defaultTo('[]');

    t.decimal('total_distance_km', 10, 3).nullable();
    t.integer('estimated_duration_minutes').nullable();

    t.uuid('approved_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('approved_at', { useTz: true }).nullable();

    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['order_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('custody_routes');
}
