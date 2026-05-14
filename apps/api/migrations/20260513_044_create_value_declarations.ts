import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('value_declarations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').notNullable().references('id').inTable('custody_orders').onDelete('RESTRICT');
    table.uuid('custody_type_id').notNullable().references('id').inTable('custody_types').onDelete('RESTRICT');
    table.jsonb('declared_value').notNullable();
    table.string('insurance_policy_id', 100).nullable();
    table.uuid('verified_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.timestamp('verified_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['order_id']);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_value_declarations_order ON value_declarations(order_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('value_declarations');
}
