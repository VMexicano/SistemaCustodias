import type { Database } from '../../config/database.js';

export interface User {
  id: string;
  region_id: string;
  phone: string;
  full_name: string;
  status: 'active' | 'suspended' | 'banned';
  phone_verified: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * UsersRepository — persistence layer for users table.
 *
 * All reads exclude soft-deleted rows by default unless explicitly needed.
 */
export class UsersRepository {
  constructor(private readonly db: Database) {}

  /**
   * Find an active (not soft-deleted) user by phone number.
   * Returns null if no record exists or the record is soft-deleted.
   */
  async findByPhone(phone: string): Promise<User | null> {
    const row = await this.db<User>('users')
      .where({ phone })
      .whereNull('deleted_at')
      .first();

    return row ?? null;
  }

  /**
   * Find any user by phone regardless of soft-delete status.
   * Used during registration to detect banned/deleted accounts.
   */
  async findByPhoneIncludingDeleted(phone: string): Promise<User | null> {
    const row = await this.db<User>('users').where({ phone }).first();
    return row ?? null;
  }

  /**
   * Find an active user by their UUID.
   */
  async findById(id: string): Promise<User | null> {
    const row = await this.db<User>('users')
      .where({ id })
      .whereNull('deleted_at')
      .first();

    return row ?? null;
  }

  /**
   * Insert a new user row with status='active' and phone_verified=false.
   * region_id defaults to the MX region (MVP: Mexico-only platform).
   * Returns the created user record.
   */
  async create(data: { phone: string; fullName: string; regionId?: string }): Promise<User> {
    let regionId = data.regionId;
    if (!regionId) {
      const region = await this.db<{ id: string }>('region_config')
        .where({ country_code: 'MX' })
        .select('id')
        .first();
      if (!region) throw new Error('Default MX region not found in region_config');
      regionId = region.id;
    }

    const rows = await this.db<User>('users')
      .insert({
        phone: data.phone,
        full_name: data.fullName,
        status: 'active',
        phone_verified: false,
        region_id: regionId,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to create user: no row returned');
    return row;
  }

  /**
   * Partial update for a user. Only provided fields are updated.
   */
  async update(
    id: string,
    data: Partial<{
      fullName: string;
      phoneVerified: boolean;
      status: string;
    }>,
  ): Promise<User> {
    const patch: Record<string, unknown> = { updated_at: this.db.fn.now() };

    if (data.fullName !== undefined) patch['full_name'] = data.fullName;
    if (data.phoneVerified !== undefined) patch['phone_verified'] = data.phoneVerified;
    if (data.status !== undefined) patch['status'] = data.status;

    const rows = await this.db<User>('users')
      .where({ id })
      .whereNull('deleted_at')
      .update(patch)
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to update user: no row returned');
    return row;
  }

  /**
   * Fetch all role names for a user from user_roles table.
   */
  async getRoles(userId: string): Promise<string[]> {
    const rows = await this.db<{ role: string }>('user_roles')
      .where({ user_id: userId })
      .select('role');

    return rows.map((r) => r.role);
  }

  /**
   * Insert a role for a user into user_roles.
   * Silently ignores conflicts (idempotent).
   */
  async addRole(userId: string, role: string): Promise<void> {
    await this.db('user_roles')
      .insert({ user_id: userId, role })
      .onConflict(['user_id', 'role'])
      .ignore();
  }
}
