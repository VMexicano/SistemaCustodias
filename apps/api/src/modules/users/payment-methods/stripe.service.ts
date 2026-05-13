import Stripe from 'stripe';
import { TechnicalError } from '../../../shared/errors/technical-error.js';

export interface SetupIntentResult {
  clientSecret: string;
  setupIntentId: string;
}

/**
 * StripeService — thin wrapper around the Stripe SDK.
 *
 * ADR-017: Sprint 2 only creates SetupIntents (no PaymentIntents).
 * The actual charge flow is implemented in Sprint 5.
 */
export class StripeService {
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' });
  }

  /**
   * Creates a SetupIntent so the frontend can collect card details via Stripe.js.
   * The client_secret returned is safe to send to the client — it only authorises
   * saving the card, never charging it.
   *
   * MVP note: created without a Stripe Customer. Customer association is handled
   * in Sprint 5 when the full payment flow is implemented.
   *
   * @throws TechnicalError (502) if the Stripe API is unavailable.
   */
  async createSetupIntent(customerId?: string): Promise<SetupIntentResult> {
    try {
      const params: Stripe.SetupIntentCreateParams = {
        usage: 'off_session',
        ...(customerId !== undefined && { customer: customerId }),
      };

      const setupIntent = await this.stripe.setupIntents.create(params);

      if (!setupIntent.client_secret) {
        throw new TechnicalError('STRIPE_UNAVAILABLE');
      }

      return {
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      };
    } catch (err) {
      // Re-throw TechnicalErrors as-is (e.g. missing client_secret case above)
      if (err instanceof TechnicalError) {
        throw err;
      }
      throw new TechnicalError('STRIPE_UNAVAILABLE', err);
    }
  }
}
