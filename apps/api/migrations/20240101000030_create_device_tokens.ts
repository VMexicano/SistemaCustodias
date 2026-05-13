import type { Knex } from 'knex';

/**
 * Migration 030 — create device_tokens table.
 *
 * Stores FCM push notification tokens registered from the mobile app (Sprint 7).
 * One user can have multiple tokens (multiple devices), but each token is unique globally.
 *
 * Used by FCMNotificationChannel to look up the target token for a given user_id.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('device_tokens');
  if (exists) return;

  await knex.schema.createTable('device_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.text('token').notNullable().unique();
    table.string('platform', 10).notNullable();
    table.timestamps(true, true);
  });

  await knex.raw(`ALTER TABLE device_tokens ADD CONSTRAINT device_tokens_platform_check CHECK (platform IN ('ios', 'android'))`);
  await knex.raw(`CREATE INDEX device_tokens_user_id_idx ON device_tokens(user_id)`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('device_tokens');
}
