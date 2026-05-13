import { CompaniesService } from '../../modules/companies/companies.service.js';
import type { CompaniesRepository, Company } from '../../modules/companies/companies.repository.js';
import { BusinessError } from '../../shared/errors/business-error.js';

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'comp-1',
    vertical_id: 'vert-1',
    slug: 'empresa-test',
    name: 'Empresa Test SA',
    rfc: null,
    tax_id: null,
    contact_email: null,
    contact_phone: null,
    address: null,
    active: true,
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
}

function makeRepo(): jest.Mocked<CompaniesRepository> {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    getUsers: jest.fn(),
    addUser: jest.fn(),
    removeUser: jest.fn(),
  } as unknown as jest.Mocked<CompaniesRepository>;
}

describe('CompaniesService', () => {
  let repo: jest.Mocked<CompaniesRepository>;
  let service: CompaniesService;

  beforeEach(() => {
    repo = makeRepo();
    service = new CompaniesService(repo);
  });

  describe('create', () => {
    it('creates company correctly', async () => {
      const company = makeCompany();
      repo.create.mockResolvedValue(company);

      const result = await service.create({ name: 'Empresa Test SA', slug: 'empresa-test' });

      expect(repo.create).toHaveBeenCalledWith({ name: 'Empresa Test SA', slug: 'empresa-test' });
      expect(result).toEqual(company);
    });

    it('propagates COMPANY_SLUG_TAKEN from repository', async () => {
      repo.create.mockRejectedValue(new BusinessError('COMPANY_SLUG_TAKEN'));

      await expect(service.create({ name: 'Test', slug: 'empresa-test' })).rejects.toThrow(
        new BusinessError('COMPANY_SLUG_TAKEN'),
      );
    });
  });

  describe('update', () => {
    it('soft-deletes when active=false', async () => {
      const updated = makeCompany({ active: false, deleted_at: new Date() });
      repo.update.mockResolvedValue(updated);

      const result = await service.update('comp-1', { active: false });

      expect(repo.update).toHaveBeenCalledWith('comp-1', { active: false });
      expect(result.deleted_at).not.toBeNull();
    });
  });

  describe('addUser', () => {
    it('links user correctly', async () => {
      const cu = { id: 'cu-1', company_id: 'comp-1', user_id: 'user-1', role: 'member' as const, created_at: new Date(), updated_at: new Date() };
      repo.addUser.mockResolvedValue(cu);

      const result = await service.addUser('comp-1', 'user-1', 'member');

      expect(repo.addUser).toHaveBeenCalledWith('comp-1', 'user-1', 'member');
      expect(result.role).toBe('member');
    });

    it('propagates USER_ALREADY_IN_COMPANY', async () => {
      repo.addUser.mockRejectedValue(new BusinessError('USER_ALREADY_IN_COMPANY'));

      await expect(service.addUser('comp-1', 'user-1', 'member')).rejects.toThrow(
        new BusinessError('USER_ALREADY_IN_COMPANY'),
      );
    });
  });

  describe('removeUser', () => {
    it('unlinks user correctly', async () => {
      repo.removeUser.mockResolvedValue(undefined);

      await expect(service.removeUser('comp-1', 'user-1')).resolves.toBeUndefined();
      expect(repo.removeUser).toHaveBeenCalledWith('comp-1', 'user-1');
    });

    it('propagates COMPANY_USER_NOT_FOUND', async () => {
      repo.removeUser.mockRejectedValue(new BusinessError('COMPANY_USER_NOT_FOUND'));

      await expect(service.removeUser('comp-1', 'user-99')).rejects.toThrow(
        new BusinessError('COMPANY_USER_NOT_FOUND'),
      );
    });
  });
});
