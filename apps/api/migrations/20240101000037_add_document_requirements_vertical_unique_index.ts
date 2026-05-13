import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // NULL values are not considered equal in PostgreSQL unique indexes,
  // so existing rows with vertical_id=NULL do not conflict with each other.
  // This enables ON CONFLICT (region_id, code, vertical_id) DO NOTHING in seeds.
  await knex.raw(`
    CREATE UNIQUE INDEX document_requirements_region_code_vertical_unique
    ON document_requirements (region_id, code, vertical_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    DROP INDEX IF EXISTS document_requirements_region_code_vertical_unique
  `);
}
