import type { StripeService, SetupIntentResult } from './stripe.service.js';
import type { PaymentMethodsRepository } from './payment-methods.repository.js';

// ---------------------------------------------------------------------------
// DTO
// ---------------------------------------------------------------------------

export interface PaymentMethodDTO {
  id: string;
  provider: 'stripe';
  provider_method_id: string;
  last4: string | null;
  brand: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * PaymentMethodsService — orchestrates Stripe interactions and persistence.
 *
 * ADR-017: createSetupIntent does NOT persist to DB in Sprint 2.
 * Persistence happens via webhook confirmation in Sprint 5.
 */
export class PaymentMethodsService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly paymentMethodsRepo: PaymentMethodsRepository,
  ) {}

  /**
   * Creates a Stripe SetupIntent and returns the client_secret so the
   * frontend can complete card collection with Stripe.js.
   *
   * Sprint 2: No DB write here — the webhook handler (Sprint 5) persists
   * the confirmed PaymentMethod after the customer completes the flow.
   */
  async createSetupIntent(_userId: string): Promise<SetupIntentResult> {
    return this.stripeService.createSetupIntent();
  }

  /**
   * Lists all saved payment methods for the authenticated user.
   * Maps DB rows to the public PaymentMethodDTO shape.
   */
  async listPaymentMethods(userId: string): Promise<PaymentMethodDTO[]> {
    const methods = await this.paymentMethodsRepo.findByUserId(userId);

    return methods.map((m) => ({
      id: m.id,
      provider: 'stripe' as const,
      provider_method_id: m.provider_method_id,
      last4: m.last4,
      brand: m.brand,
      exp_month: m.exp_month,
      exp_year: m.exp_year,
      is_default: m.is_default,
    }));
  }
}
