import type { Database } from '../../config/database.js';
import type { Operator, OperatorType, OperatorStatus } from './operadores.types.js';

export interface CreateOperatorData {
  userId: string;
  operatorType: OperatorType;
  licenseNumber?: string;
  certifications?: Record<string, string>;
}

export interface OperatorWithName extends Operator {
  first_name?: string;
  last_name?: string;
}

export class OperadoresRepository {
  constructor(private readonly db: Database) {}

  async findByUserId(userId: string): Promise<Operator | undefined> {
    return this.db<Operator>('operators')
      .where({ user_id: userId })
      .whereNull('deleted_at')
      .first();
  }

  async findById(id: string): Promise<Operator | undefined> {
    return this.db<Operator>('operators')
      .where({ id })
      .whereNull('deleted_at')
      .first();
  }

  async findAvailable(tenantId: string, operatorType?: OperatorType): Promise<OperatorWithName[]> {
    const query = this.db<OperatorWithName>('operators')
      .join('company_users', 'operators.user_id', 'company_users.user_id')
      .join('users', 'operators.user_id', 'users.id')
      .where('company_users.company_id', tenantId)
      .where('operators.status', 'available')
      .whereNull('operators.deleted_at')
      .select('operators.*', 'users.first_name', 'users.last_name')
      .orderBy('operators.created_at', 'asc');

    if (operatorType) {
      void query.where('operators.operator_type', operatorType);
    }

    return query;
  }

  async findByTenant(
    tenantId: string,
    filters: { operator_type?: OperatorType; status?: OperatorStatus },
    page: number,
    limit: number,
  ): Promise<{ data: Operator[]; total: number }> {
    const base = () =>
      this.db<Operator>('operators')
        .join('company_users', 'operators.user_id', 'company_users.user_id')
        .where('company_users.company_id', tenantId)
        .whereNull('operators.deleted_at')
        .modify((q) => {
          if (filters.operator_type) q.where('operators.operator_type', filters.operator_type);
          if (filters.status) q.where('operators.status', filters.status);
        });

    const [data, countResult] = await Promise.all([
      base()
        .select('operators.*')
        .orderBy('operators.created_at', 'desc')
        .limit(limit)
        .offset(page * limit),
      base().count('operators.id as total').first(),
    ]);

    return { data, total: Number((countResult as { total: string | number } | undefined)?.total ?? 0) };
  }

  async create(data: CreateOperatorData): Promise<Operator> {
    const rows = await this.db<Operator>('operators')
      .insert({
        user_id: data.userId,
        operator_type: data.operatorType,
        license_number: data.licenseNumber ?? null,
        certifications: data.certifications ?? {},
        status: 'offline',
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to create operator: no row returned');
    return row;
  }

  async updateStatus(id: string, status: OperatorStatus): Promise<Operator> {
    const rows = await this.db<Operator>('operators')
      .where({ id })
      .whereNull('deleted_at')
      .update({ status, updated_at: this.db.fn.now() })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to update operator status: no row returned');
    return row;
  }

  async softDelete(id: string): Promise<void> {
    await this.db<Operator>('operators')
      .where({ id })
      .whereNull('deleted_at')
      .update({ deleted_at: new Date() });
  }
}
