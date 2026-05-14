import type { Knex } from 'knex';
import type { Database } from '../../config/database.js';
import type { ValueDeclaration, CustodyType } from './value-declaration.types.js';

type Trx = Knex.Transaction;

export class ValueDeclarationRepository {
  constructor(private readonly db: Database) {}

  async findCustodyType(custodyTypeId: string, trx?: Trx): Promise<CustodyType | undefined> {
    return (trx ?? this.db)<CustodyType>('custody_types')
      .where({ id: custodyTypeId, active: true })
      .first();
  }

  async listActiveCustodyTypes(): Promise<CustodyType[]> {
    return this.db<CustodyType>('custody_types')
      .where({ active: true })
      .orderBy('name', 'asc');
  }

  async findByOrderId(orderId: string, trx?: Trx): Promise<ValueDeclaration | undefined> {
    return (trx ?? this.db)<ValueDeclaration>('value_declarations')
      .where({ order_id: orderId })
      .first();
  }

  async upsert(
    data: {
      orderId: string;
      custodyTypeId: string;
      declaredValue: Record<string, unknown>;
      insurancePolicyId?: string;
    },
    trx?: Trx,
  ): Promise<ValueDeclaration> {
    const qb = (trx ?? this.db)<ValueDeclaration>('value_declarations');

    const row = await qb
      .insert({
        order_id: data.orderId,
        custody_type_id: data.custodyTypeId,
        declared_value: data.declaredValue,
        insurance_policy_id: data.insurancePolicyId ?? null,
        updated_at: new Date(),
      })
      .onConflict('order_id')
      .merge(['declared_value', 'insurance_policy_id', 'updated_at'])
      .returning('*');

    return row[0]!;
  }
}
