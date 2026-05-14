import { ClientsService } from '../../modules/clients/clients.service.js';
import type { ClientsRepository } from '../../modules/clients/clients.repository.js';
import type { Client } from '../../modules/clients/clients.types.js';

const makeClient = (overrides: Partial<Client> = {}): Client => ({
  id: 'client-uuid',
  user_id: 'user-uuid',
  company_id: 'company-uuid',
  company_name: 'ACME SA de CV',
  rfc: 'ACM010101ABC',
  contact_name: 'Juan Perez',
  credit_limit_mxn: '50000.00',
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  ...overrides,
});

const makeRepo = (overrides: Partial<ClientsRepository> = {}): ClientsRepository =>
  ({
    findByUserId: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(undefined),
    findByCompany: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    create: jest.fn().mockResolvedValue(makeClient()),
    update: jest.fn().mockResolvedValue(makeClient()),
    softDelete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ClientsRepository;

describe('ClientsService', () => {
  describe('create', () => {
    it('creates a client when no profile exists for the user', async () => {
      const repo = makeRepo();
      const service = new ClientsService(repo);

      const result = await service.create({
        userId: 'user-uuid',
        contactName: 'Juan Perez',
        companyName: 'ACME',
      });

      expect(repo.findByUserId).toHaveBeenCalledWith('user-uuid');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-uuid', contactName: 'Juan Perez' }),
      );
      expect(result.userId).toBe('user-uuid');
    });

    it('throws CLIENT_ALREADY_EXISTS when user already has a client profile', async () => {
      const repo = makeRepo({ findByUserId: jest.fn().mockResolvedValue(makeClient()) });
      const service = new ClientsService(repo);

      await expect(
        service.create({ userId: 'user-uuid', contactName: 'Juan Perez' }),
      ).rejects.toMatchObject({ code: 'CLIENT_ALREADY_EXISTS' });
    });
  });

  describe('getMe', () => {
    it('returns the client profile for the given user', async () => {
      const client = makeClient();
      const repo = makeRepo({ findByUserId: jest.fn().mockResolvedValue(client) });
      const service = new ClientsService(repo);

      const result = await service.getMe('user-uuid');

      expect(result.id).toBe('client-uuid');
      expect(result.contactName).toBe('Juan Perez');
      expect(result.creditLimitMxn).toBe(50000);
    });

    it('throws CLIENT_NOT_FOUND when user has no client profile', async () => {
      const repo = makeRepo();
      const service = new ClientsService(repo);

      await expect(service.getMe('unknown-user')).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
    });
  });

  describe('getById', () => {
    it('returns the client by id', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeClient()) });
      const service = new ClientsService(repo);

      const result = await service.getById('client-uuid');
      expect(result.id).toBe('client-uuid');
    });

    it('throws CLIENT_NOT_FOUND when id does not exist', async () => {
      const repo = makeRepo();
      const service = new ClientsService(repo);

      await expect(service.getById('no-exist')).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
    });
  });

  describe('list', () => {
    it('returns paginated clients for the tenant', async () => {
      const clients = [makeClient(), makeClient({ id: 'client-2', user_id: 'user-2' })];
      const repo = makeRepo({
        findByCompany: jest.fn().mockResolvedValue({ data: clients, total: 2 }),
      });
      const service = new ClientsService(repo);

      const result = await service.list('company-uuid', 0, 20);

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('updates a client when it exists', async () => {
      const updated = makeClient({ company_name: 'Nueva Empresa' });
      const repo = makeRepo({
        findById: jest.fn().mockResolvedValue(makeClient()),
        update: jest.fn().mockResolvedValue(updated),
      });
      const service = new ClientsService(repo);

      const result = await service.update('client-uuid', { companyName: 'Nueva Empresa' });

      expect(repo.update).toHaveBeenCalledWith('client-uuid', { companyName: 'Nueva Empresa', rfc: undefined, contactName: undefined, creditLimitMxn: undefined });
      expect(result.companyName).toBe('Nueva Empresa');
    });

    it('throws CLIENT_NOT_FOUND when updating non-existent client', async () => {
      const repo = makeRepo();
      const service = new ClientsService(repo);

      await expect(service.update('no-exist', { companyName: 'X' })).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
    });
  });

  describe('remove', () => {
    it('soft deletes a client that exists', async () => {
      const repo = makeRepo({ findById: jest.fn().mockResolvedValue(makeClient()) });
      const service = new ClientsService(repo);

      await service.remove('client-uuid');

      expect(repo.softDelete).toHaveBeenCalledWith('client-uuid');
    });

    it('throws CLIENT_NOT_FOUND when removing non-existent client', async () => {
      const repo = makeRepo();
      const service = new ClientsService(repo);

      await expect(service.remove('no-exist')).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });
    });
  });
});
