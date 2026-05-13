import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scheduled_trips', (table) => {
    // Configurable dispatch window — how many minutes before scheduled_for to start searching
    table.integer('dispatch_window_min').notNullable().defaultTo(30);
    // When the driver search actually started (audit + deduplication guard)
    table.timestamp('search_started_at', { useTz: true }).nullable();
    // When the passenger was notified that the platform is searching for a driver (T-15 min)
    table.timestamp('passenger_notified_searching_at', { useTz: true }).nullable();
    // Future: driver pre-assigned before the trip window opens
    table.uuid('pre_assigned_driver_id').nullable()
      .references('id').inTable('drivers').onDelete('SET NULL');
    // When the pre-assignment was made (future use)
    table.timestamp('pre_assigned_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('scheduled_trips', (table) => {
    table.dropColumn('dispatch_window_min');
    table.dropColumn('search_started_at');
    table.dropColumn('passenger_notified_searching_at');
    table.dropForeign(['pre_assigned_driver_id']);
    table.dropColumn('pre_assigned_driver_id');
    table.dropColumn('pre_assigned_at');
  });
}
