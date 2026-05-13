import type { Database } from '../../../config/database.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentMethod {
  id: string;
  passenger_id: string;
  provider_method_id: string;
  last4: string | null;
  brand: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaymentMethodData {
  userId: string;
  providerMethodId: string;
  last4?: string;
  brand?: string;
  expMonth?: number;
  expYear?: number;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/**
 * PaymentMethodsRepository — persistence layer for passenger_payment_methods.
 *
 * R-PAY-003: Never stores raw card numbers — only provider method IDs (pm_xxxxx).
 * All reads exclude soft-deleted rows by default.
 */
export class PaymentMethodsRepository {
  constructor(private readonly db: Database) {}

  /**
   * Find all non-deleted payment methods for a given user.
   */
  async findByUserId(userId: string): Promise<PaymentMethod[]> {
    return this.db<PaymentMethod>('passenger_payment_methods')
      .where({ passenger_id: userId })
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc')
      .select('*');
  }

  /**
   * Insert a new payment method record.
   * Only stores the provider's opaque method ID — never raw card data.
   */
  async create(data: CreatePaymentMethodData): Promise<PaymentMethod> {
    const rows = await this.db<PaymentMethod>('passenger_payment_methods')
      .insert({
        passenger_id: data.userId,
        provider_method_id: data.providerMethodId,
        last4: data.last4 ?? null,
        brand: data.brand ?? null,
        exp_month: data.expMonth ?? null,
        exp_year: data.expYear ?? null,
        is_default: false,
      })
      .returning('*');

    const row = rows[0];
    if (!row) throw new Error('Failed to create payment method: no row returned');
    return row;
  }
}
