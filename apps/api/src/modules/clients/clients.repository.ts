import type { Database } from '../../config/database.js';
import type { Client } from './clients.types.js';

export interface CreateClientData {
  userId: string;
  companyId?: string;
  companyName?: string;
  rfc?: string;
  contactName: string;
  creditLimitMxn?: number;
}

export interface UpdateClientData {
  companyName?: string;
  rfc?: string;
  contactName?: string;
  creditLimitMxn?: number;
}

export class ClientsRepository {
  constructor(private readonly db: Database) {}

  async findByUserId(userId: string): Promise<Client | undefined> {
    return this.db<Client>('clients')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first();
  }

  async findById(id: string): Promise<Client | undefined> {
    return this.db<Client>('clients')
      .where({ id })
      .whereNull('deleted_at')
      .first();
  }

  async findByCompany(
    companyId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Client[]; total: number }> {
    const [data, countResult] = await Promise.all([
      this.db<Client>('clients')
        .where({ company_id: companyId })
        .whereNull('deleted_at')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(page * limit),
      this.db<Client>('clients')
        .where({ company_id: companyId })
        .whereNull('deleted_at')
        .count('id as total')
        .first(),
    ]);

    return { data, total: Number((countResult as { total: string | number } | undefined)?.total ?? 0) };
  }

  async create(data: CreateClientData): Promise<Client> {
    const rows = await this.db<Client>('clients')
      .insert({
        user_id: data.userId,
        company_id: data.companyId ?? null,
        company_name: data.companyName ?? null,
        rfc: data.rfc ?? null,
        contact_name: data.contactName,
        credit_limit_mxn: String(data.creditLimitMxn ?? 0),
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to create client: no row returned');
    return row;
  }

  async update(id: string, data: UpdateClientData): Promise<Client> {
    const patch: Record<string, unknown> = { updated_at: this.db.fn.now() };

    if (data.companyName !== undefined) patch['company_name'] = data.companyName;
    if (data.rfc !== undefined) patch['rfc'] = data.rfc;
    if (data.contactName !== undefined) patch['contact_name'] = data.contactName;
    if (data.creditLimitMxn !== undefined) patch['credit_limit_mxn'] = data.creditLimitMxn;

    const rows = await this.db<Client>('clients')
      .where({ id })
      .whereNull('deleted_at')
      .update(patch)
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to update client: no row returned');
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await this.db<Client>('clients')
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });
  }
}
