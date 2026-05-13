import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('companies', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('vertical_id').nullable().references('id').inTable('verticals').onDelete('SET NULL');
    table.string('slug', 100).notNullable().unique();
    table.string('name', 255).notNullable();
    table.string('rfc', 13).nullable();
    table.string('tax_id', 50).nullable();
    table.string('contact_email', 255).nullable();
    table.string('contact_phone', 20).nullable();
    table.text('address').nullable();
    table.boolean('active').notNullable().defaultTo(true);
    table.jsonb('metadata').notNullable().defaultTo('{}');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true }).nullable();
  });

  await knex.schema.raw(`
    CREATE INDEX idx_companies_vertical_id ON companies(vertical_id);
    CREATE INDEX idx_companies_active ON companies(active) WHERE deleted_at IS NULL;
  `);

  await knex.schema.createTable('company_users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('role', 20).notNullable().defaultTo('member');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['company_id', 'user_id']);
  });

  await knex.schema.raw(`
    ALTER TABLE company_users ADD CONSTRAINT chk_company_users_role
      CHECK (role IN ('owner', 'admin', 'member'));
    CREATE INDEX idx_company_users_company ON company_users(company_id);
    CREATE INDEX idx_company_users_user ON company_users(user_id);
  `);

  await knex.schema.createTable('configurations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('entity_type', 20).notNullable();
    table.uuid('entity_id').notNullable();
    table.string('namespace', 100).notNullable();
    table.string('key', 100).notNullable();
    table.jsonb('value').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['entity_type', 'entity_id', 'namespace', 'key']);
  });

  await knex.schema.raw(`
    ALTER TABLE configurations ADD CONSTRAINT chk_configurations_entity_type
      CHECK (entity_type IN ('company', 'user', 'vertical'));
    CREATE INDEX idx_configurations_entity ON configurations(entity_type, entity_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('configurations');
  await knex.schema.dropTableIfExists('company_users');
  await knex.schema.dropTableIfExists('companies');
}
