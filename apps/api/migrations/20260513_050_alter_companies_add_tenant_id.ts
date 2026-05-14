import type { Knex } from 'knex';

// Adds self-referential tenant_id to companies to support hierarchical tenancy.
// A company with tenant_id = NULL is a root tenant.
// A company with tenant_id set belongs to that parent tenant.
// For MVP all companies are root tenants (tenant_id = NULL).
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (table) => {
    table.uuid('tenant_id').nullable().references('id').inTable('companies').onDelete('SET NULL');
  });

  await knex.schema.raw(`
    CREATE INDEX idx_companies_tenant_id ON companies(tenant_id) WHERE tenant_id IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS idx_companies_tenant_id;`);
  await knex.schema.alterTable('companies', (table) => {
    table.dropColumn('tenant_id');
  });
}
