// ---------------------------------------------------------------------------
// custody-payments.service.ts — process Stripe charge for completed orders
// ---------------------------------------------------------------------------

import type { Knex } from 'knex';
import { BusinessError } from '../../shared/errors/business-error.js';
import type { IPaymentGateway } from '../payments/payment.gateway.interface.js';
import type { CustodyPaymentsRepository } from './custody-payments.repository.js';
import type { CustodyPayment } from './custody-payments.types.js';

export class CustodyPaymentService {
  constructor(
    private readonly repo: CustodyPaymentsRepository,
    private readonly paymentGateway: IPaymentGateway,
    private readonly db: Knex,
  ) {}

  // ---------------------------------------------------------------------------
  // getByOrderId
  // ---------------------------------------------------------------------------

  async getByOrderId(orderId: string): Promise<CustodyPayment> {
    const payment = await this.repo.findByOrderId(orderId);
    if (!payment) {
      throw new BusinessError('PAYMENT_NOT_FOUND');
    }
    return payment;
  }

  // ---------------------------------------------------------------------------
  // processPayment — called by the BullMQ worker on COMPLETED transition
  // ---------------------------------------------------------------------------

  async processPayment(orderId: string): Promise<CustodyPayment> {
    const order = await this.db('custody_orders')
      .where({ id: orderId })
      .first() as {
        id: string;
        status: string;
        client_id: string;
        pricing_snapshot: { total_mxn?: number } | null;
      } | undefined;

    if (!order) {
      throw new BusinessError('ORDER_NOT_FOUND');
    }
    if (order.status !== 'COMPLETED') {
      throw new BusinessError('INVALID_ORDER_STATUS_FOR_PAYMENT');
    }

    // Idempotency: return existing completed payment if already processed
    const existing = await this.repo.findByOrderId(orderId);
    if (existing?.status === 'completed') {
      return existing;
    }

    const totalMxn = order.pricing_snapshot?.total_mxn;
    if (!totalMxn || totalMxn <= 0) {
      const failed = existing
        ? await this.repo.updateStatus(orderId, 'failed', { failedReason: 'pricing_snapshot_missing' })
        : await this.repo.create({ orderId, amountMxn: 0, status: 'failed' });
      return failed;
    }

    // Resolve client user_id
    const client = await this.db('clients')
      .where({ id: order.client_id })
      .select('user_id')
      .first() as { user_id: string } | undefined;

    if (!client) {
      const noClient = existing
        ? await this.repo.updateStatus(orderId, 'failed', { failedReason: 'client_not_found' })
        : await this.repo.create({ orderId, amountMxn: totalMxn, status: 'failed' });
      return noClient;
    }

    // Resolve default payment method
    const paymentMethod = await this.db('passenger_payment_methods')
      .where({ passenger_id: client.user_id })
      .whereNull('deleted_at')
      .orderBy('is_default', 'desc')
      .orderBy('created_at', 'asc')
      .select('provider_method_id')
      .first() as { provider_method_id: string } | undefined;

    if (!paymentMethod) {
      const noPm = existing
        ? await this.repo.updateStatus(orderId, 'failed', { failedReason: 'no_payment_method_on_file' })
        : await this.repo.create({ orderId, amountMxn: totalMxn, status: 'failed' });
      return noPm;
    }

    // Create/set to processing
    const payment = existing
      ? await this.repo.updateStatus(orderId, 'processing')
      : await this.repo.create({ orderId, amountMxn: totalMxn, status: 'processing' });

    // Charge via Stripe
    try {
      const amountCents = Math.round(totalMxn * 100);
      const result = await this.paymentGateway.createAndConfirm({
        amountCents,
        currency: 'mxn',
        paymentMethodId: paymentMethod.provider_method_id,
        metadata: {
          tripId: orderId,
          passengerId: client.user_id,
          driverId: 'custody',
        },
      });

      return await this.repo.updateStatus(orderId, 'completed', {
        stripePaymentIntentId: result.id,
        paidAt: new Date(),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown_error';
      return await this.repo.updateStatus(orderId, 'failed', {
        failedReason: reason.slice(0, 255),
      });
    }
  }
}
