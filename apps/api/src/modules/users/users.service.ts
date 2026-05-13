import { BusinessError } from '../../shared/errors/business-error.js';
import type { UsersRepository } from './users.repository.js';
import type { Database } from '../../config/database.js';

export interface UserDTO {
  id: string;
  phone: string;
  full_name: string;
  status: 'active' | 'suspended' | 'banned';
  phone_verified: boolean;
  created_at: string; // ISO 8601
}

function toUserDTO(user: {
  id: string;
  phone: string;
  full_name: string;
  status: 'active' | 'suspended' | 'banned';
  phone_verified: boolean;
  created_at: Date;
}): UserDTO {
  return {
    id: user.id,
    phone: user.phone,
    full_name: user.full_name,
    status: user.status,
    phone_verified: user.phone_verified,
    created_at: user.created_at.toISOString(),
  };
}

export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly db: Database,
  ) {}

  /**
   * Return the profile for an active user.
   * Throws USER_NOT_FOUND (404) if the user does not exist or is soft-deleted.
   */
  async getProfile(userId: string): Promise<UserDTO> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND', 'User not found');
    }
    return toUserDTO(user);
  }

  /**
   * Update the profile fields that the user is allowed to change.
   * Currently only `fullName` is mutable via this endpoint.
   * Records every change in audit_logs (R-DATA-002).
   */
  async updateProfile(
    userId: string,
    data: { fullName?: string },
  ): Promise<UserDTO> {
    const existing = await this.usersRepo.findById(userId);
    if (!existing) {
      throw new BusinessError('USER_NOT_FOUND', 'User not found');
    }

    // Guard: reject empty fullName strings (the JSON schema enforces minLength:2,
    // but we add a service-layer check for belt-and-suspenders safety).
    if (data.fullName !== undefined && data.fullName.trim().length === 0) {
      throw new BusinessError('VALIDATION_ERROR', 'full_name must not be blank');
    }

    // Only call update when there is at least one field to change.
    if (data.fullName === undefined) {
      return toUserDTO(existing);
    }

    const updated = await this.usersRepo.update(userId, {
      fullName: data.fullName,
    });

    // R-DATA-002: audit every PATCH change.
    await this.db('audit_logs').insert({
      entity_type: 'user',
      entity_id: userId,
      action: 'update',
      actor_type: 'user',
      actor_id: userId,
      new_value: JSON.stringify({ full_name: data.fullName }),
    });

    return toUserDTO(updated);
  }

  // --------------------------------------------------------------------------
  // POST /users/me/device-token (Sprint 7 — FCM push notifications)
  // --------------------------------------------------------------------------

  async registerDeviceToken(
    userId: string,
    token: string,
    platform: 'ios' | 'android',
  ): Promise<void> {
    await this.db('device_tokens')
      .insert({ user_id: userId, token, platform })
      .onConflict('token')
      .merge({ updated_at: new Date() });
  }
}
