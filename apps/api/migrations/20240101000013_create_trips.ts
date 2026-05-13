import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('trips', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('region_id').notNullable().references('id').inTable('region_config').onDelete('RESTRICT');
    table.uuid('passenger_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('driver_id').nullable().references('id').inTable('drivers').onDelete('RESTRICT');
    table.uuid('trip_type_id').notNullable().references('id').inTable('trip_types').onDelete('RESTRICT');
    table.string('status', 30).notNullable().defaultTo('REQUESTED');
    // Origin
    table.text('origin_address').notNullable();
    table.decimal('origin_lat', 10, 8).notNullable();
    table.decimal('origin_lng', 11, 8).notNullable();
    // Destination
    table.text('destination_address').notNullable();
    table.decimal('destination_lat', 10, 8).notNullable();
    table.decimal('destination_lng', 11, 8).notNullable();
    // Pricing
    table.decimal('estimated_distance_km', 8, 2).nullable();
    table.decimal('estimated_duration_min', 8, 2).nullable();
    table.decimal('estimated_fare', 10, 2).nullable();
    table.decimal('actual_distance_km', 8, 2).nullable();
    table.decimal('actual_duration_min', 8, 2).nullable();
    table.decimal('final_fare', 10, 2).nullable();
    table.jsonb('pricing_snapshot').nullable(); // immutable once set — ADR-009
    // Timestamps
    table.timestamp('accepted_at', { useTz: true }).nullable();
    table.timestamp('started_at', { useTz: true }).nullable();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.timestamp('cancelled_at', { useTz: true }).nullable();
    table.text('cancellation_reason').nullable();
    table.timestamp('deleted_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('NOW()'));
    table.index(['passenger_id', 'status']);
    table.index(['driver_id', 'status']);
    table.index(['status']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('trips');
}
