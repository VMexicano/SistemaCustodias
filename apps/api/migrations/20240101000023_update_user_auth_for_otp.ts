import type { Knex } from 'knex';

// ⚠️ IRREVERSIBLE in production: drops refresh_token and password_hash columns.
// All data in those columns will be permanently lost.
// Requires human approval before running in any non-local environment.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('user_auth', (table) => {
    // Remove legacy columns — data loss is intentional (OTP-only auth, no passwords)
    table.dropColumn('refresh_token');
    table.dropColumn('password_hash');

    // JTI-based refresh token tracking (one active refresh token per user)
    table.text('refresh_token_jti').nullable();
    table.timestamp('refresh_token_exp', { useTz: true }).nullable();

    // Revocation timestamp — set when user logs out or token is rotated out
    table.timestamp('revoked_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('user_auth', (table) => {
    // Remove the new columns
    table.dropColumn('refresh_token_jti');
    table.dropColumn('refresh_token_exp');
    table.dropColumn('revoked_at');

    // Restore the original columns (data will be NULL — original values are gone)
    table.text('password_hash').nullable();
    table.text('refresh_token').nullable();
  });
}
