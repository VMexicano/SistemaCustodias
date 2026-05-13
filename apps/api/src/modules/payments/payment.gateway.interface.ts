/**
 * IPaymentGateway — abstraction for payment processing (ADR-027).
 *
 * Implementations:
 *  - StripePaymentGateway  → production (Stripe PaymentIntent)
 *  - MockPaymentGateway    → tests (in-memory, no network)
 *
 * Selection is handled by app.ts — never inside this interface.
 */

export interface CreatePaymentIntentParams {
  /** Amount in MXN cents (final_fare * 100, rounded). */
  amountCents: number;
  /** ISO 4217 currency code — always 'mxn' for MVP. */
  currency: string;
  /** Stripe Customer ID (cus_xxx) — optional for test mode. */
  customerId?: string;
  /** Stripe PaymentMethod ID (pm_xxx) saved via SetupIntent in Sprint 2. */
  paymentMethodId: string;
  /** Immutable metadata attached to the PaymentIntent on Stripe. */
  metadata: {
    tripId: string;
    passengerId: string;
    driverId: string;
  };
}

export interface PaymentIntentResult {
  /** Stripe PaymentIntent ID — pi_xxx */
  id: string;
  /** Stripe Charge ID — ch_xxx (nullable: present only when status = succeeded) */
  chargeId: string;
  /** Stripe status string: 'succeeded' | 'requires_action' | etc. */
  status: string;
}

export interface IPaymentGateway {
  createAndConfirm(params: CreatePaymentIntentParams): Promise<PaymentIntentResult>;
}
