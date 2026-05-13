import type { Knex } from 'knex';
import { BusinessError } from '../../shared/errors/business-error.js';

export interface Company {
  id: string;
  vertical_id: string | null;
  slug: string;
  name: string;
  rfc: string | null;
  tax_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  active: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface CompanyUser {
  id: string;
  company_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: Date;
  updated_at: Date;
}

export interface CreateCompanyInput {
  name: string;
  slug: string;
  vertical_id?: string;
  rfc?: string;
  tax_id?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  metadata?: Record<string, unknown>;
}

export interface ListCompaniesFilters {
  page: number;
  limit: number;
  vertical_id?: string;
  active?: boolean;
}

export class CompaniesRepository {
  constructor(private readonly db: Knex) {}

  async create(input: CreateCompanyInput): Promise<Company> {
    const existing = await this.db('companies').where({ slug: input.slug }).whereNull('deleted_at').first();
    if (existing) throw new BusinessError('COMPANY_SLUG_TAKEN', `Slug '${input.slug}' already in use`);

    const rows = await this.db('companies')
      .insert({
        ...input,
        metadata: JSON.stringify(input.metadata ?? {}),
      })
      .returning('*');
    return rows[0] as Company;
  }

  async findAll(filters: ListCompaniesFilters): Promise<{ data: Company[]; total: number }> {
    const query = this.db('companies').whereNull('deleted_at');
    if (filters.vertical_id) query.where({ vertical_id: filters.vertical_id });
    if (filters.active !== undefined) query.where({ active: filters.active });

    const countResult = await query.clone().count<{ count: string }[]>('id as count');
    const data = await query
      .orderBy('created_at', 'desc')
      .limit(filters.limit)
      .offset((filters.page - 1) * filters.limit) as Company[];

    const count = countResult[0]?.count ?? '0';
    return { data, total: parseInt(count, 10) };
  }

  async findById(id: string): Promise<Company & { users_count: number }> {
    const company = await this.db('companies').where({ id }).whereNull('deleted_at').first();
    if (!company) throw new BusinessError('COMPANY_NOT_FOUND', `Company '${id}' not found`);

    const usersCount = await this.db('company_users')
      .where({ company_id: id })
      .count<{ count: string }[]>('id as count');
    const count = usersCount[0]?.count ?? '0';

    return { ...(company as Company), users_count: parseInt(count as string, 10) };
  }

  async update(id: string, patch: Partial<Omit<Company, 'id' | 'created_at'>>): Promise<Company> {
    if (patch.deleted_at === undefined && patch.active === false) {
      patch.deleted_at = new Date();
    }
    const rows = await this.db('companies')
      .where({ id })
      .whereNull('deleted_at')
      .update({ ...patch, updated_at: this.db.fn.now() })
      .returning('*');
    if (!rows.length) throw new BusinessError('COMPANY_NOT_FOUND', `Company '${id}' not found`);
    return rows[0] as Company;
  }

  async getUsers(companyId: string): Promise<Array<{ user_id: string; full_name: string; phone: string; role: string; created_at: Date }>> {
    return this.db('company_users')
      .join('users', 'company_users.user_id', 'users.id')
      .where('company_users.company_id', companyId)
      .select(
        'company_users.user_id',
        'users.full_name',
        'users.phone',
        'company_users.role',
        'company_users.created_at',
      );
  }

  async addUser(companyId: string, userId: string, role: 'owner' | 'admin' | 'member'): Promise<CompanyUser> {
    const userExists = await this.db('users').where({ id: userId }).first();
    if (!userExists) throw new BusinessError('USER_NOT_FOUND', `User '${userId}' not found`);

    const existing = await this.db('company_users').where({ company_id: companyId, user_id: userId }).first();
    if (existing) throw new BusinessError('USER_ALREADY_IN_COMPANY', 'User already belongs to this company');

    const rows = await this.db('company_users')
      .insert({ company_id: companyId, user_id: userId, role })
      .returning('*');
    return rows[0] as CompanyUser;
  }

  async removeUser(companyId: string, userId: string): Promise<void> {
    const deleted = await this.db('company_users')
      .where({ company_id: companyId, user_id: userId })
      .delete();
    if (!deleted) throw new BusinessError('COMPANY_USER_NOT_FOUND', 'User not found in this company');
  }
}
