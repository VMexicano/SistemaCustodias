import { BusinessError } from '../../shared/errors/business-error.js';
import type { TripsRepository } from '../trips/trips.repository.js';
import type { PaymentMethodsRepository } from '../users/payment-methods/payment-methods.repository.js';
import type { IPaymentGateway } from './payment.gateway.interface.js';
import type { Payment, PaymentRepository } from './payment.repository.js';
import type { PricingSnapshot } from '../pricing/pricing.types.js';

// ---------------------------------------------------------------------------
// PaymentService
// ---------------------------------------------------------------------------

/**
 * PaymentService — orchestrates trip payment via IPaymentGateway.
 *
 * Flow:
 *   1. Fetch trip (must be COMPLETED)
 *   2. Fetch passenger's default payment method
 *   3. Insert payment record (status: pending)
 *   4. Charge via gateway (circuit breaker lives in the worker)
 *   5. Mark completed or failed
 *
 * R-PAY-001: If gateway fails, trip remains COMPLETED — never revert trip state.
 * R-PAY-003: Never store raw card numbers — only pm_xxx IDs.
 */
export class PaymentService {
  constructor(
    private readonly paymentRepo: PaymentRepository,
    private readonly paymentMethodsRepo: PaymentMethodsRepository,
    private readonly tripsRepo: TripsRepository,
    private readonly gateway: IPaymentGateway,
  ) {}

  /**
   * Charge the passenger for a completed trip.
   *
   * Throws on business errors — worker retries on technical errors.
   */
  async charge(tripId: string): Promise<{ paymentId: string; status: string }> {
    // 1. Fetch and validate trip
    const trip = await this.tripsRepo.findById(tripId);
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
    }
    if (trip.status !== 'COMPLETED') {
      throw new BusinessError('TRIP_NOT_CHARGEABLE', `Trip ${tripId} is not COMPLETED`);
    }
    if (!trip.driver_id) {
      throw new BusinessError('TRIP_NOT_CHARGEABLE', 'Trip has no assigned driver');
    }

    // 2. Check for existing payment — idempotency
    const existing = await this.paymentRepo.findByTripId(tripId);
    if (existing && existing.status === 'completed') {
      throw new BusinessError('PAYMENT_ALREADY_PROCESSED', `Trip ${tripId} already charged`);
    }

    // 3. Fetch passenger's payment method
    const paymentMethods = await this.paymentMethodsRepo.findByUserId(trip.passenger_id);
    const defaultMethod = paymentMethods.find((pm) => pm.is_default) ?? paymentMethods[0];

    if (!defaultMethod) {
      // No payment method — create failed record immediately, no retry
      await this.paymentRepo.createFailed(
        tripId,
        trip.passenger_id,
        trip.driver_id,
        'NO_PAYMENT_METHOD',
      );
      return { paymentId: '', status: 'failed' };
    }

    // 4. Extract amounts from pricing_snapshot
    const snapshot = trip.pricing_snapshot as PricingSnapshot;
    const taxAmount = (snapshot as { tax_amount?: number }).tax_amount ?? 0;
    const platformFee = (snapshot as { commission_amount?: number }).commission_amount ?? 0;
    const driverEarnings = (snapshot as { driver_earnings?: number }).driver_earnings ?? 0;
    const finalFare = trip.final_fare ?? trip.estimated_fare ?? 0;

    // 5. Create payment record (pending)
    const payment = existing ?? await this.paymentRepo.create({
      tripId,
      passengerId: trip.passenger_id,
      driverId: trip.driver_id,
      amount: finalFare,
      taxAmount,
      platformFee,
      driverEarnings,
      currency: 'MXN',
    });

    // 6. Charge via gateway — technical errors bubble up for BullMQ to retry
    try {
      const result = await this.gateway.createAndConfirm({
        amountCents: Math.round(finalFare * 100),
        currency: 'mxn',
        customerId: (defaultMethod as { stripe_customer_id?: string }).stripe_customer_id,
        paymentMethodId: defaultMethod.provider_method_id,
        metadata: {
          tripId,
          passengerId: trip.passenger_id,
          driverId: trip.driver_id,
        },
      });

      await this.paymentRepo.markCompleted(payment.id, result.id, result.chargeId);
      return { paymentId: payment.id, status: 'completed' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await this.paymentRepo.markFailed(payment.id, reason);
      throw err; // re-throw so BullMQ retries the job
    }
  }

  async getPaymentByTripId(tripId: string, requesterId: string): Promise<Payment> {
    // Verify trip exists
    const trip = await this.tripsRepo.findById(tripId);
    if (!trip) {
      throw new BusinessError('TRIP_NOT_FOUND', `Trip ${tripId} not found`);
    }

    // Only the passenger can query their payment
    if (trip.passenger_id !== requesterId) {
      throw new BusinessError('FORBIDDEN', 'Only the trip passenger can view the payment');
    }

    const payment = await this.paymentRepo.findByTripId(tripId);
    if (!payment) {
      throw new BusinessError('PAYMENT_NOT_FOUND', `No payment found for trip ${tripId}`);
    }

    return payment;
  }
}
