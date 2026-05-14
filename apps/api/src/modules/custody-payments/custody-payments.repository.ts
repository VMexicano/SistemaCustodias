// ---------------------------------------------------------------------------
// custody-payments.repository.ts — data access for custody_payments table
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import type { CustodyPayment, CustodyPaymentStatus } from './custody-payments.types.js';

export class CustodyPaymentsRepository {
  constructor(private readonly db: Knex) {}

  async findByOrderId(orderId: string): Promise<CustodyPayment | undefined> {
    const row = await this.db('custody_payments')
      .where({ order_id: orderId })
      .first();
    return row as CustodyPayment | undefined;
  }

  async create(data: {
    orderId: string;
    amountMxn: number;
    status: CustodyPaymentStatus;
  }): Promise<CustodyPayment> {
    const [row] = await this.db('custody_payments')
      .insert({
        order_id: data.orderId,
        amount_mxn: data.amountMxn,
        status: data.status,
      })
      .returning('*');
    return row as CustodyPayment;
  }

  async updateStatus(
    orderId: string,
    status: CustodyPaymentStatus,
    extra?: {
      stripePaymentIntentId?: string;
      paidAt?: Date;
      failedReason?: string;
    },
  ): Promise<CustodyPayment> {
    const [row] = await this.db('custody_payments')
      .where({ order_id: orderId })
      .update({
        status,
        updated_at: new Date(),
        ...(extra?.stripePaymentIntentId
          ? { stripe_payment_intent_id: extra.stripePaymentIntentId }
          : {}),
        ...(extra?.paidAt ? { paid_at: extra.paidAt.toISOString() } : {}),
        ...(extra?.failedReason ? { failed_reason: extra.failedReason } : {}),
      })
      .returning('*');
    return row as CustodyPayment;
  }
}
