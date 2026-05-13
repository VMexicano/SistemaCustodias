/**
 * AuthService — unit tests
 *
 * All dependencies are injected as jest mocks; no real DB or Redis involved.
 * Strategy: constructor injection — no jest.mock() with module paths.
 */

import { AuthService } from '../../modules/auth/auth.service.js';
import type { UsersRepository, User } from '../../modules/users/users.repository.js';
import type { UserAuthRepository, UserAuthRecord } from '../../modules/auth/user-auth.repository.js';
import type { OTPChannel } from '../../modules/auth/otp/otp-channel.interface.js';
import type { JWTService } from '../../modules/auth/jwt.service.js';
import type { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Helpers to create typed mocks via jest.fn()
// ---------------------------------------------------------------------------

function makeUsersRepo(): jest.Mocked<UsersRepository> {
  return {
    findByPhone: jest.fn(),
    findByPhoneIncludingDeleted: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    getRoles: jest.fn(),
    addRole: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
}

function makeUserAuthRepo(): jest.Mocked<UserAuthRepository> {
  return {
    upsertJti: jest.fn(),
    revokeJti: jest.fn(),
    findByUserId: jest.fn(),
  } as unknown as jest.Mocked<UserAuthRepository>;
}

function makeRedis(): jest.Mocked<Redis> {
  return {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
  } as unknown as jest.Mocked<Redis>;
}

function makeOtpChannel(): jest.Mocked<OTPChannel> {
  return { send: jest.fn() };
}

function makeJwtService(): jest.Mocked<JWTService> {
  return {
    signAccess: jest.fn(),
    signRefresh: jest.fn(),
    verify: jest.fn(),
  } as unknown as jest.Mocked<JWTService>;
}

// ---------------------------------------------------------------------------
// Fixture: a minimal active user
// ---------------------------------------------------------------------------

const activeUser: User = {
  id: 'user-uuid-001',
  region_id: 'region-mx-001',
  phone: '+525512345678',
  full_name: 'Juan Pérez',
  status: 'active',
  phone_verified: false,
  deleted_at: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('AuthService.register', () => {
  let usersRepo: ReturnType<typeof makeUsersRepo>;
  let userAuthRepo: ReturnType<typeof makeUserAuthRepo>;
  let redis: ReturnType<typeof makeRedis>;
  let otpChannel: ReturnType<typeof makeOtpChannel>;
  let jwtService: ReturnType<typeof makeJwtService>;
  let service: AuthService;

  beforeEach(() => {
    usersRepo = makeUsersRepo();
    userAuthRepo = makeUserAuthRepo();
    redis = makeRedis();
    otpChannel = makeOtpChannel();
    jwtService = makeJwtService();
    service = new AuthService(usersRepo, redis, otpChannel, jwtService, userAuthRepo);
  });

  it('creates a user and sends OTP when phone is new', async () => {
    usersRepo.findByPhoneIncludingDeleted.mockResolvedValue(null);
    usersRepo.create.mockResolvedValue(activeUser);
    usersRepo.addRole.mockResolvedValue(undefined);
    redis.set.mockResolvedValue('OK');
    otpChannel.send.mockResolvedValue(undefined);

    const result = await service.register('+525512345678', 'Juan Pérez');

    expect(usersRepo.create).toHaveBeenCalledWith({
      phone: '+525512345678',
      fullName: 'Juan Pérez',
    });
    expect(otpChannel.send).toHaveBeenCalledWith(
      '+525512345678',
      expect.stringMatching(/^\d{6}$/),
    );
    expect(result).toEqual({ expiresIn: 600 });
  });

  it('throws PHONE_ALREADY_REGISTERED when phone exists and is active', async () => {
    usersRepo.findByPhoneIncludingDeleted.mockResolvedValue({
      ...activeUser,
      status: 'active',
      deleted_at: null,
    });

    await expect(service.register('+525512345678', 'Juan')).rejects.toThrow(
      expect.objectContaining({ code: 'PHONE_ALREADY_REGISTERED' }),
    );
    expect(usersRepo.create).not.toHaveBeenCalled();
  });

  it('throws PHONE_BANNED when user status is banned', async () => {
    usersRepo.findByPhoneIncludingDeleted.mockResolvedValue({
      ...activeUser,
      status: 'banned',
      deleted_at: null,
    });

    await expect(service.register('+525512345678', 'Juan')).rejects.toThrow(
      expect.objectContaining({ code: 'PHONE_BANNED' }),
    );
    expect(usersRepo.create).not.toHaveBeenCalled();
  });

  it('stores OTP in Redis with 600s TTL', async () => {
    usersRepo.findByPhoneIncludingDeleted.mockResolvedValue(null);
    usersRepo.create.mockResolvedValue(activeUser);
    usersRepo.addRole.mockResolvedValue(undefined);
    redis.set.mockResolvedValue('OK');
    otpChannel.send.mockResolvedValue(undefined);

    await service.register('+525512345678', 'Juan Pérez');

    expect(redis.set).toHaveBeenCalledWith(
      'otp:+525512345678',
      expect.stringMatching(/^\d{6}$/),
      'EX',
      600,
    );
  });
});

// ---------------------------------------------------------------------------

describe('AuthService.verifyPhone', () => {
  let usersRepo: ReturnType<typeof makeUsersRepo>;
  let userAuthRepo: ReturnType<typeof makeUserAuthRepo>;
  let redis: ReturnType<typeof makeRedis>;
  let otpChannel: ReturnType<typeof makeOtpChannel>;
  let jwtService: ReturnType<typeof makeJwtService>;
  let service: AuthService;

  beforeEach(() => {
    usersRepo = makeUsersRepo();
    userAuthRepo = makeUserAuthRepo();
    redis = makeRedis();
    otpChannel = makeOtpChannel();
    jwtService = makeJwtService();
    service = new AuthService(usersRepo, redis, otpChannel, jwtService, userAuthRepo);

    // Common happy-path defaults
    usersRepo.findByPhone.mockResolvedValue(activeUser);
    redis.get.mockResolvedValue('654321');
    redis.del.mockResolvedValue(1);
    usersRepo.update.mockResolvedValue({ ...activeUser, phone_verified: true });
    usersRepo.getRoles.mockResolvedValue(['passenger']);
    jwtService.signAccess.mockReturnValue('access-token-mock');
    jwtService.signRefresh.mockReturnValue({ token: 'refresh-token-mock', jti: 'jti-uuid' });
    userAuthRepo.upsertJti.mockResolvedValue(undefined);
  });

  it('returns tokens and UserDTO when OTP is valid', async () => {
    const result = await service.verifyPhone('+525512345678', '654321');

    expect(result.accessToken).toBe('access-token-mock');
    expect(result.refreshToken).toBe('refresh-token-mock');
    expect(result.user.id).toBe(activeUser.id);
    expect(result.user.phoneVerified).toBe(true);
  });

  it('throws OTP_INVALID when OTP does not match', async () => {
    redis.get.mockResolvedValue('654321'); // stored OTP

    await expect(service.verifyPhone('+525512345678', '000000')).rejects.toThrow(
      expect.objectContaining({ code: 'OTP_INVALID' }),
    );
  });

  it('throws OTP_EXPIRED when OTP is not in Redis (null)', async () => {
    redis.get.mockResolvedValue(null);

    await expect(service.verifyPhone('+525512345678', '654321')).rejects.toThrow(
      expect.objectContaining({ code: 'OTP_EXPIRED' }),
    );
  });

  it('sets phone_verified = true on successful verification', async () => {
    await service.verifyPhone('+525512345678', '654321');

    expect(usersRepo.update).toHaveBeenCalledWith(
      activeUser.id,
      expect.objectContaining({ phoneVerified: true }),
    );
  });

  it('stores refresh_token_jti in user_auth', async () => {
    await service.verifyPhone('+525512345678', '654321');

    expect(userAuthRepo.upsertJti).toHaveBeenCalledWith(
      activeUser.id,
      'jti-uuid',
      expect.any(Date),
    );
  });
});

// ---------------------------------------------------------------------------

describe('AuthService.login', () => {
  let usersRepo: ReturnType<typeof makeUsersRepo>;
  let userAuthRepo: ReturnType<typeof makeUserAuthRepo>;
  let redis: ReturnType<typeof makeRedis>;
  let otpChannel: ReturnType<typeof makeOtpChannel>;
  let jwtService: ReturnType<typeof makeJwtService>;
  let service: AuthService;

  beforeEach(() => {
    usersRepo = makeUsersRepo();
    userAuthRepo = makeUserAuthRepo();
    redis = makeRedis();
    otpChannel = makeOtpChannel();
    jwtService = makeJwtService();
    service = new AuthService(usersRepo, redis, otpChannel, jwtService, userAuthRepo);
  });

  it('sends OTP when user exists and is active', async () => {
    usersRepo.findByPhone.mockResolvedValue(activeUser);
    redis.set.mockResolvedValue('OK');
    otpChannel.send.mockResolvedValue(undefined);

    const result = await service.login('+525512345678');

    expect(otpChannel.send).toHaveBeenCalledWith(
      '+525512345678',
      expect.stringMatching(/^\d{6}$/),
    );
    expect(result).toEqual({ expiresIn: 600 });
  });

  it('throws USER_NOT_FOUND when phone not registered', async () => {
    usersRepo.findByPhone.mockResolvedValue(null);

    await expect(service.login('+525500000000')).rejects.toThrow(
      expect.objectContaining({ code: 'USER_NOT_FOUND' }),
    );
  });

  it('throws USER_SUSPENDED when user is suspended', async () => {
    usersRepo.findByPhone.mockResolvedValue({ ...activeUser, status: 'suspended' });

    await expect(service.login('+525512345678')).rejects.toThrow(
      expect.objectContaining({ code: 'USER_SUSPENDED' }),
    );
  });
});

// ---------------------------------------------------------------------------

describe('AuthService.refresh', () => {
  const OLD_JTI = 'old-jti-uuid-111';
  const NEW_JTI = 'new-jti-uuid-222';

  const userAuthRecord: UserAuthRecord = {
    id: 'ua-001',
    user_id: activeUser.id,
    provider: null,
    provider_id: null,
    last_login_at: null,
    refresh_token_jti: OLD_JTI,
    refresh_token_exp: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    revoked_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  let usersRepo: ReturnType<typeof makeUsersRepo>;
  let userAuthRepo: ReturnType<typeof makeUserAuthRepo>;
  let redis: ReturnType<typeof makeRedis>;
  let otpChannel: ReturnType<typeof makeOtpChannel>;
  let jwtService: ReturnType<typeof makeJwtService>;
  let service: AuthService;

  beforeEach(() => {
    usersRepo = makeUsersRepo();
    userAuthRepo = makeUserAuthRepo();
    redis = makeRedis();
    otpChannel = makeOtpChannel();
    jwtService = makeJwtService();
    service = new AuthService(usersRepo, redis, otpChannel, jwtService, userAuthRepo);

    // Common happy-path defaults
    jwtService.verify.mockReturnValue({
      sub: activeUser.id,
      jti: OLD_JTI,
      roles: ['passenger'],
      region: 'MX',
    });
    redis.exists.mockResolvedValue(0); // not blacklisted
    userAuthRepo.findByUserId.mockResolvedValue(userAuthRecord);
    usersRepo.findById.mockResolvedValue(activeUser);
    usersRepo.getRoles.mockResolvedValue(['passenger']);
    jwtService.signAccess.mockReturnValue('new-access-token');
    jwtService.signRefresh.mockReturnValue({ token: 'new-refresh-token', jti: NEW_JTI });
    userAuthRepo.upsertJti.mockResolvedValue(undefined);
    redis.set.mockResolvedValue('OK');
  });

  it('returns new tokens when refresh token is valid', async () => {
    const result = await service.refresh('old-refresh-token');

    expect(result.accessToken).toBe('new-access-token');
    expect(result.refreshToken).toBe('new-refresh-token');
  });

  it('throws TOKEN_INVALID when jti is in Redis blacklist', async () => {
    redis.exists.mockResolvedValue(1); // blacklisted

    await expect(service.refresh('old-refresh-token')).rejects.toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }),
    );
  });

  it('throws TOKEN_INVALID when jti not found in user_auth (record is null)', async () => {
    userAuthRepo.findByUserId.mockResolvedValue(null);

    await expect(service.refresh('old-refresh-token')).rejects.toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }),
    );
  });

  it('throws TOKEN_INVALID when user_auth has revoked_at set', async () => {
    userAuthRepo.findByUserId.mockResolvedValue({
      ...userAuthRecord,
      revoked_at: new Date(),
    });

    await expect(service.refresh('old-refresh-token')).rejects.toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }),
    );
  });

  it('throws TOKEN_INVALID when stored jti does not match token jti', async () => {
    userAuthRepo.findByUserId.mockResolvedValue({
      ...userAuthRecord,
      refresh_token_jti: 'a-completely-different-jti',
    });

    await expect(service.refresh('old-refresh-token')).rejects.toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }),
    );
  });

  it('invalidates old jti in Redis after successful rotation', async () => {
    await service.refresh('old-refresh-token');

    expect(redis.set).toHaveBeenCalledWith(
      `blacklist:token:${OLD_JTI}`,
      '1',
      'EX',
      expect.any(Number),
    );
  });

  it('updates user_auth with new jti after successful rotation', async () => {
    await service.refresh('old-refresh-token');

    expect(userAuthRepo.upsertJti).toHaveBeenCalledWith(
      activeUser.id,
      NEW_JTI,
      expect.any(Date),
    );
  });
});
