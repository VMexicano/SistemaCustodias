import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('clients', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('company_id').nullable().references('id').inTable('companies').onDelete('SET NULL');
    table.string('company_name', 255).nullable();
    table.string('rfc', 13).nullable();
    table.string('contact_name', 255).notNullable();
    table.decimal('credit_limit_mxn', 12, 2).notNullable().defaultTo(0);
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    CREATE INDEX idx_clients_user_id ON clients(user_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_clients_company_id ON clients(company_id) WHERE deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('clients');
}
