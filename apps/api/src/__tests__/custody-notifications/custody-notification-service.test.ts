/**
 * custody-notification-service.test.ts — unit tests for CustodyNotificationService
 *
 * Target: ≥ 80% lines / ≥ 75% branches
 *
 * All external dependencies (repo, pushChannel, smsClient, circuitBreaker, db)
 * are fully mocked — no I/O required.
 */

import type { Knex } from 'knex';
import { CustodyNotificationService } from '../../modules/custody-notifications/custody-notifications.service.js';
import type { CustodyNotificationsRepository } from '../../modules/custody-notifications/custody-notifications.repository.js';
import type { CircuitBreaker } from '../../modules/custody-notifications/circuit-breaker.js';
import type { INotificationChannel } from '../../modules/notifications/notification.channel.interface.js';
import type { ISmsClient } from '../../modules/custody-notifications/sms.client.js';
import type {
  CustodyNotification,
  SendCustodyNotificationPayload,
} from '../../modules/custody-notifications/custody-notifications.types.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeNotification(overrides: Partial<CustodyNotification> = {}): CustodyNotification {
  return {
    id: 'notif-1',
    user_id: 'user-1',
    order_id: null,
    alert_id: null,
    channel: 'push',
    priority: 'high',
    status: 'pending',
    title: 'Test title',
    body: 'Test body',
    sent_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRepo(overrides: Partial<jest.Mocked<CustodyNotificationsRepository>> = {}) {
  return {
    create: jest.fn().mockResolvedValue(makeNotification()),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    findByOrderId: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as jest.Mocked<CustodyNotificationsRepository>;
}

function makePushChannel(overrides: Partial<jest.Mocked<INotificationChannel>> = {}) {
  return {
    send: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<INotificationChannel>;
}

function makeSmsClient(overrides: Partial<jest.Mocked<ISmsClient>> = {}) {
  return {
    send: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<ISmsClient>;
}

function makeCircuitBreaker(overrides: Partial<jest.Mocked<CircuitBreaker>> = {}) {
  return {
    isOpen: jest.fn().mockResolvedValue(false),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue('closed'),
    ...overrides,
  } as unknown as jest.Mocked<CircuitBreaker>;
}

/**
 * Build a chainable Knex mock that resolves .where().select().first()
 * with the given phone value.
 */
function makeDb(userPhone: string | null = '+521234567890') {
  const firstFn = jest.fn().mockResolvedValue(userPhone !== undefined ? { phone: userPhone } : undefined);
  const selectFn = jest.fn().mockReturnValue({ first: firstFn });
  const whereFn = jest.fn().mockReturnValue({ select: selectFn });
  return jest.fn().mockReturnValue({ where: whereFn }) as unknown as Knex;
}

/** makeDb where the query resolves to undefined (user not found). */
function makeDbNoUser() {
  const firstFn = jest.fn().mockResolvedValue(undefined);
  const selectFn = jest.fn().mockReturnValue({ first: firstFn });
  const whereFn = jest.fn().mockReturnValue({ select: selectFn });
  return jest.fn().mockReturnValue({ where: whereFn }) as unknown as Knex;
}

// ---------------------------------------------------------------------------
// Base payload factories
// ---------------------------------------------------------------------------

function makePushPayload(overrides: Partial<SendCustodyNotificationPayload> = {}): SendCustodyNotificationPayload {
  return {
    user_id: 'user-1',
    channel: 'push',
    priority: 'high',
    title: 'Orden actualizada',
    body: 'Tu orden está en camino',
    ...overrides,
  };
}

function makeSmsPayload(overrides: Partial<SendCustodyNotificationPayload> = {}): SendCustodyNotificationPayload {
  return {
    user_id: 'user-1',
    channel: 'sms',
    priority: 'normal',
    title: 'SMS Alerta',
    body: 'Tu paquete fue recolectado',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Build service helper
// ---------------------------------------------------------------------------

function buildService(options: {
  repo?: jest.Mocked<CustodyNotificationsRepository>;
  push?: jest.Mocked<INotificationChannel>;
  sms?: jest.Mocked<ISmsClient>;
  cb?: jest.Mocked<CircuitBreaker>;
  db?: Knex;
} = {}) {
  const repo = options.repo ?? makeRepo();
  const push = options.push ?? makePushChannel();
  const sms = options.sms ?? makeSmsClient();
  const cb = options.cb ?? makeCircuitBreaker();
  const db = options.db ?? makeDb();
  const svc = new CustodyNotificationService(repo, push, sms, cb, db);
  return { svc, repo, push, sms, cb, db };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CustodyNotificationService', () => {
  // -------------------------------------------------------------------------
  // push channel — circuit closed (happy path)
  // -------------------------------------------------------------------------

  describe('channel=push, circuit closed', () => {
    it('calls pushChannel.send() and marks notification as sent', async () => {
      const { svc, repo, push, cb } = buildService();

      const result = await svc.send(makePushPayload());

      expect(push.send).toHaveBeenCalledTimes(1);
      expect(push.send).toHaveBeenCalledWith(
        expect.objectContaining({ recipientUserId: 'user-1', title: 'Orden actualizada' }),
      );
      expect(cb.recordSuccess).toHaveBeenCalledTimes(1);
      expect(repo.updateStatus).toHaveBeenCalledWith('notif-1', 'sent', expect.any(Date));
      expect(result.status).toBe('sent');
      expect(result.sent_at).not.toBeNull();
    });

    it('creates a pending notification record before sending', async () => {
      const { svc, repo } = buildService();

      await svc.send(makePushPayload({ order_id: 'order-99' }));

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending', user_id: 'user-1', order_id: 'order-99' }),
      );
    });

    it('passes alert_id and order_id as null when not provided', async () => {
      const { svc, repo } = buildService();

      await svc.send(makePushPayload());

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: null, alert_id: null }),
      );
    });

    it('forwards optional order_id and alert_id to repo.create', async () => {
      const { svc, repo } = buildService();

      await svc.send(makePushPayload({ order_id: 'order-1', alert_id: 'alert-1' }));

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ order_id: 'order-1', alert_id: 'alert-1' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // push channel — FCM fails, SMS fallback succeeds
  // -------------------------------------------------------------------------

  describe('channel=push, FCM fails, SMS fallback', () => {
    it('records failure and attempts SMS fallback when push throws', async () => {
      const push = makePushChannel({ send: jest.fn().mockRejectedValue(new Error('FCM error')) });
      const sms = makeSmsClient();
      const cb = makeCircuitBreaker();
      const db = makeDb('+521234567890');
      const { svc, repo } = buildService({ push, sms, cb, db });

      const result = await svc.send(makePushPayload());

      expect(cb.recordFailure).toHaveBeenCalledTimes(1);
      expect(sms.send).toHaveBeenCalledWith('+521234567890', 'Tu orden está en camino');
      expect(repo.updateStatus).toHaveBeenCalledWith('notif-1', 'sent', expect.any(Date));
      expect(result.status).toBe('sent');
    });

    it('status is "failed" when push fails AND user has no phone (SMS skipped)', async () => {
      const push = makePushChannel({ send: jest.fn().mockRejectedValue(new Error('FCM error')) });
      const sms = makeSmsClient();
      const cb = makeCircuitBreaker();
      const db = makeDb(null);
      const { svc, repo } = buildService({ push, sms, cb, db });

      const result = await svc.send(makePushPayload());

      expect(cb.recordFailure).toHaveBeenCalledTimes(1);
      expect(sms.send).not.toHaveBeenCalled();
      expect(repo.updateStatus).toHaveBeenCalledWith('notif-1', 'failed', undefined);
      expect(result.status).toBe('failed');
      expect(result.sent_at).toBeNull();
    });

    it('status is "failed" when push fails AND SMS also throws', async () => {
      const push = makePushChannel({ send: jest.fn().mockRejectedValue(new Error('FCM error')) });
      const sms = makeSmsClient({ send: jest.fn().mockRejectedValue(new Error('SMS error')) });
      const cb = makeCircuitBreaker();
      const db = makeDb('+521234567890');
      const { svc } = buildService({ push, sms, cb, db });

      const result = await svc.send(makePushPayload());

      expect(result.status).toBe('failed');
    });
  });

  // -------------------------------------------------------------------------
  // push channel — circuit open (skip FCM, go straight to SMS)
  // -------------------------------------------------------------------------

  describe('channel=push, circuit open', () => {
    it('skips pushChannel.send() and falls back to SMS directly', async () => {
      const push = makePushChannel();
      const sms = makeSmsClient();
      const cb = makeCircuitBreaker({ isOpen: jest.fn().mockResolvedValue(true) });
      const db = makeDb('+521234567890');
      const { svc, repo } = buildService({ push, sms, cb, db });

      const result = await svc.send(makePushPayload());

      expect(push.send).not.toHaveBeenCalled();
      expect(cb.recordSuccess).not.toHaveBeenCalled();
      expect(cb.recordFailure).not.toHaveBeenCalled();
      expect(sms.send).toHaveBeenCalledWith('+521234567890', 'Tu orden está en camino');
      expect(repo.updateStatus).toHaveBeenCalledWith('notif-1', 'sent', expect.any(Date));
      expect(result.status).toBe('sent');
    });

    it('status is "failed" when circuit open and user has no phone', async () => {
      const cb = makeCircuitBreaker({ isOpen: jest.fn().mockResolvedValue(true) });
      const db = makeDb(null);
      const { svc } = buildService({ cb, db });

      const result = await svc.send(makePushPayload());

      expect(result.status).toBe('failed');
    });
  });

  // -------------------------------------------------------------------------
  // sms channel — direct SMS delivery
  // -------------------------------------------------------------------------

  describe('channel=sms', () => {
    it('calls trySendSms with user phone and marks as sent', async () => {
      const sms = makeSmsClient();
      const db = makeDb('+521234567890');
      const { svc, repo } = buildService({ sms, db });

      const result = await svc.send(makeSmsPayload());

      expect(sms.send).toHaveBeenCalledWith('+521234567890', 'Tu paquete fue recolectado');
      expect(repo.updateStatus).toHaveBeenCalledWith('notif-1', 'sent', expect.any(Date));
      expect(result.status).toBe('sent');
    });

    it('status is "skipped" when user has no phone on record', async () => {
      const sms = makeSmsClient();
      const db = makeDb(null);
      const { svc, repo } = buildService({ sms, db });

      const result = await svc.send(makeSmsPayload());

      expect(sms.send).not.toHaveBeenCalled();
      expect(repo.updateStatus).toHaveBeenCalledWith('notif-1', 'skipped', undefined);
      expect(result.status).toBe('skipped');
    });

    it('status is "skipped" when user row is not found in db', async () => {
      const sms = makeSmsClient();
      const db = makeDbNoUser();
      const { svc, repo } = buildService({ sms, db });

      const result = await svc.send(makeSmsPayload());

      expect(sms.send).not.toHaveBeenCalled();
      expect(repo.updateStatus).toHaveBeenCalledWith('notif-1', 'skipped', undefined);
      expect(result.status).toBe('skipped');
    });

    it('status is "failed" when SMS client throws', async () => {
      const sms = makeSmsClient({ send: jest.fn().mockRejectedValue(new Error('SMS provider down')) });
      const db = makeDb('+521234567890');
      const { svc, repo } = buildService({ sms, db });

      const result = await svc.send(makeSmsPayload());

      expect(repo.updateStatus).toHaveBeenCalledWith('notif-1', 'failed', undefined);
      expect(result.status).toBe('failed');
    });

    it('does not call pushChannel.send() for sms channel', async () => {
      const push = makePushChannel();
      const db = makeDb('+52999');
      const { svc } = buildService({ push, db });

      await svc.send(makeSmsPayload());

      expect(push.send).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Return value shape
  // -------------------------------------------------------------------------

  describe('return value', () => {
    it('sent_at is ISO string when status=sent', async () => {
      const { svc } = buildService();

      const result = await svc.send(makePushPayload());

      expect(result.status).toBe('sent');
      expect(typeof result.sent_at).toBe('string');
      // Should be a valid ISO date
      expect(new Date(result.sent_at!).getTime()).not.toBeNaN();
    });

    it('sent_at is null when status=failed', async () => {
      const push = makePushChannel({ send: jest.fn().mockRejectedValue(new Error('err')) });
      const db = makeDb(null); // no SMS fallback
      const { svc } = buildService({ push, db });

      const result = await svc.send(makePushPayload());

      expect(result.status).toBe('failed');
      expect(result.sent_at).toBeNull();
    });

    it('merges notification record with updated status', async () => {
      const notification = makeNotification({ id: 'notif-xyz', user_id: 'user-2' });
      const repo = makeRepo({ create: jest.fn().mockResolvedValue(notification) });
      const { svc } = buildService({ repo, db: makeDb('+52000') });

      const result = await svc.send(makeSmsPayload({ user_id: 'user-2' }));

      expect(result.id).toBe('notif-xyz');
      expect(result.user_id).toBe('user-2');
    });
  });

  // -------------------------------------------------------------------------
  // updateStatus call arguments
  // -------------------------------------------------------------------------

  describe('repo.updateStatus call arguments', () => {
    it('passes sent_at Date when status=sent', async () => {
      const { svc, repo } = buildService();

      await svc.send(makePushPayload());

      const [id, status, sentAt] = (repo.updateStatus as jest.Mock).mock.calls[0];
      expect(id).toBe('notif-1');
      expect(status).toBe('sent');
      expect(sentAt).toBeInstanceOf(Date);
    });

    it('passes undefined for sent_at when status=failed', async () => {
      const push = makePushChannel({ send: jest.fn().mockRejectedValue(new Error('err')) });
      const db = makeDb(null);
      const { svc, repo } = buildService({ push, db });

      await svc.send(makePushPayload());

      const [, status, sentAt] = (repo.updateStatus as jest.Mock).mock.calls[0];
      expect(status).toBe('failed');
      expect(sentAt).toBeUndefined();
    });

    it('passes undefined for sent_at when status=skipped', async () => {
      const db = makeDb(null);
      const { svc, repo } = buildService({ db });

      await svc.send(makeSmsPayload());

      const [, status, sentAt] = (repo.updateStatus as jest.Mock).mock.calls[0];
      expect(status).toBe('skipped');
      expect(sentAt).toBeUndefined();
    });
  });
});
