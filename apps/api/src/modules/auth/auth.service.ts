import type { Redis } from 'ioredis';
import type { OTPChannel } from './otp/otp-channel.interface.js';
import type { JWTService } from './jwt.service.js';
import type { UserAuthRepository } from './user-auth.repository.js';
import type { UsersRepository, User } from '../users/users.repository.js';
import { BusinessError } from '../../shared/errors/business-error.js';

export interface AuthTokensDTO {
  accessToken: string;
  refreshToken: string;
  roles: string[];
  user: UserDTO;
}

export interface UserDTO {
  id: string;
  phone: string;
  fullName: string;
  status: string;
  phoneVerified: boolean;
}

function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    phone: user.phone,
    fullName: user.full_name,
    status: user.status,
    phoneVerified: user.phone_verified,
  };
}

/**
 * AuthService — pure business logic for authentication flows.
 *
 * All dependencies are injected via constructor; no module-level imports
 * of db, redis, or env. This makes the class trivially testable.
 */
export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly redis: Redis,
    private readonly otpChannel: OTPChannel,
    private readonly jwtService: JWTService,
    private readonly userAuthRepo: UserAuthRepository,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private generateOtp(): string {
    // In TEST_MODE use a fixed OTP so E2E tests can authenticate deterministically
    if (process.env['TEST_MODE'] === 'true') return '123456';
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async sendAndStoreOtp(phone: string): Promise<void> {
    const otp = this.generateOtp();
    await this.redis.set(`otp:${phone}`, otp, 'EX', 600);
    await this.otpChannel.send(phone, otp);
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  /**
   * Register a new user with phone + full name.
   * Sends an OTP for phone verification.
   */
  async register(phone: string, fullName: string): Promise<{ expiresIn: number }> {
    const existing = await this.usersRepo.findByPhoneIncludingDeleted(phone);

    if (existing) {
      // Soft-deleted accounts can re-register; other states block them.
      if (existing.deleted_at === null) {
        if (existing.status === 'banned') {
          throw new BusinessError('PHONE_BANNED');
        }
        throw new BusinessError('PHONE_ALREADY_REGISTERED');
      }
    }

    const user = await this.usersRepo.create({ phone, fullName });
    await this.usersRepo.addRole(user.id, 'passenger');

    await this.sendAndStoreOtp(phone);

    return { expiresIn: 600 };
  }

  /**
   * Verify a phone OTP and return a pair of JWT tokens.
   */
  async verifyPhone(phone: string, otp: string): Promise<AuthTokensDTO> {
    const user = await this.usersRepo.findByPhone(phone);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND');
    }

    const isBypass =
      process.env['TEST_OTP_BYPASS'] === 'true' &&
      otp === process.env['TEST_OTP_CODE'];

    if (!isBypass) {
      const storedOtp = await this.redis.get(`otp:${phone}`);
      if (storedOtp === null) {
        throw new BusinessError('OTP_EXPIRED');
      }
      if (storedOtp !== otp) {
        throw new BusinessError('OTP_INVALID');
      }
      await this.redis.del(`otp:${phone}`);
    }
    await this.usersRepo.update(user.id, { phoneVerified: true });

    const roles = await this.usersRepo.getRoles(user.id);

    const accessToken = this.jwtService.signAccess({ sub: user.id, roles, region: 'MX' });
    const { token: refreshToken, jti } = this.jwtService.signRefresh({
      sub: user.id,
      roles,
      region: 'MX',
    });

    const exp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.userAuthRepo.upsertJti(user.id, jti, exp);

    // Return the updated user state (phone_verified = true)
    const updatedUser: User = { ...user, phone_verified: true };

    return {
      accessToken,
      refreshToken,
      roles,
      user: toUserDTO(updatedUser),
    };
  }

  /**
   * Initiate login by sending an OTP to the registered phone.
   */
  async login(phone: string): Promise<{ expiresIn: number }> {
    const user = await this.usersRepo.findByPhone(phone);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND');
    }
    if (user.status === 'suspended') {
      throw new BusinessError('USER_SUSPENDED');
    }

    await this.sendAndStoreOtp(phone);

    return { expiresIn: 600 };
  }

  /**
   * Rotate a refresh token.
   * Invalidates the old JTI via Redis blacklist and issues new tokens.
   */
  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.jwtService.verify(refreshToken, 'refresh');
    const { sub, jti: oldJti } = payload;

    if (!oldJti) {
      throw new BusinessError('TOKEN_INVALID');
    }

    // Fast path: Redis blacklist check
    const blacklisted = await this.redis.exists(`blacklist:token:${oldJti}`);
    if (blacklisted === 1) {
      throw new BusinessError('TOKEN_INVALID');
    }

    // PostgreSQL fallback: verify JTI still active in DB
    const record = await this.userAuthRepo.findByUserId(sub);
    if (
      !record ||
      record.revoked_at !== null ||
      record.refresh_token_jti !== oldJti
    ) {
      throw new BusinessError('TOKEN_INVALID');
    }

    const user = await this.usersRepo.findById(sub);
    if (!user) {
      throw new BusinessError('USER_NOT_FOUND');
    }

    const roles = await this.usersRepo.getRoles(user.id);

    const newAccessToken = this.jwtService.signAccess({
      sub: user.id,
      roles,
      region: 'MX',
    });
    const { token: newRefreshToken, jti: newJti } = this.jwtService.signRefresh({
      sub: user.id,
      roles,
      region: 'MX',
    });

    const newExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.userAuthRepo.upsertJti(user.id, newJti, newExp);

    // Blacklist the old JTI for its remaining lifetime
    if (record.refresh_token_exp) {
      const ttlResidual = Math.floor(
        (record.refresh_token_exp.getTime() - Date.now()) / 1000,
      );
      if (ttlResidual > 0) {
        await this.redis.set(`blacklist:token:${oldJti}`, '1', 'EX', ttlResidual);
      }
    }

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}
