/**
 * PaymentMethodsService — unit tests
 *
 * StripeService and PaymentMethodsRepository are injected as mocks.
 * No real Stripe API calls are made.
 */

import { PaymentMethodsService } from '../../modules/users/payment-methods/payment-methods.service.js';
import { TechnicalError } from '../../shared/errors/technical-error.js';
import type { StripeService, SetupIntentResult } from '../../modules/users/payment-methods/stripe.service.js';
import type { PaymentMethodsRepository, PaymentMethod } from '../../modules/users/payment-methods/payment-methods.repository.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeStripeService(): jest.Mocked<StripeService> {
  return {
    createSetupIntent: jest.fn(),
  } as unknown as jest.Mocked<StripeService>;
}

function makePaymentMethodsRepo(): jest.Mocked<PaymentMethodsRepository> {
  return {
    findByUserId: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<PaymentMethodsRepository>;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const mockSetupIntentResult: SetupIntentResult = {
  clientSecret: 'seti_test_client_secret_xyz',
  setupIntentId: 'seti_test_xyz',
};

const mockPaymentMethod: PaymentMethod = {
  id: 'pm-uuid-001',
  passenger_id: 'user-uuid-001',
  provider_method_id: 'pm_stripe_abc123',
  last4: '4242',
  brand: 'visa',
  exp_month: 12,
  exp_year: 2027,
  is_default: false,
  deleted_at: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

// ---------------------------------------------------------------------------
// PaymentMethodsService.createSetupIntent
// ---------------------------------------------------------------------------

describe('PaymentMethodsService.createSetupIntent', () => {
  let stripe: ReturnType<typeof makeStripeService>;
  let repo: ReturnType<typeof makePaymentMethodsRepo>;
  let service: PaymentMethodsService;

  beforeEach(() => {
    stripe = makeStripeService();
    repo = makePaymentMethodsRepo();
    service = new PaymentMethodsService(stripe, repo);
  });

  it('calls stripe.createSetupIntent and returns clientSecret and setupIntentId', async () => {
    stripe.createSetupIntent.mockResolvedValue(mockSetupIntentResult);

    const result = await service.createSetupIntent('user-uuid-001');

    expect(stripe.createSetupIntent).toHaveBeenCalledTimes(1);
    expect(result.clientSecret).toBe('seti_test_client_secret_xyz');
    expect(result.setupIntentId).toBe('seti_test_xyz');
  });

  it('propagates TechnicalError when Stripe throws STRIPE_UNAVAILABLE', async () => {
    stripe.createSetupIntent.mockRejectedValue(
      new TechnicalError('STRIPE_UNAVAILABLE'),
    );

    await expect(service.createSetupIntent('user-uuid-001')).rejects.toThrow(
      TechnicalError,
    );
  });

  it('propagates any error thrown by StripeService', async () => {
    const cause = new Error('Network timeout');
    stripe.createSetupIntent.mockRejectedValue(cause);

    await expect(service.createSetupIntent('user-uuid-001')).rejects.toThrow('Network timeout');
  });
});

// ---------------------------------------------------------------------------
// PaymentMethodsService.listPaymentMethods
// ---------------------------------------------------------------------------

describe('PaymentMethodsService.listPaymentMethods', () => {
  let stripe: ReturnType<typeof makeStripeService>;
  let repo: ReturnType<typeof makePaymentMethodsRepo>;
  let service: PaymentMethodsService;

  beforeEach(() => {
    stripe = makeStripeService();
    repo = makePaymentMethodsRepo();
    service = new PaymentMethodsService(stripe, repo);
  });

  it('returns an empty array when user has no payment methods', async () => {
    repo.findByUserId.mockResolvedValue([]);

    const result = await service.listPaymentMethods('user-uuid-001');

    expect(result).toEqual([]);
    expect(repo.findByUserId).toHaveBeenCalledWith('user-uuid-001');
  });

  it('returns a PaymentMethodDTO[] when methods exist', async () => {
    repo.findByUserId.mockResolvedValue([mockPaymentMethod]);

    const result = await service.listPaymentMethods('user-uuid-001');

    expect(result).toHaveLength(1);
    // Use destructuring to satisfy noUncheckedIndexedAccess
    const [dto] = result;
    expect(dto).toBeDefined();
    if (!dto) return;
    expect(dto.id).toBe(mockPaymentMethod.id);
    expect(dto.provider).toBe('stripe');
    expect(dto.provider_method_id).toBe(mockPaymentMethod.provider_method_id);
    expect(dto.last4).toBe('4242');
    expect(dto.brand).toBe('visa');
    expect(dto.exp_month).toBe(12);
    expect(dto.exp_year).toBe(2027);
    expect(dto.is_default).toBe(false);
    // deleted_at, passenger_id should NOT be exposed in the DTO
    expect((dto as unknown as Record<string, unknown>)['deleted_at']).toBeUndefined();
    expect((dto as unknown as Record<string, unknown>)['passenger_id']).toBeUndefined();
  });

  it('maps multiple payment methods preserving order', async () => {
    const second: PaymentMethod = {
      ...mockPaymentMethod,
      id: 'pm-uuid-002',
      last4: '0000',
    };
    repo.findByUserId.mockResolvedValue([mockPaymentMethod, second]);

    const result = await service.listPaymentMethods('user-uuid-001');

    expect(result).toHaveLength(2);
    const [first, secondDto] = result;
    expect(first?.last4).toBe('4242');
    expect(secondDto?.last4).toBe('0000');
  });
});
