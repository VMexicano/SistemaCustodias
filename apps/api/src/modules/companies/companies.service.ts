import type { CompaniesRepository, Company, CreateCompanyInput, ListCompaniesFilters } from './companies.repository.js';

export class CompaniesService {
  constructor(private readonly companiesRepo: CompaniesRepository) {}

  async create(input: CreateCompanyInput): Promise<Company> {
    return this.companiesRepo.create(input);
  }

  async getAll(filters: ListCompaniesFilters): Promise<{ data: Company[]; total: number; page: number; limit: number }> {
    const result = await this.companiesRepo.findAll(filters);
    return { ...result, page: filters.page, limit: filters.limit };
  }

  async getById(id: string): Promise<Company & { users_count: number }> {
    return this.companiesRepo.findById(id);
  }

  async update(id: string, patch: Partial<Omit<Company, 'id' | 'created_at'>>): Promise<Company> {
    return this.companiesRepo.update(id, patch);
  }

  async getUsers(companyId: string) {
    return this.companiesRepo.getUsers(companyId);
  }

  async addUser(companyId: string, userId: string, role: 'owner' | 'admin' | 'member') {
    return this.companiesRepo.addUser(companyId, userId, role);
  }

  async removeUser(companyId: string, userId: string): Promise<void> {
    return this.companiesRepo.removeUser(companyId, userId);
  }
}
