/**
 * UsersService — unit tests
 *
 * All dependencies (UsersRepository, Database/Knex) are injected as mocks.
 * No real DB involved.
 */

import { UsersService } from '../../modules/users/users.service.js';
import type { UsersRepository, User } from '../../modules/users/users.repository.js';
import type { Database } from '../../config/database.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeUsersRepo(): jest.Mocked<UsersRepository> {
  return {
    findById: jest.fn(),
    findByPhone: jest.fn(),
    findByPhoneIncludingDeleted: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    getRoles: jest.fn(),
    addRole: jest.fn(),
  } as unknown as jest.Mocked<UsersRepository>;
}

// Minimal Knex chainable mock for audit_logs.insert
function makeDb(): jest.Mocked<Database> {
  const insertMock = jest.fn().mockResolvedValue(undefined);
  const dbFn = jest.fn().mockReturnValue({ insert: insertMock });
  return dbFn as unknown as jest.Mocked<Database>;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const baseUser: User = {
  id: 'user-uuid-001',
  region_id: 'region-mx-001',
  phone: '+525512345678',
  full_name: 'Ana García',
  status: 'active',
  phone_verified: true,
  deleted_at: null,
  created_at: new Date('2024-01-01T10:00:00Z'),
  updated_at: new Date('2024-01-01T10:00:00Z'),
};

// ---------------------------------------------------------------------------
// UsersService.getProfile
// ---------------------------------------------------------------------------

describe('UsersService.getProfile', () => {
  let repo: ReturnType<typeof makeUsersRepo>;
  let db: ReturnType<typeof makeDb>;
  let service: UsersService;

  beforeEach(() => {
    repo = makeUsersRepo();
    db = makeDb();
    service = new UsersService(repo, db);
  });

  it('returns a UserDTO for an existing user', async () => {
    repo.findById.mockResolvedValue(baseUser);

    const dto = await service.getProfile('user-uuid-001');

    expect(dto.id).toBe(baseUser.id);
    expect(dto.phone).toBe(baseUser.phone);
    expect(dto.full_name).toBe(baseUser.full_name);
    expect(dto.status).toBe('active');
    expect(dto.phone_verified).toBe(true);
    expect(typeof dto.created_at).toBe('string'); // ISO 8601
  });

  it('throws USER_NOT_FOUND for an unknown userId', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.getProfile('unknown-id')).rejects.toThrow(
      expect.objectContaining({ code: 'USER_NOT_FOUND' }),
    );
  });
});

// ---------------------------------------------------------------------------
// UsersService.updateProfile
// ---------------------------------------------------------------------------

describe('UsersService.updateProfile', () => {
  let repo: ReturnType<typeof makeUsersRepo>;
  let db: ReturnType<typeof makeDb>;
  let service: UsersService;

  beforeEach(() => {
    repo = makeUsersRepo();
    db = makeDb();
    service = new UsersService(repo, db);
  });

  it('updates full_name and returns the updated UserDTO', async () => {
    const updatedUser: User = { ...baseUser, full_name: 'Ana López' };
    repo.findById.mockResolvedValue(baseUser);
    repo.update.mockResolvedValue(updatedUser);

    const dto = await service.updateProfile('user-uuid-001', { fullName: 'Ana López' });

    expect(dto.full_name).toBe('Ana López');
    expect(repo.update).toHaveBeenCalledWith('user-uuid-001', { fullName: 'Ana López' });
  });

  it('writes to audit_logs on a successful update', async () => {
    repo.findById.mockResolvedValue(baseUser);
    repo.update.mockResolvedValue({ ...baseUser, full_name: 'Ana López' });

    await service.updateProfile('user-uuid-001', { fullName: 'Ana López' });

    // db('audit_logs') should have been called
    expect(db).toHaveBeenCalledWith('audit_logs');
  });

  it('throws USER_NOT_FOUND for an unknown userId', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      service.updateProfile('unknown-id', { fullName: 'Nuevo Nombre' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'USER_NOT_FOUND' }));
  });

  it('throws VALIDATION_ERROR for an empty full_name string', async () => {
    repo.findById.mockResolvedValue(baseUser);

    await expect(
      service.updateProfile('user-uuid-001', { fullName: '   ' }),
    ).rejects.toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('returns the current user DTO when no fields are provided', async () => {
    repo.findById.mockResolvedValue(baseUser);

    const dto = await service.updateProfile('user-uuid-001', {});

    expect(dto.full_name).toBe(baseUser.full_name);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
