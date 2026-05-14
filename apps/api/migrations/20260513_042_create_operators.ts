import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('operators', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('vehicle_id').nullable().references('id').inTable('custody_vehicles').onDelete('SET NULL');
    table.string('operator_type', 20).notNullable();
    table.string('license_number', 50).nullable();
    table.jsonb('certifications').notNullable().defaultTo('[]');
    table.string('status', 20).notNullable().defaultTo('offline');
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(`
    ALTER TABLE operators ADD CONSTRAINT chk_operators_type
      CHECK (operator_type IN ('custodio', 'copiloto'));
    ALTER TABLE operators ADD CONSTRAINT chk_operators_status
      CHECK (status IN ('available', 'busy', 'offline', 'suspended'));
    CREATE INDEX idx_operators_user_id ON operators(user_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_operators_status ON operators(status) WHERE deleted_at IS NULL;
    CREATE INDEX idx_operators_vehicle_id ON operators(vehicle_id) WHERE deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('operators');
}
