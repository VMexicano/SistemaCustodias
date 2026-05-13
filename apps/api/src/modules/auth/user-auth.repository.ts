import type { Database } from '../../config/database.js';

export interface UserAuthRecord {
  id: string;
  user_id: string;
  provider: string | null;
  provider_id: string | null;
  last_login_at: Date | null;
  refresh_token_jti: string | null;
  refresh_token_exp: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * UserAuthRepository — persistence layer for user_auth table.
 *
 * One row per user (enforced by UNIQUE constraint on user_id).
 * JTI operations use ON CONFLICT (user_id) DO UPDATE to maintain
 * that invariant without external coordination.
 */
export class UserAuthRepository {
  constructor(private readonly db: Database) {}

  /**
   * Insert or update the refresh token JTI for a user.
   * Clears revoked_at on upsert (token is now active).
   */
  async upsertJti(userId: string, jti: string, exp: Date): Promise<void> {
    await this.db('user_auth')
      .insert({
        user_id: userId,
        refresh_token_jti: jti,
        refresh_token_exp: exp,
        revoked_at: null,
        last_login_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      })
      .onConflict('user_id')
      .merge({
        refresh_token_jti: jti,
        refresh_token_exp: exp,
        revoked_at: null,
        last_login_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  /**
   * Mark the user's current refresh token as revoked.
   * Used on logout or when a token rotation detects reuse.
   */
  async revokeJti(userId: string): Promise<void> {
    await this.db('user_auth')
      .where({ user_id: userId })
      .update({
        revoked_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });
  }

  /**
   * Fetch the user_auth record for a given user.
   * Returns null if no record exists yet.
   */
  async findByUserId(userId: string): Promise<UserAuthRecord | null> {
    const row = await this.db<UserAuthRecord>('user_auth')
      .where({ user_id: userId })
      .first();

    return row ?? null;
  }
}
