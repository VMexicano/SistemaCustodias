import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. temperature_readings — hypertable TimescaleDB (no PK propia)
  await knex.schema.createTable('temperature_readings', (table) => {
    table.uuid('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    table.timestamp('recorded_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.decimal('celsius', 5, 2).notNullable();
    table.text('sensor_id').nullable();
    table.decimal('lat', 10, 7).nullable();
    table.decimal('lng', 10, 7).nullable();
  });

  await knex.schema.raw(`
    SELECT create_hypertable('temperature_readings', 'recorded_at');
    CREATE INDEX ON temperature_readings (trip_id, recorded_at DESC);
  `);

  // 2. custody_events — append-only, con PK UUID
  await knex.schema.createTable('custody_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('trip_id').notNullable().references('id').inTable('trips').onDelete('CASCADE');
    table.string('event_type', 30).notNullable();
    table.uuid('actor_id').notNullable().references('id').inTable('users');
    table.text('signature_url').nullable();
    table.text('photo_url').nullable();
    table.decimal('declared_value', 12, 2).nullable();
    table.text('notes').nullable();
    table.decimal('lat', 10, 7).nullable();
    table.decimal('lng', 10, 7).nullable();
    table.timestamp('occurred_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.integer('sequence').notNullable();
  });

  await knex.schema.raw(`
    ALTER TABLE custody_events ADD CONSTRAINT chk_custody_events_event_type
      CHECK (event_type IN ('pick_up', 'handoff', 'delivery'));
    CREATE INDEX ON custody_events (trip_id, sequence);
    CREATE UNIQUE INDEX ON custody_events (trip_id, sequence);
  `);

  // 3. ALTER TABLE document_requirements — agregar vertical_id
  await knex.schema.alterTable('document_requirements', (table) => {
    table.uuid('vertical_id').nullable().references('id').inTable('verticals').onDelete('SET NULL');
  });

  // 4. ALTER TABLE trip_types — agregar weight_capacity_kg
  await knex.schema.alterTable('trip_types', (table) => {
    table.decimal('weight_capacity_kg', 8, 2).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  // Revertir en orden inverso

  // 4. Quitar weight_capacity_kg de trip_types
  await knex.schema.alterTable('trip_types', (table) => {
    table.dropColumn('weight_capacity_kg');
  });

  // 3. Quitar vertical_id de document_requirements
  await knex.schema.alterTable('document_requirements', (table) => {
    table.dropColumn('vertical_id');
  });

  // 2. Eliminar custody_events
  await knex.schema.dropTableIfExists('custody_events');

  // 1. Eliminar temperature_readings (hypertable se elimina igual que tabla regular)
  await knex.schema.dropTableIfExists('temperature_readings');
}
