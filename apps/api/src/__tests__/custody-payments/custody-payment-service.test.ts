/**
 * custody-payment-service.test.ts — unit tests for CustodyPaymentService
 *
 * Target: ≥ 80% lines / ≥ 75% branches
 *
 * All external dependencies (repo, paymentGateway, db) are fully mocked —
 * no real database or Stripe calls are made.
 */

import type { Knex } from 'knex';
import { CustodyPaymentService } from '../../modules/custody-payments/custody-payments.service.js';
import type { CustodyPaymentsRepository } from '../../modules/custody-payments/custody-payments.repository.js';
import type { IPaymentGateway } from '../../modules/payments/payment.gateway.interface.js';
import type { CustodyPayment } from '../../modules/custody-payments/custody-payments.types.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeCustodyPayment(overrides: Partial<CustodyPayment> = {}): CustodyPayment {
  return {
    id: 'cpay-1',
    order_id: 'order-1',
    amount_mxn: '1500.00',
    status: 'pending',
    stripe_payment_intent_id: null,
    paid_at: null,
    failed_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeOrder(overrides: Partial<{
  id: string;
  status: string;
  client_id: string;
  pricing_snapshot: { total_mxn?: number } | null;
}> = {}) {
  return {
    id: 'order-1',
    status: 'COMPLETED',
    client_id: 'client-1',
    pricing_snapshot: { total_mxn: 1500 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeRepo(
  existing?: CustodyPayment,
): jest.Mocked<CustodyPaymentsRepository> {
  const created = makeCustodyPayment({ status: 'processing' });
  const updated = makeCustodyPayment({ status: 'completed' });
  return {
    findByOrderId: jest.fn().mockResolvedValue(existing ?? undefined),
    create: jest.fn().mockResolvedValue(created),
    updateStatus: jest.fn().mockResolvedValue(updated),
  } as unknown as jest.Mocked<CustodyPaymentsRepository>;
}

function makeGateway(shouldFail = false): jest.Mocked<IPaymentGateway> {
  return {
    createAndConfirm: jest.fn().mockImplementation(() => {
      if (shouldFail) {
        return Promise.reject(new Error('card_declined'));
      }
      return Promise.resolve({ id: 'pi_test_123', chargeId: 'ch_test_456', status: 'succeeded' });
    }),
  } as unknown as jest.Mocked<IPaymentGateway>;
}

/**
 * Build a chainable Knex mock.
 *
 * The service performs these call chains:
 *   db('custody_orders').where({id}).first()
 *   db('clients').where({id}).select('user_id').first()
 *   db('passenger_payment_methods').where({...}).whereNull('deleted_at').orderBy(...).orderBy(...).select(...).first()
 *
 * makeDb accepts an ordered list of values that .first() should return,
 * one per db(table) call in order of invocation.
 */
function makeDb(...firstValues: (object | undefined)[]): Knex {
  let callIndex = 0;
  const makeQueryBuilder = () => {
    const idx = callIndex++;
    const resolvedValue = firstValues[idx];
    const qb = {
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(resolvedValue),
    };
    return qb;
  };
  const db = jest.fn().mockImplementation(makeQueryBuilder);
  return db as unknown as Knex;
}

// ---------------------------------------------------------------------------
// Build service helper
// ---------------------------------------------------------------------------

interface BuildServiceOptions {
  repo?: jest.Mocked<CustodyPaymentsRepository>;
  gateway?: jest.Mocked<IPaymentGateway>;
  db?: Knex;
}

function buildService(options: BuildServiceOptions = {}) {
  const repo = options.repo ?? makeRepo();
  const gateway = options.gateway ?? makeGateway();
  const db = options.db ?? makeDb(makeOrder(), { user_id: 'user-1' }, { provider_method_id: 'pm_card_visa' });
  const svc = new CustodyPaymentService(repo, gateway, db);
  return { svc, repo, gateway, db };
}

// ---------------------------------------------------------------------------
// Tests — CustodyPaymentService.getByOrderId()
// ---------------------------------------------------------------------------

describe('CustodyPaymentService', () => {
  describe('getByOrderId()', () => {
    it('returns the payment when it exists', async () => {
      const payment = makeCustodyPayment({ status: 'completed' });
      const { svc } = buildService({ repo: makeRepo(payment) });

      const result = await svc.getByOrderId('order-1');

      expect(result).toEqual(payment);
    });

    it('throws PAYMENT_NOT_FOUND when the payment does not exist', async () => {
      const repo = makeRepo(undefined);
      repo.findByOrderId.mockResolvedValue(undefined);
      const { svc } = buildService({ repo });

      await expect(svc.getByOrderId('order-999')).rejects.toMatchObject({
        code: 'PAYMENT_NOT_FOUND',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Tests — CustodyPaymentService.processPayment()
  // ---------------------------------------------------------------------------

  describe('processPayment()', () => {
    // --- Guard: order existence ---

    it('throws ORDER_NOT_FOUND when the custody order does not exist', async () => {
      const db = makeDb(undefined); // custody_orders query returns undefined
      const { svc } = buildService({ db });

      await expect(svc.processPayment('order-missing')).rejects.toMatchObject({
        code: 'ORDER_NOT_FOUND',
      });
    });

    // --- Guard: order status ---

    it('throws INVALID_ORDER_STATUS_FOR_PAYMENT when order status is not COMPLETED', async () => {
      const db = makeDb(makeOrder({ status: 'ASSIGNED' }));
      const { svc } = buildService({ db });

      await expect(svc.processPayment('order-1')).rejects.toMatchObject({
        code: 'INVALID_ORDER_STATUS_FOR_PAYMENT',
      });
    });

    // --- Idempotency ---

    it('returns the existing payment without charging again when already completed', async () => {
      const existing = makeCustodyPayment({ status: 'completed' });
      const repo = makeRepo(existing);
      const gateway = makeGateway();
      const db = makeDb(makeOrder()); // only custody_orders needed — short-circuits after idempotency check

      const { svc } = buildService({ repo, gateway, db });
      const result = await svc.processPayment('order-1');

      expect(result).toEqual(existing);
      expect(gateway.createAndConfirm).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    // --- Pricing snapshot missing ---

    it('creates failed payment with pricing_snapshot_missing when total_mxn is null', async () => {
      const db = makeDb(makeOrder({ pricing_snapshot: null }));
      const repo = makeRepo(undefined); // no existing payment
      const failedPayment = makeCustodyPayment({ status: 'failed', failed_reason: 'pricing_snapshot_missing' });
      repo.create.mockResolvedValue(failedPayment);

      const { svc } = buildService({ repo, db });
      const result = await svc.processPayment('order-1');

      expect(result.status).toBe('failed');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1', amountMxn: 0, status: 'failed' }),
      );
    });

    it('updates existing payment to failed with pricing_snapshot_missing when total_mxn is 0', async () => {
      const existing = makeCustodyPayment({ status: 'processing' });
      const repo = makeRepo(existing);
      const db = makeDb(makeOrder({ pricing_snapshot: { total_mxn: 0 } }));
      const failedPayment = makeCustodyPayment({ status: 'failed', failed_reason: 'pricing_snapshot_missing' });
      repo.updateStatus.mockResolvedValue(failedPayment);

      const { svc } = buildService({ repo, db });
      const result = await svc.processPayment('order-1');

      expect(result.status).toBe('failed');
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'failed',
        expect.objectContaining({ failedReason: 'pricing_snapshot_missing' }),
      );
      expect(repo.create).not.toHaveBeenCalled();
    });

    // --- Client not found ---

    it('creates failed payment with client_not_found when client does not exist', async () => {
      // db call order: custody_orders → clients (returns undefined)
      const db = makeDb(makeOrder(), undefined);
      const repo = makeRepo(undefined);
      const failedPayment = makeCustodyPayment({ status: 'failed', failed_reason: 'client_not_found' });
      repo.create.mockResolvedValue(failedPayment);

      const { svc } = buildService({ repo, db });
      const result = await svc.processPayment('order-1');

      expect(result.status).toBe('failed');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('updates existing payment to failed with client_not_found when client does not exist', async () => {
      const existing = makeCustodyPayment({ status: 'processing' });
      const repo = makeRepo(existing);
      const db = makeDb(makeOrder(), undefined);
      const failedPayment = makeCustodyPayment({ status: 'failed', failed_reason: 'client_not_found' });
      repo.updateStatus.mockResolvedValue(failedPayment);

      const { svc } = buildService({ repo, db });
      const result = await svc.processPayment('order-1');

      expect(result.status).toBe('failed');
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'failed',
        expect.objectContaining({ failedReason: 'client_not_found' }),
      );
    });

    // --- No payment method ---

    it('creates failed payment with no_payment_method_on_file when no payment method exists', async () => {
      // db call order: custody_orders → clients (found) → passenger_payment_methods (undefined)
      const db = makeDb(makeOrder(), { user_id: 'user-1' }, undefined);
      const repo = makeRepo(undefined);
      const failedPayment = makeCustodyPayment({ status: 'failed', failed_reason: 'no_payment_method_on_file' });
      repo.create.mockResolvedValue(failedPayment);

      const { svc } = buildService({ repo, db });
      const result = await svc.processPayment('order-1');

      expect(result.status).toBe('failed');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('updates existing payment to failed with no_payment_method_on_file when no payment method exists', async () => {
      const existing = makeCustodyPayment({ status: 'processing' });
      const repo = makeRepo(existing);
      const db = makeDb(makeOrder(), { user_id: 'user-1' }, undefined);
      const failedPayment = makeCustodyPayment({ status: 'failed', failed_reason: 'no_payment_method_on_file' });
      repo.updateStatus.mockResolvedValue(failedPayment);

      const { svc } = buildService({ repo, db });
      const result = await svc.processPayment('order-1');

      expect(result.status).toBe('failed');
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'failed',
        expect.objectContaining({ failedReason: 'no_payment_method_on_file' }),
      );
    });

    // --- Happy path: gateway succeeds ---

    it('completes payment and returns result with stripePaymentIntentId when gateway succeeds', async () => {
      const gateway = makeGateway(false);
      const repo = makeRepo(undefined); // no existing payment
      const processingPayment = makeCustodyPayment({ status: 'processing' });
      const completedPayment = makeCustodyPayment({
        status: 'completed',
        stripe_payment_intent_id: 'pi_test_123',
        paid_at: new Date().toISOString(),
      });
      repo.create.mockResolvedValue(processingPayment);
      repo.updateStatus.mockResolvedValueOnce(completedPayment);

      const db = makeDb(makeOrder(), { user_id: 'user-1' }, { provider_method_id: 'pm_card_visa' });

      const { svc } = buildService({ repo, gateway, db });
      const result = await svc.processPayment('order-1');

      expect(result.status).toBe('completed');
      expect(result.stripe_payment_intent_id).toBe('pi_test_123');

      // Verify gateway was called with correct params
      expect(gateway.createAndConfirm).toHaveBeenCalledTimes(1);
      expect(gateway.createAndConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 150000, // Math.round(1500 * 100)
          currency: 'mxn',
          paymentMethodId: 'pm_card_visa',
          metadata: expect.objectContaining({
            tripId: 'order-1',
            passengerId: 'user-1',
            driverId: 'custody',
          }),
        }),
      );

      // Verify payment was created as processing first
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-1', amountMxn: 1500, status: 'processing' }),
      );

      // Verify final updateStatus call with completed
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'completed',
        expect.objectContaining({ stripePaymentIntentId: 'pi_test_123' }),
      );
    });

    it('updates existing payment through processing to completed when gateway succeeds', async () => {
      const existing = makeCustodyPayment({ status: 'pending' });
      const gateway = makeGateway(false);
      const repo = makeRepo(existing);
      const processingPayment = makeCustodyPayment({ status: 'processing' });
      const completedPayment = makeCustodyPayment({ status: 'completed', stripe_payment_intent_id: 'pi_test_123' });
      repo.updateStatus
        .mockResolvedValueOnce(processingPayment)  // first call: → processing
        .mockResolvedValueOnce(completedPayment);   // second call: → completed

      const db = makeDb(makeOrder(), { user_id: 'user-1' }, { provider_method_id: 'pm_card_visa' });

      const { svc } = buildService({ repo, gateway, db });
      const result = await svc.processPayment('order-1');

      expect(result.status).toBe('completed');
      expect(repo.create).not.toHaveBeenCalled();
      // First updateStatus: set to processing
      expect(repo.updateStatus).toHaveBeenNthCalledWith(1, 'order-1', 'processing');
      // Second updateStatus: set to completed with stripePaymentIntentId
      expect(repo.updateStatus).toHaveBeenNthCalledWith(
        2,
        'order-1',
        'completed',
        expect.objectContaining({ stripePaymentIntentId: 'pi_test_123' }),
      );
    });

    // --- Gateway failure ---

    it('marks payment as failed with truncated error message when gateway throws', async () => {
      const gateway = makeGateway(true); // throws 'card_declined'
      const repo = makeRepo(undefined);
      const processingPayment = makeCustodyPayment({ status: 'processing' });
      const failedPayment = makeCustodyPayment({ status: 'failed', failed_reason: 'card_declined' });
      repo.create.mockResolvedValue(processingPayment);
      repo.updateStatus.mockResolvedValue(failedPayment);

      const db = makeDb(makeOrder(), { user_id: 'user-1' }, { provider_method_id: 'pm_card_visa' });

      const { svc } = buildService({ repo, gateway, db });
      const result = await svc.processPayment('order-1');

      expect(result.status).toBe('failed');
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'failed',
        expect.objectContaining({ failedReason: 'card_declined' }),
      );
    });

    it('truncates gateway error message to 255 characters', async () => {
      const longMessage = 'x'.repeat(300);
      const gateway: jest.Mocked<IPaymentGateway> = {
        createAndConfirm: jest.fn().mockRejectedValue(new Error(longMessage)),
      } as unknown as jest.Mocked<IPaymentGateway>;

      const repo = makeRepo(undefined);
      const processingPayment = makeCustodyPayment({ status: 'processing' });
      repo.create.mockResolvedValue(processingPayment);

      const db = makeDb(makeOrder(), { user_id: 'user-1' }, { provider_method_id: 'pm_card_visa' });

      const { svc } = buildService({ repo, gateway, db });
      await svc.processPayment('order-1');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'failed',
        expect.objectContaining({
          failedReason: 'x'.repeat(255),
        }),
      );
    });

    it('handles non-Error gateway rejection and uses "unknown_error" as failedReason', async () => {
      const gateway: jest.Mocked<IPaymentGateway> = {
        createAndConfirm: jest.fn().mockRejectedValue('raw string error'),
      } as unknown as jest.Mocked<IPaymentGateway>;

      const repo = makeRepo(undefined);
      const processingPayment = makeCustodyPayment({ status: 'processing' });
      repo.create.mockResolvedValue(processingPayment);

      const db = makeDb(makeOrder(), { user_id: 'user-1' }, { provider_method_id: 'pm_card_visa' });

      const { svc } = buildService({ repo, gateway, db });
      await svc.processPayment('order-1');

      expect(repo.updateStatus).toHaveBeenCalledWith(
        'order-1',
        'failed',
        expect.objectContaining({ failedReason: 'unknown_error' }),
      );
    });

    it('rounds total_mxn correctly to cents for gateway call', async () => {
      const gateway = makeGateway(false);
      const repo = makeRepo(undefined);
      repo.create.mockResolvedValue(makeCustodyPayment({ status: 'processing' }));

      // 99.99 MXN → 9999 cents (Math.round(99.99 * 100))
      const db = makeDb(
        makeOrder({ pricing_snapshot: { total_mxn: 99.99 } }),
        { user_id: 'user-1' },
        { provider_method_id: 'pm_card_visa' },
      );

      const { svc } = buildService({ repo, gateway, db });
      await svc.processPayment('order-1');

      expect(gateway.createAndConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 9999 }),
      );
    });
  });
});
