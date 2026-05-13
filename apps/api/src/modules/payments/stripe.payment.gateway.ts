import Stripe from 'stripe';
import { TechnicalError } from '../../shared/errors/technical-error.js';
import type {
  IPaymentGateway,
  CreatePaymentIntentParams,
  PaymentIntentResult,
} from './payment.gateway.interface.js';

/**
 * StripePaymentGateway — Stripe implementation of IPaymentGateway.
 *
 * Stripe test mode is activated automatically when STRIPE_SECRET_KEY=sk_test_xxx.
 * No code changes needed between test and live environments (ADR-017).
 *
 * Off-session flow:
 *   - If customerId is provided: off_session: true (proper saved-card flow)
 *   - If not: confirm without off_session (test mode only — MVP simplification)
 */
export class StripePaymentGateway implements IPaymentGateway {
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
  }

  async createAndConfirm(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    try {
      const intentParams: Stripe.PaymentIntentCreateParams = {
        amount: params.amountCents,
        currency: params.currency,
        payment_method: params.paymentMethodId,
        confirm: true,
        metadata: params.metadata,
      };

      if (params.customerId) {
        intentParams.customer = params.customerId;
        intentParams.off_session = true;
      }

      const intent = await this.stripe.paymentIntents.create(intentParams);

      const chargeId =
        typeof intent.latest_charge === 'string'
          ? intent.latest_charge
          : (intent.latest_charge as Stripe.Charge | null)?.id ?? '';

      return {
        id: intent.id,
        chargeId,
        status: intent.status,
      };
    } catch (err) {
      if (err instanceof TechnicalError) throw err;
      throw new TechnicalError('STRIPE_UNAVAILABLE', err);
    }
  }
}
