import type { Database } from '../../config/database.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Payment {
  id: string;
  trip_id: string;
  passenger_id: string;
  driver_id: string;
  amount: number;
  tax_amount: number;
  platform_fee: number;
  driver_earnings: number;
  currency: string;
  status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  failure_reason: string | null;
  retry_count: number;
  charged_at: Date | null;
  refunded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaymentData {
  tripId: string;
  passengerId: string;
  driverId: string;
  amount: number;
  taxAmount: number;
  platformFee: number;
  driverEarnings: number;
  currency?: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class PaymentRepository {
  constructor(private readonly db: Database) {}

  async findByTripId(tripId: string): Promise<Payment | undefined> {
    return this.db<Payment>('payments').where({ trip_id: tripId }).first();
  }

  async create(data: CreatePaymentData): Promise<Payment> {
    const [row] = await this.db<Payment>('payments')
      .insert({
        trip_id: data.tripId,
        passenger_id: data.passengerId,
        driver_id: data.driverId,
        amount: data.amount,
        tax_amount: data.taxAmount,
        platform_fee: data.platformFee,
        driver_earnings: data.driverEarnings,
        currency: data.currency ?? 'MXN',
        status: 'pending',
      })
      .returning('*');

    if (!row) throw new Error('Failed to create payment: no row returned');
    return row;
  }

  async markCompleted(
    id: string,
    stripePaymentIntentId: string,
    stripeChargeId: string,
  ): Promise<void> {
    await this.db<Payment>('payments').where({ id }).update({
      status: 'completed',
      stripe_payment_intent_id: stripePaymentIntentId,
      stripe_charge_id: stripeChargeId,
      charged_at: new Date(),
      updated_at: new Date(),
    });
  }

  async markFailed(id: string, failureReason: string): Promise<void> {
    await this.db<Payment>('payments').where({ id }).update({
      status: 'failed',
      failure_reason: failureReason,
      retry_count: this.db.raw('retry_count + 1'),
      updated_at: new Date(),
    });
  }

  async createFailed(
    tripId: string,
    passengerId: string,
    driverId: string,
    failureReason: string,
  ): Promise<Payment> {
    const [row] = await this.db<Payment>('payments')
      .insert({
        trip_id: tripId,
        passenger_id: passengerId,
        driver_id: driverId,
        amount: 0,
        tax_amount: 0,
        platform_fee: 0,
        driver_earnings: 0,
        currency: 'MXN',
        status: 'failed',
        failure_reason: failureReason,
      })
      .returning('*');

    if (!row) throw new Error('Failed to create failed payment: no row returned');
    return row;
  }
}
